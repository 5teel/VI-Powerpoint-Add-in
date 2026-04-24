/**
 * Phase 6 D-05 / D-07 / D-09 multi-slide section orchestrator.
 *
 * Pipeline per user question routed as "section-plan":
 * 1. planSection (metaComposer.ts) — Sonnet 4.6 streams SectionPlan.
 * 2. Fan out per-slide: composeWithRetry → vegaRender (if chartSpec) → insertSlide.
 *    - Concurrency cap = 2 (06-RESEARCH §Pattern 4 — stays under Tier-1 RPM).
 *    - Insertion mutex serializes insertSlide calls in plan order.
 * 3. Outer AbortController aborts every inner operation silently on Stop.
 *
 * Lifecycle callbacks fire through onMiniChange(idx, state) — the React host
 * (SectionStrip.tsx, wave 5) maps this into per-mini-preview state. Already-
 * inserted slides remain in the deck on abort (D-09).
 *
 * Defense-in-depth: even though SectionPlanSchema caps slides at max(6), we
 * hard-clamp via `slice(0, 6)` here too (Pitfall 3) before spawning work.
 *
 * sectionStyle is threaded into each per-slide composer call's USER content
 * (NOT system prompt) per Pitfall 8 — keeps the Phase 5 composer system-prompt
 * byte-invariant so the ephemeral cache hit rate stays high.
 */
import { planSection, type SectionPlan } from "./metaComposer";
import { composeWithRetry } from "./compositionRetry";
import type { CompositionPlan } from "./compositionSchema";
import type { CubeSqlApiToolCall } from "./cubeai";
import { renderVegaToBase64Png } from "./vegaRenderer";
import { insertSlide } from "./slideRenderer";
import { logEvent } from "./telemetry";
import type { ComposedSlideContent } from "../slide/types";

export type MiniPreviewStatus =
  | "pending"
  | "fetching-data"
  | "composing"
  | "rendering"
  | "done"
  | "error"
  | "cancelled";

export interface MiniPreviewState {
  status: MiniPreviewStatus;
  title?: string;
  error?: string;
}

export interface SectionOrchestratorInput {
  userQuestion: string;
  toolCall: CubeSqlApiToolCall;
  cubeRows: unknown[];
  commentary: string;
}

export interface SectionOrchestratorCallbacks {
  onSectionPlan: (plan: SectionPlan) => void;
  onMiniChange: (idx: number, state: MiniPreviewState) => void;
  onAllDone: () => void;
  onPlanError: (err: Error) => void;
}

/**
 * SerialMutex (ordered variant): N pre-allocated slots so slide i+1's body runs
 * only after slide i's body resolves. Unlike a generic FIFO mutex where order
 * depends on WHEN each caller invokes run(), this variant preserves PLAN ORDER
 * regardless of which slide's composition finishes first. D-07 requires PowerPoint
 * insertion in plan order even when composition timing is out-of-order.
 */
class OrderedInsertionMutex {
  private readonly predecessors: Array<Promise<void>>;
  private readonly releasers: Array<() => void>;
  constructor(slotCount: number) {
    this.predecessors = [];
    this.releasers = [];
    for (let i = 0; i < slotCount; i++) {
      let release!: () => void;
      const p = new Promise<void>((r) => (release = r));
      this.predecessors.push(p);
      this.releasers.push(release);
    }
  }
  /**
   * Run `fn` after slot (idx-1) has released. Slot 0 runs immediately.
   * Always releases slot `idx` — even on error — so successors are not deadlocked.
   */
  async run<T>(idx: number, fn: () => Promise<T>): Promise<T> {
    if (idx > 0) await this.predecessors[idx - 1];
    try {
      return await fn();
    } finally {
      this.releasers[idx]();
    }
  }
  /** Short-circuit release — used when a slide aborts/fails before entering run(). */
  skip(idx: number): void {
    this.releasers[idx]();
  }
}

// ───────── Semaphore: N-slot concurrency limit. ─────────
class Semaphore {
  private slots: number;
  private queue: Array<() => void> = [];
  constructor(slots: number) {
    this.slots = slots;
  }
  async acquire(): Promise<void> {
    if (this.slots > 0) {
      this.slots--;
      return;
    }
    await new Promise<void>((r) => this.queue.push(r));
    this.slots--;
  }
  release(): void {
    this.slots++;
    const next = this.queue.shift();
    if (next) next();
  }
}

