/**
 * SlidePreview — Phase 5 live composition preview (extended for Phase 6).
 *
 * 280x158 16:9 skeleton preview with a stage state machine:
 *   Phase 5: idle → fetching-data → composing → rendering → success | failed
 *   Phase 6: +awaiting-choice sub-state between rendering and onSuccess when
 *   `awaitingChoice` prop is provided (refinement replace-or-add chooser — D-04).
 *
 * Drives the full composition pipeline:
 *   translateSql → loadCubeData → composeWithRetry (streaming partial plan) →
 *   renderVegaToBase64Png (if chartSpec) → insertSlide into PowerPoint.
 *
 * Owns a single AbortController per mount, threaded through every async boundary.
 * Stop building aborts the controller; all in-flight fetches/streams terminate silently.
 *
 * Phase 6 additions (all optional — Phase 5 call sites compile unchanged):
 *   - `outerSignal`: AbortSignal — inner AC subscribes via addEventListener("abort") so
 *     SectionStrip/ChatPanel outer abort cascades silently (Pitfall 6 fix).
 *   - `awaitingChoice`: { onReplace, onInsertNew } — pauses between rendering success
 *     and onSuccess to show <ReplaceOrAddChooser> inline (D-04).
 *   - `skipAutoStart`: boolean — disables internal composition pipeline so a parent
 *     (ChatPanel.runCompositionForRefinement) can drive composition externally and
 *     signal completion by flipping awaitingChoice in/out; prevents double-composition.
 *   - `onRetryStage(idx)`: optional callback — wired to per-stage error-row Retry buttons.
 *   - Stage retry caches intermediate outputs via useRef so only the failed stage
 *     re-runs (Pitfall 4).
 *   - <ElapsedTimeCounter /> mounts inside the active stage row, driven by stageStartMs.
 *
 * Visual contract: 05-UI-SPEC.md + 06-UI-SPEC.md. Shimmer uses a custom CSS keyframe
 * (NOT Fluent Skeleton). Reduced-motion users get a frozen fallback via
 * prefers-reduced-motion (taskpane.css).
 */
import React, { useEffect, useRef, useState } from "react";
import { Button, Spinner, Text } from "@fluentui/react-components";
import {
  CheckmarkCircle16Filled,
  CheckmarkCircle12Filled,
  ArrowClockwise16Regular,
  ArrowClockwise12Regular,
  ErrorCircle20Regular,
  ErrorCircle12Regular,
} from "@fluentui/react-icons";
import type { CubeSqlApiToolCall } from "../services/cubeai";
import { translateSql } from "../services/sqlTranslator";
import { loadCubeData } from "../services/cubeDataClient";
import { composeWithRetry } from "../services/compositionRetry";
import type { CompositionPlan } from "../services/compositionSchema";
import { renderVegaToBase64Png } from "../services/vegaRenderer";
import { insertSlide } from "../services/slideRenderer";
import type { ComposedSlideContent } from "../slide/types";
import { logEvent } from "../services/telemetry";
import { ElapsedTimeCounter } from "./ElapsedTimeCounter";
import { ReplaceOrAddChooser } from "./ReplaceOrAddChooser";

const SUMMIT_NAVY = "#0F1330";
const SUMMIT_BLUE = "#2563EB";
const SUCCESS_GREEN = "#107C10";
const DESTRUCTIVE_RED = "#D13438";
const STEADY_GREY = "#6B7280";

export type SlidePreviewStage =
  | "fetching-data"
  | "composing"
  | "rendering"
  | "awaiting-choice"
  | "success"
  | "failed";

export type StageStatus = "pending" | "active" | "error" | "done";

export type StageName = "fetching-data" | "composing" | "rendering";

export interface StageRowState {
  stage: StageName;
  status: StageStatus;
  errorMessage?: string;
  retryCountdownMs?: number;
}

export interface SlidePreviewProps {
  toolCall: CubeSqlApiToolCall;
  userQuestion: string;
  /**
   * CMPS-03 grounding anchor — Cube AI assistant commentary captured alongside
   * the tool-call. Parent surfaces (ChatPanel/WizardPanel) capture via onContent
   * or onComplete and thread the final value into this prop. Passed through to
   * the composer via cubeMeta.commentary (the composer treats it as the source-
   * of-truth narrative per D-05 so numeric claims and named entities stay
   * grounded in Cube REST rows).
   */
  commentary: string;
  onStageChange: (stage: SlidePreviewStage) => void;
  onSuccess: () => void;
  onError: (err: Error) => void;

  // ─── Phase 6 additions (all optional — Phase 5 call sites compile unchanged) ───
  /**
   * Outer AbortSignal from SectionStrip or ChatPanel — the inner AbortController
   * subscribes via addEventListener("abort"); outer abort cascades silently
   * (Pitfall 6 fix). When absent, SlidePreview behaves exactly as Phase 5.
   */
  outerSignal?: AbortSignal;
  /**
   * If present, SlidePreview pauses between rendering success and onSuccess to
   * show <ReplaceOrAddChooser> (D-04 refinement flow). onSuccess is only called
   * after the user's chooser interaction inside `onReplace` / `onInsertNew`.
   */
  awaitingChoice?: {
    onReplace: () => void;
    onInsertNew: () => void;
  };
  /**
   * When true, SlidePreview does NOT run its internal composition pipeline.
   * Parent (ChatPanel.runCompositionForRefinement) drives composition externally
   * and signals completion by flipping awaitingChoice in / out.
   * This prevents double-composition when a refinement flow already runs
   * composeWithRetry + insertSlide in the parent.
   *
   * Default: false (Phase 5 self-driving behavior unchanged).
   */
  skipAutoStart?: boolean;
  /**
   * Optional callback invoked when a stage-specific Retry button is pressed.
   * Receives the stage index (0=fetching-data, 1=composing, 2=rendering).
   * When absent, the Retry button still fires the internal retry path that
   * re-runs only the failed stage via cached intermediate outputs (Pitfall 4).
   */
  onRetryStage?: (stageIdx: number) => void;
}

const STAGE_LABELS: Record<SlidePreviewStage, string> = {
  "fetching-data": "Fetching data…",
  composing: "Composing slide…",
  rendering: "Inserting into PowerPoint…",
  "awaiting-choice": "Where should this appear?",
  success: "Slide added to your deck",
  failed: "Couldn't complete your slide",
};

// Row labels (past-tense for done rows — 06-UI-SPEC §Stage-Specific Inline Error Rows).
const STAGE_LABELS_ROW: Record<StageName, string> = {
  "fetching-data": "Fetched data",
  composing: "Composed slide",
  rendering: "Inserted into PowerPoint",
};

type RegionFraction = CompositionPlan["regions"][number];

const DEFAULT_REGIONS: RegionFraction[] = [
  { id: "title", kind: "title", x: 0.04, y: 0.04, w: 0.92, h: 0.12 },
  { id: "subtitle", kind: "subtitle", x: 0.04, y: 0.17, w: 0.92, h: 0.06 },
  { id: "chart", kind: "chart", x: 0.04, y: 0.26, w: 0.56, h: 0.7 },
  { id: "commentary", kind: "commentary", x: 0.64, y: 0.26, w: 0.32, h: 0.7 },
];

const initialStageRows = (): StageRowState[] => [
  { stage: "fetching-data", status: "pending" },
  { stage: "composing", status: "pending" },
  { stage: "rendering", status: "pending" },
];