const CONCURRENCY_CAP = 2;
const HARD_CAP_SLIDES = 6;

/**
 * Returns the outer AbortController. Caller (SectionStrip.tsx, wave 5) holds
 * it and calls .abort() when the user presses Stop (D-09).
 */
export function orchestrateSection(
  input: SectionOrchestratorInput,
  cb: SectionOrchestratorCallbacks
): AbortController {
  const outer = new AbortController();
  const startMs = performance.now();

  void (async () => {
    // ── Stage A: plan the section.
    let plan: SectionPlan;
    try {
      plan = await new Promise<SectionPlan>((resolve, reject) => {
        let settled = false;
        planSection(
          {
            userQuestion: input.userQuestion,
            cubeMeta: {
              queryTitle: input.toolCall.input.queryTitle,
              description: input.toolCall.input.description,
              commentary: input.commentary,
              chartCategory: input.toolCall.input.chartCategory,
            },
            signal: outer.signal,
          },
          {
            onPartialPlan: () => {
              // SectionStrip could consume partials later; wave-3 scope = final only.
            },
            onFinal: (p) => {
              if (!settled) {
                settled = true;
                resolve(p);
              }
            },
            onError: (e) => {
              if (!settled) {
                settled = true;
                reject(e);
              }
            },
          }
        );
      });
    } catch (err) {
      if (outer.signal.aborted) return; // silent abort
      cb.onPlanError(err as Error);
      return;
    }

    // Defense-in-depth hard clamp (Pitfall 3).
    const slides = plan.slides.slice(0, HARD_CAP_SLIDES);
    const clampedPlan: SectionPlan = { ...plan, slides };

    logEvent("section_planned", {
      slideCount: slides.length,
      sectionTitle: clampedPlan.sectionTitle,
      elapsedMs: Math.round(performance.now() - startMs),
    });
    cb.onSectionPlan(clampedPlan);

    // Initial state: every slide is pending, with its titleHint.
    slides.forEach((s, i) =>
      cb.onMiniChange(i, { status: "pending", title: s.titleHint })
    );

    // ── Stage B: fan out per-slide work with bounded parallelism + insertion mutex.
    const insertionMutex = new OrderedInsertionMutex(slides.length);
    const semaphore = new Semaphore(CONCURRENCY_CAP);

    const slideTasks = slides.map((slideEntry, idx) =>
      (async () => {
        // `enteredMutex` flips true just before insertionMutex.run fires. If the
        // slide bails out earlier (abort, compose error, render error), we must
        // release this slot's releaser so successor slides aren't deadlocked.
        let enteredMutex = false;
        await semaphore.acquire();
        try {
          if (outer.signal.aborted) {
            cb.onMiniChange(idx, { status: "cancelled", title: slideEntry.titleHint });
            return;
          }

          cb.onMiniChange(idx, { status: "fetching-data", title: slideEntry.titleHint });
          // Data already fetched (input.cubeRows) — no per-slide re-fetch. Phase 6
          // scope: a section shares the SAME Cube rows across all slides. A future
          // phase may add per-slide dataSubset filtering via Cube REST re-queries.

          cb.onMiniChange(idx, { status: "composing", title: slideEntry.titleHint });

          // D-08: sectionStyle threaded into USER content (Pitfall 8 — keeps
          // Phase 5 composer system-prompt cache hit rate invariant).
          const sectionStyleContext =
            `SECTION STYLE (LOCKED — every slide in this section must respect this):\n` +
            `- Palette: ${clampedPlan.sectionStyle.palette.join(", ")}\n` +
            `- Accent: ${clampedPlan.sectionStyle.accentColor}\n` +
            `- Type scale: ${clampedPlan.sectionStyle.typeScale}\n` +
            `- Chart side: ${clampedPlan.sectionStyle.layoutConventions.preferChartSide}\n` +
            `- Commentary position: ${clampedPlan.sectionStyle.layoutConventions.commentaryPosition}\n\n` +
            `This slide's intent: ${slideEntry.intent}\n` +
            `Proposed title: ${slideEntry.titleHint}\n` +
            `Data subset focus: ${slideEntry.dataSubset ?? "full dataset"}\n\n` +
            `Original question: ${input.userQuestion}`;

          let finalPlan: CompositionPlan | null = null;
          await composeWithRetry(
            {
              userQuestion: sectionStyleContext,
              cubeMeta: {
                queryTitle: input.toolCall.input.queryTitle,
                description: input.toolCall.input.description,
                vegaSpec: input.toolCall.input.vegaSpec,
                tableChartSpec: input.toolCall.input.tableChartSpec,
                commentary: input.commentary,
              },
              rows: input.cubeRows,
              canvas: { widthPx: 960, heightPx: 540 },
              signal: outer.signal,
            },
            {
              onPartialPlan: () => {
                // MiniSlidePreview at 160x90 shows only title + state badge —
                // partials would thrash the strip without visible benefit.
              },
              onFinal: (p) => {
                finalPlan = p;
              },
              onError: () => {
                // composeWithRetry rejects on hard fail — we handle in catch.
              },
            },
            input.toolCall.input.vegaSpec as object | undefined
          );
          if (!finalPlan) throw new Error("composeWithRetry resolved without finalPlan");
          if (outer.signal.aborted) {
            cb.onMiniChange(idx, { status: "cancelled", title: slideEntry.titleHint });
            return;
          }

          cb.onMiniChange(idx, { status: "rendering", title: slideEntry.titleHint });
          const chartPng = (finalPlan as CompositionPlan).chartSpec
            ? await renderVegaToBase64Png({
                spec: (finalPlan as CompositionPlan).chartSpec as Record<string, unknown>,
                rows: input.cubeRows,
                signal: outer.signal,
              })
            : undefined;
          if (outer.signal.aborted) {
            cb.onMiniChange(idx, { status: "cancelled", title: slideEntry.titleHint });
            return;
          }

          // D-07 sequential insertion: slide N+1 waits for slide N's insertSlide
          // to resolve — ORDERED by plan idx (not by composition finish order).
          enteredMutex = true;
          await insertionMutex.run(idx, async () => {
            if (outer.signal.aborted) {
              cb.onMiniChange(idx, { status: "cancelled", title: slideEntry.titleHint });
              return;
            }
            const p = finalPlan as CompositionPlan;
            const composed: ComposedSlideContent = {
              type: "composed",
              title: p.title,
              subtitle: p.subtitle,
              commentary: p.commentary,
              regions: p.regions,
              chartPngBase64: chartPng,
              tableSpec: buildComposedTableSpec(p, input.cubeRows, input.toolCall.input.tableChartSpec),
            };
            await insertSlide(composed);
            cb.onMiniChange(idx, { status: "done", title: slideEntry.titleHint });
          });
        } catch (err) {
          if (outer.signal.aborted) {
            cb.onMiniChange(idx, { status: "cancelled", title: slideEntry.titleHint });
            return;
          }
          cb.onMiniChange(idx, {
            status: "error",
            title: slideEntry.titleHint,
            error: (err as Error).message,
          });
        } finally {
          // Free our mutex slot if we never entered it — otherwise the successor
          // slide would block forever waiting on our predecessor promise.
          if (!enteredMutex) insertionMutex.skip(idx);
          semaphore.release();
        }
      })()
    );

    await Promise.allSettled(slideTasks);
    if (!outer.signal.aborted) cb.onAllDone();
  })();

  return outer;
}

/**
 * Build the ComposedSlideContent.tableSpec from the composer's CompositionPlan
 * plus the Cube AI toolCall's tableChartSpec metadata (row numbers / pagination
 * live on tableChartSpec, not composer output).
 *
 * Mirrors SlidePreview.tsx's buildComposedTableSpec so single-slide and
 * multi-slide paths produce identical table rendering.
 */
function buildComposedTableSpec(
  plan: CompositionPlan,
  rows: unknown[],
  tableChartSpec: CubeSqlApiToolCall["input"]["tableChartSpec"]
): ComposedSlideContent["tableSpec"] | undefined {
  if (!plan.tableSpec) return undefined;
  return {
    renderMode: plan.tableSpec.renderMode,
    columns: plan.tableSpec.columns,
    rows: rows as Array<Record<string, unknown>>,
    showRowTotals: plan.tableSpec.showRowTotals ?? tableChartSpec?.showRowTotals,
    showColumnTotals: plan.tableSpec.showColumnTotals ?? tableChartSpec?.showColumnTotals,
    showRowNumbers: tableChartSpec?.showRowNumbers ?? false,
    showPagination: plan.tableSpec.showPagination ?? tableChartSpec?.showPagination,
  };
}