export const SlidePreview: React.FC<SlidePreviewProps> = ({
  toolCall,
  userQuestion,
  commentary,
  onStageChange,
  onSuccess,
  onError,
  outerSignal,
  awaitingChoice,
  skipAutoStart,
  onRetryStage,
}) => {
  const [stage, setStage] = useState<SlidePreviewStage>("fetching-data");
  const [partial, setPartial] = useState<Partial<CompositionPlan>>({});
  const [error, setError] = useState<Error | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [stageRows, setStageRows] = useState<StageRowState[]>(initialStageRows);
  const [stageStartMs, setStageStartMs] = useState<number>(() => Date.now());
  const acRef = useRef<AbortController | null>(null);

  // Pitfall 4 — cache intermediate outputs so stage retry skips earlier stages.
  const cubeRowsRef = useRef<unknown[] | null>(null);
  const finalPlanRef = useRef<CompositionPlan | null>(null);
  const chartPngRef = useRef<string | undefined>(undefined);

  // Keep parent's onStageChange in sync with local stage transitions.
  useEffect(() => {
    onStageChange(stage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    // Phase 6: skipAutoStart — parent drives composition externally; we render
    // the idle placeholder or the chooser when awaitingChoice flips in.
    if (skipAutoStart) {
      return;
    }

    const ac = new AbortController();
    acRef.current = ac;
    let cancelled = false;

    // Phase 6 D-09 (Pitfall 6) — bind inner AC to outerSignal so SectionStrip
    // or ChatPanel outer abort cascades into this pipeline silently.
    const onOuterAbort = (): void => ac.abort();
    if (outerSignal) {
      if (outerSignal.aborted) ac.abort();
      else outerSignal.addEventListener("abort", onOuterAbort);
    }

    // Helper: set the stage-row for `name` to `active`, all earlier rows to `done`,
    // all later rows to `pending`, and reset stageStartMs for the elapsed counter.
    const enterStage = (name: StageName): void => {
      setStageStartMs(Date.now());
      setStageRows((prev) =>
        prev.map((r) => {
          const order: StageName[] = ["fetching-data", "composing", "rendering"];
          const rIdx = order.indexOf(r.stage);
          const targetIdx = order.indexOf(name);
          if (rIdx < targetIdx) return { ...r, status: "done", errorMessage: undefined };
          if (rIdx === targetIdx) return { ...r, status: "active", errorMessage: undefined };
          return { ...r, status: "pending", errorMessage: undefined };
        })
      );
    };

    (async () => {
      try {
        // Stage 1: fetch data (skip if cached from a prior retry path).
        setStage("fetching-data");
        setPartial({});
        setError(null);
        enterStage("fetching-data");

        let rows = cubeRowsRef.current;
        if (!rows) {
          const cubeQuery = translateSql(toolCall.input.sqlQuery);
          const cubeResponse = await loadCubeData(cubeQuery, { signal: ac.signal });
          if (cancelled || ac.signal.aborted) return;
          rows = cubeResponse.data;
          cubeRowsRef.current = rows;
        }

        // Stage 2: compose (streaming partial plan into local state for the canvas).
        setStage("composing");
        enterStage("composing");
        let finalPlan: CompositionPlan | null = finalPlanRef.current;
        if (!finalPlan) {
          await composeWithRetry(
            {
              userQuestion,
              cubeMeta: {
                queryTitle: toolCall.input.queryTitle,
                description: toolCall.input.description,
                vegaSpec: toolCall.input.vegaSpec,
                tableChartSpec: toolCall.input.tableChartSpec,
                // CMPS-03 grounding anchor — Cube AI assistant commentary threaded
                // from parent surface. Must be non-empty when Cube AI streamed both
                // a toolCall and assistant content in the same stream; the composer
                // uses it as the source-of-truth narrative per D-05.
                commentary: commentary ?? "",
              },
              rows,
              canvas: { widthPx: 960, heightPx: 540 },
              signal: ac.signal,
            },
            {
              onPartialPlan: (snap) => {
                if (!cancelled) setPartial(snap);
              },
              onFinal: (plan) => {
                finalPlan = plan;
              },
              // Do not re-throw here — composeWithRetry already rejects the outer
              // promise on error (see the settled-guard in attempt()). Re-throwing
              // from inside composer's try/catch would cause recursive cb.onError
              // dispatch and defeat the reject handoff.
              onError: () => {
                /* swallow — outer await will reject via composeWithRetry */
              },
            },
            toolCall.input.vegaSpec as object | undefined
          );
          if (cancelled || ac.signal.aborted) return;
          if (!finalPlan) throw new Error("Composition returned no plan");
          finalPlanRef.current = finalPlan;
        }
        const plan: CompositionPlan = finalPlan;

        // Stage 3: render chart + insert slide.
        setStage("rendering");
        enterStage("rendering");
        let chartPngBase64 = chartPngRef.current;
        if (chartPngBase64 === undefined && plan.chartSpec) {
          chartPngBase64 = await renderVegaToBase64Png({
            spec: plan.chartSpec,
            rows: rows as Array<Record<string, unknown>>,
            signal: ac.signal,
          });
          chartPngRef.current = chartPngBase64;
        }
        if (cancelled || ac.signal.aborted) return;

        const composedContent: ComposedSlideContent = {
          type: "composed",
          title: plan.title,
          subtitle: plan.subtitle,
          commentary: plan.commentary,
          regions: plan.regions,
          chartPngBase64,
          tableSpec: buildComposedTableSpec(
            plan,
            rows as Array<Record<string, unknown>>,
            toolCall.input.tableChartSpec
          ),
        };
        // Pre-flight abort check — Office.js PowerPoint.run has no native abort
        // primitive, so the minimum-safe pattern is to bail before invoking it.
        if (cancelled || ac.signal.aborted) return;
        await insertSlide(composedContent);
        if (cancelled) return;

        // Mark rendering row done (all three rows now "done").
        setStageRows((prev) => prev.map((r) => ({ ...r, status: "done", errorMessage: undefined })));

        // Phase 6 D-04: if awaitingChoice prop present, pause in awaiting-choice
        // until the user presses Replace or Insert as new.
        if (awaitingChoice) {
          setStage("awaiting-choice");
          return; // onSuccess will fire from inside the chooser handlers
        }

        // Phase 5 success path: hold 1200ms then onSuccess collapses the preview.
        setStage("success");
        setTimeout(() => {
          if (!cancelled) onSuccess();
        }, 1200);
      } catch (err) {
        if (ac.signal.aborted || cancelled) return; // silent abort
        const e = err as Error;
        setError(e);
        setStage("failed");
        // Mark the currently-active row as error with the err.message (never err.stack — T-06-23).
        setStageRows((prev) => {
          const activeIdx = prev.findIndex((r) => r.status === "active");
          if (activeIdx < 0) return prev;
          return prev.map((r, i) =>
            i === activeIdx ? { ...r, status: "error", errorMessage: e.message } : r
          );
        });
        onError(e);
        logEvent("slidepreview.failed", { message: e.message });
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      outerSignal?.removeEventListener("abort", onOuterAbort);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolCall, userQuestion, commentary, resetKey, outerSignal, skipAutoStart]);

  const handleStop = (): void => {
    acRef.current?.abort();
  };

  const handleRetry = (): void => {
    // Whole-pipeline retry — clear caches so every stage re-runs.
    cubeRowsRef.current = null;
    finalPlanRef.current = null;
    chartPngRef.current = undefined;
    setError(null);
    setPartial({});
    setStageRows(initialStageRows());
    setResetKey((k) => k + 1);
  };

  const handleRetryStage = (stageIdx: number): void => {
    logEvent("stage_retry_invoked", {
      stage: stageRows[stageIdx]?.stage ?? "unknown",
      attempt: 1,
      reason: "manual",
    });
    // Clear the cache for the failed stage AND every later stage. Earlier
    // stages keep their cached outputs, so only the failed stage (and what
    // follows) re-runs — Pitfall 4.
    if (stageIdx <= 0) cubeRowsRef.current = null;
    if (stageIdx <= 1) finalPlanRef.current = null;
    if (stageIdx <= 2) chartPngRef.current = undefined;
    setError(null);
    setPartial((p) => (stageIdx <= 1 ? {} : p));
    setStageRows((prev) =>
      prev.map((r, i) =>
        i < stageIdx
          ? { ...r, status: "done", errorMessage: undefined }
          : { ...r, status: "pending", errorMessage: undefined }
      )
    );
    onRetryStage?.(stageIdx);
    setResetKey((k) => k + 1);
  };

  // Phase 6: skipAutoStart render branch — parent drives composition externally.
  if (skipAutoStart) {
    return (
      <div
        style={{
          borderRadius: "12px",
          border: `1px solid #E5E7EB`,
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          backgroundColor: "#FAFAFA",
          marginTop: "8px",
        }}
        role="group"
        aria-live="polite"
      >
        {awaitingChoice ? (
          <ReplaceOrAddChooser
            onReplace={awaitingChoice.onReplace}
            onInsertNew={awaitingChoice.onInsertNew}
          />
        ) : (
          <Text size={200} style={{ color: STEADY_GREY }}>
            Preparing refinement…
          </Text>
        )}
      </div>
    );
  }

  const anyStageError = stageRows.some((r) => r.status === "error");

  return (
    <div
      style={{
        borderRadius: "12px",
        border: `1px solid ${stage === "failed" ? DESTRUCTIVE_RED : "#E5E7EB"}`,
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        backgroundColor: "#FAFAFA",
        marginTop: "8px",
      }}
      role="group"
      aria-live="polite"
    >
      {stage === "failed" || anyStageError ? (
        <StageLabelList
          rows={stageRows}
          stageStartMs={stageStartMs}
          onRetry={(idx) => handleRetryStage(idx)}
        />
      ) : (
        <StageLabelStrip stage={stage} stageStartMs={stageStartMs} />
      )}
      <PreviewCanvas stage={stage} partial={partial} />
      {stage === "awaiting-choice" && awaitingChoice && (
        <ReplaceOrAddChooser
          onReplace={awaitingChoice.onReplace}
          onInsertNew={awaitingChoice.onInsertNew}
        />
      )}
      <ActionRow stage={stage} error={error} onStop={handleStop} onRetry={handleRetry} />
    </div>
  );
};

function buildComposedTableSpec(
  plan: CompositionPlan,
  rows: Array<Record<string, unknown>>,
  tableChartSpec: CubeSqlApiToolCall["input"]["tableChartSpec"]
): ComposedSlideContent["tableSpec"] | undefined {
  if (!plan.tableSpec) return undefined;
  return {
    renderMode: plan.tableSpec.renderMode,
    columns: plan.tableSpec.columns,
    rows,
    showRowTotals: plan.tableSpec.showRowTotals ?? tableChartSpec?.showRowTotals,
    showColumnTotals: plan.tableSpec.showColumnTotals ?? tableChartSpec?.showColumnTotals,
    showRowNumbers: tableChartSpec?.showRowNumbers ?? false,
    showPagination: plan.tableSpec.showPagination ?? tableChartSpec?.showPagination,
  };
}

// ─── Sub-components (inline for locality) ──────────────────────────────────

// Phase 5 preserved — single-active-stage happy-path rendering.
const StageLabelStrip: React.FC<{ stage: SlidePreviewStage; stageStartMs: number }> = ({
  stage,
  stageStartMs,
}) => {
  const active = stage === "fetching-data" || stage === "composing" || stage === "rendering";
  const color =
    stage === "success"
      ? SUCCESS_GREEN
      : stage === "failed"
      ? DESTRUCTIVE_RED
      : active
      ? SUMMIT_BLUE
      : "#6B7280";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {active && <Spinner size="tiny" />}
        {stage === "success" && <CheckmarkCircle16Filled style={{ color: SUCCESS_GREEN }} />}
        {stage === "failed" && <ErrorCircle20Regular style={{ color: DESTRUCTIVE_RED }} />}
        <Text size={200} weight="regular" style={{ color }}>
          {STAGE_LABELS[stage]}
        </Text>
        {active && <ElapsedTimeCounter stageStartMs={stageStartMs} />}
      </div>
      {active && (
        <div style={{ height: "2px", backgroundColor: "#E5E7EB", overflow: "hidden" }}>
          <div
            className="indeterminate-bar"
            style={{ height: "2px", backgroundColor: SUMMIT_BLUE, transform: "scaleX(0)" }}
          />
        </div>
      )}
    </div>
  );
};

// Phase 6 — 3-row stage list rendered when any stage fails. Earlier rows show
// green check + past-tense label; failed row shows red icon + errorMessage +
// Retry button; future rows show em-dash + queued label.
const StageLabelList: React.FC<{
  rows: StageRowState[];
  stageStartMs: number;
  onRetry: (idx: number) => void;
}> = ({ rows, stageStartMs, onRetry }) => (
  <div
    style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 0, width: 280 }}
    role="list"
  >
    {rows.map((row, i) => {
      const label = STAGE_LABELS_ROW[row.stage];
      if (row.status === "error") {
        return (
          <div
            key={i}
            role="listitem"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}
          >
            <ErrorCircle12Regular primaryFill={DESTRUCTIVE_RED} />
            <Text size={200} style={{ color: DESTRUCTIVE_RED, flex: 1 }}>
              {row.errorMessage ?? label}
            </Text>
            <Button
              size="small"
              appearance="subtle"
              icon={<ArrowClockwise12Regular />}
              onClick={() => onRetry(i)}
              aria-label={`Retry ${label} stage`}
            >
              Retry this stage
            </Button>
          </div>
        );
      }
      if (row.status === "done") {
        return (
          <div
            key={i}
            role="listitem"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <CheckmarkCircle12Filled primaryFill={SUCCESS_GREEN} />
            <Text size={200} style={{ color: STEADY_GREY }}>
              {label}
            </Text>
          </div>
        );
      }
      if (row.status === "pending") {
        return (
          <div
            key={i}
            role="listitem"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <span style={{ color: STEADY_GREY, width: 12, textAlign: "center" }}>—</span>
            <Text size={200} style={{ color: STEADY_GREY }}>
              {label}
            </Text>
          </div>
        );
      }
      // active
      return (
        <div
          key={i}
          role="listitem"
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Spinner size="tiny" />
          <Text size={200} style={{ color: SUMMIT_BLUE }}>
            {label}
          </Text>
          <ElapsedTimeCounter stageStartMs={stageStartMs} />
        </div>
      );
    })}
  </div>
);

const PreviewCanvas: React.FC<{ stage: SlidePreviewStage; partial: Partial<CompositionPlan> }> = ({
  stage,
  partial,
}) => {
  const CANVAS_WIDTH = 280;
  const CANVAS_HEIGHT = 158;
  const regions = partial.regions ?? DEFAULT_REGIONS;
  return (
    <div
      style={{
        position: "relative",
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: "rgba(255, 255, 255, 0.85)",
        borderRadius: "4px",
        overflow: "hidden",
      }}
      aria-busy={stage !== "success" && stage !== "failed" && stage !== "awaiting-choice"}
    >
      {regions.map((r, idx) => {
        const rect = {
          left: r.x * CANVAS_WIDTH,
          top: r.y * CANVAS_HEIGHT,
          width: r.w * CANVAS_WIDTH,
          height: r.h * CANVAS_HEIGHT,
        };
        return (
          <div
            key={r.id ?? idx}
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              padding: "6px",
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            <RegionContent region={r} partial={partial} stage={stage} />
          </div>
        );
      })}
    </div>
  );
};

const RegionContent: React.FC<{
  region: RegionFraction;
  partial: Partial<CompositionPlan>;
  stage: SlidePreviewStage;
}> = ({ region, partial }) => {
  if (region.kind === "title" && partial.title) {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          lineHeight: "14px",
          color: SUMMIT_NAVY,
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {partial.title}
      </span>
    );
  }
  if (region.kind === "subtitle" && partial.subtitle) {
    return (
      <span style={{ fontSize: 9, fontWeight: 400, lineHeight: "12px", color: "#6B7280" }}>
        {partial.subtitle}
      </span>
    );
  }
  if (region.kind === "commentary" && partial.commentary) {
    return (
      <p
        style={{
          fontSize: 9,
          fontWeight: 400,
          lineHeight: "13px",
          color: "#1F2937",
          margin: 0,
          overflow: "hidden",
        }}
      >
        {partial.commentary}
      </p>
    );
  }
  return (
    <div
      className="shimmer-region"
      style={{ width: "100%", height: "100%", borderRadius: "2px" }}
    />
  );
};

const ActionRow: React.FC<{
  stage: SlidePreviewStage;
  error: Error | null;
  onStop: () => void;
  onRetry: () => void;
}> = ({ stage, error, onStop, onRetry }) => {
  if (stage === "success" || stage === "awaiting-choice") return null;
  if (stage === "failed") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <Text size={200} style={{ color: DESTRUCTIVE_RED }}>
          {error?.message ?? "Something went wrong."}
        </Text>
        <Button
          size="small"
          appearance="primary"
          icon={<ArrowClockwise16Regular />}
          onClick={onRetry}
          style={{ backgroundColor: SUMMIT_NAVY }}
        >
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <Button size="small" appearance="subtle" onClick={onStop}>
        Stop building
      </Button>
    </div>
  );
};

export default SlidePreview;
