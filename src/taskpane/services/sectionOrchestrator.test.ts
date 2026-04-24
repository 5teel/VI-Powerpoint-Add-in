/**
 * Phase 6 wave 3 — sectionOrchestrator unit tests.
 *
 * Covers D-05 (meta-composer planSection integration), D-06 (hard clamp to 6 slides
 * even if Zod lets through 7), D-07 (bounded parallelism cap = 2, serial insertion
 * mutex, per-slide pipeline), D-08 (sectionStyle threaded into USER content per
 * Pitfall 8), D-09 (outer AbortController cascades to all inner operations), D-13
 * (per-slide failure isolation).
 *
 * Uses vi.spyOn on module-level exports rather than __setAnthropicClientForTesting
 * because the orchestrator imports planSection + composeWithRetry + insertSlide +
 * renderVegaToBase64Png as concrete modules, not SDK clients.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  orchestrateSection,
  type MiniPreviewState,
  type SectionOrchestratorInput,
  type SectionOrchestratorCallbacks,
} from "./sectionOrchestrator";
import * as metaComposerModule from "./metaComposer";
import * as compositionRetryModule from "./compositionRetry";
import * as slideRendererModule from "./slideRenderer";
import * as vegaRendererModule from "./vegaRenderer";
import * as telemetryModule from "./telemetry";
import type { CubeSqlApiToolCall } from "./cubeai";
import type { SectionPlan } from "./metaComposer";
import type { CompositionPlan } from "./compositionSchema";

function makeToolCall(): CubeSqlApiToolCall {
  return {
    name: "cubeSqlApi",
    isInProcess: false,
    input: {
      sqlQuery: "SELECT 1",
      queryTitle: "q",
      description: "d",
      chartCategory: "vega",
      vegaSpec: { mark: "bar" },
    },
  };
}

function makePlan(n: number): SectionPlan {
  return {
    sectionTitle: "Test section",
    slides: Array.from({ length: n }, (_, i) => ({
      intent: `Intent ${i + 1}`,
      slideType: "chart" as const,
      titleHint: `Slide ${i + 1}`,
      dataSubset: `subset ${i + 1}`,
    })),
    sectionStyle: {
      palette: ["#0F1330", "#2563EB", "#6B7280", "#F3F4F6", "#E5E7EB"],
      accentColor: "#2563EB",
      typeScale: "standard" as const,
      layoutConventions: { preferChartSide: "left" as const, commentaryPosition: "right" as const },
    },
  };
}

function makeCompositionPlan(overrides?: Partial<CompositionPlan>): CompositionPlan {
  return {
    layout: "chart-only",
    regions: [{ id: "r1", kind: "chart", x: 0, y: 0, w: 1, h: 1 }],
    title: "T",
    commentary: "C",
    chartSpec: { mark: "bar" },
    ...overrides,
  } as CompositionPlan;
}

function makeInput(): SectionOrchestratorInput {
  return {
    userQuestion: "Quarterly review",
    toolCall: makeToolCall(),
    cubeRows: [{ store: "A", sales: 100 }],
    commentary: "NSW leads",
  };
}

function makeCallbacks(overrides?: Partial<SectionOrchestratorCallbacks>): SectionOrchestratorCallbacks {
  return {
    onSectionPlan: vi.fn(),
    onMiniChange: vi.fn(),
    onAllDone: vi.fn(),
    onPlanError: vi.fn(),
    ...overrides,
  };
}

/** Stub planSection to resolve via onFinal with the given plan after a microtask. */
function stubPlanSectionFinal(plan: SectionPlan) {
  return vi
    .spyOn(metaComposerModule, "planSection")
    .mockImplementation(async (_input, cb) => {
      cb.onFinal(plan);
    });
}

/** Stub planSection to reject via onError. */
function stubPlanSectionError(err: Error) {
  return vi
    .spyOn(metaComposerModule, "planSection")
    .mockImplementation(async (_input, cb) => {
      cb.onError(err);
    });
}

describe("orchestrateSection", () => {
  let insertSlideSpy: ReturnType<typeof vi.spyOn>;
  let renderVegaSpy: ReturnType<typeof vi.spyOn>;
  let composeWithRetrySpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Default: all side-effects succeed instantly.
    insertSlideSpy = vi
      .spyOn(slideRendererModule, "insertSlide")
      .mockImplementation(async () => {});
    renderVegaSpy = vi
      .spyOn(vegaRendererModule, "renderVegaToBase64Png")
      .mockImplementation(async () => "base64png");
    composeWithRetrySpy = vi
      .spyOn(compositionRetryModule, "composeWithRetry")
      .mockImplementation(async (_input, cb) => {
        const plan = makeCompositionPlan();
        cb.onFinal(plan);
        return plan;
      });
    logSpy = vi.spyOn(telemetryModule, "logEvent").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("D-05: planSection is called with input.userQuestion + cubeMeta from toolCall; orchestrator awaits completion before spawning slides", async () => {
    const planSectionSpy = stubPlanSectionFinal(makePlan(2));
    const cb = makeCallbacks();

    const ac = orchestrateSection(makeInput(), cb);
    // Wait for microtask queue to drain.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(planSectionSpy).toHaveBeenCalledTimes(1);
    const [passedInput] = planSectionSpy.mock.calls[0];
    expect(passedInput.userQuestion).toBe("Quarterly review");
    expect(passedInput.cubeMeta.queryTitle).toBe("q");
    expect(passedInput.cubeMeta.description).toBe("d");
    expect(passedInput.cubeMeta.commentary).toBe("NSW leads");
    expect(passedInput.signal).toBeDefined();
    ac.abort();
  });

  it("D-05: on plan success, orchestrator emits telemetry 'section_planned' with {slideCount, sectionTitle, elapsedMs}", async () => {
    stubPlanSectionFinal(makePlan(3));
    await orchestrateSectionToCompletion(makeInput(), makeCallbacks());

    const call = logSpy.mock.calls.find((c) => c[0] === "section_planned");
    expect(call).toBeDefined();
    const payload = call![1] as { slideCount: number; sectionTitle: string; elapsedMs: number };
    expect(payload.slideCount).toBe(3);
    expect(payload.sectionTitle).toBe("Test section");
    expect(typeof payload.elapsedMs).toBe("number");
  });

  it("D-06: plan.slides.length === 7 (pathological) → orchestrator hard-clamps to 6 before spawning", async () => {
    // Build a plan that bypasses Zod.max(6) by skipping SectionPlanSchema.parse — the
    // hard clamp is defense in depth on the consumer side.
    const rogue: SectionPlan = {
      sectionTitle: "Rogue",
      slides: Array.from({ length: 7 }, (_, i) => ({
        intent: `i${i}`,
        slideType: "chart" as const,
        titleHint: `T${i}`,
      })),
      sectionStyle: makePlan(1).sectionStyle,
    };
    stubPlanSectionFinal(rogue);
    const cb = makeCallbacks();
    await orchestrateSectionToCompletion(makeInput(), cb);

    // Exactly 6 composeWithRetry calls (not 7).
    expect(composeWithRetrySpy).toHaveBeenCalledTimes(6);
    // onSectionPlan receives clamped plan.
    expect(cb.onSectionPlan).toHaveBeenCalledTimes(1);
    const [emittedPlan] = (cb.onSectionPlan as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(emittedPlan.slides.length).toBe(6);
  });

  it("D-07: 4-slide plan → at most 2 composeWithRetry calls in-flight at once", async () => {
    stubPlanSectionFinal(makePlan(4));

    // Gate composeWithRetry so we can inspect peak concurrency.
    let inFlight = 0;
    let peak = 0;
    const releasers: Array<() => void> = [];
    composeWithRetrySpy.mockImplementation(async (_input, cb) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      const p = new Promise<void>((resolve) => releasers.push(resolve));
      await p;
      inFlight--;
      const plan = makeCompositionPlan();
      cb.onFinal(plan);
      return plan;
    });

    const cb = makeCallbacks();
    const ac = orchestrateSection(makeInput(), cb);

    // Let meta-composer resolve + first two slide tasks start.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(inFlight).toBe(2);
    expect(peak).toBe(2);

    // Release all in order and drain.
    while (releasers.length) releasers.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    while (releasers.length) releasers.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    while (releasers.length) releasers.shift()!();
    await new Promise((r) => setTimeout(r, 0));

    expect(peak).toBe(2);
    ac.abort();
  });

  it("D-08: sectionStyle fields are prepended to each slide's composer userQuestion (USER content, not system prompt)", async () => {
    stubPlanSectionFinal(makePlan(2));
    await orchestrateSectionToCompletion(makeInput(), makeCallbacks());

    expect(composeWithRetrySpy).toHaveBeenCalledTimes(2);
    for (const call of composeWithRetrySpy.mock.calls) {
      const [composerInput] = call;
      // Banner and every sectionStyle field appear in the userQuestion.
      expect(composerInput.userQuestion).toMatch(/SECTION STYLE \(LOCKED/);
      expect(composerInput.userQuestion).toMatch(/#0F1330/);
      expect(composerInput.userQuestion).toMatch(/#2563EB/);
      expect(composerInput.userQuestion).toMatch(/standard/);
      expect(composerInput.userQuestion).toMatch(/left/);
      expect(composerInput.userQuestion).toMatch(/right/);
    }
  });

  it("D-08: each slide's intent + titleHint + dataSubset are in the composer userQuestion", async () => {
    stubPlanSectionFinal(makePlan(2));
    await orchestrateSectionToCompletion(makeInput(), makeCallbacks());

    expect(composeWithRetrySpy).toHaveBeenCalledTimes(2);
    const first = composeWithRetrySpy.mock.calls[0][0];
    const second = composeWithRetrySpy.mock.calls[1][0];
    expect(first.userQuestion).toMatch(/Intent 1/);
    expect(first.userQuestion).toMatch(/Slide 1/);
    expect(first.userQuestion).toMatch(/subset 1/);
    expect(second.userQuestion).toMatch(/Intent 2/);
    expect(second.userQuestion).toMatch(/Slide 2/);
    expect(second.userQuestion).toMatch(/subset 2/);
  });

  it("D-07: per-slide pipeline calls composeWithRetry → renderVegaToBase64Png → insertSlide in order", async () => {
    stubPlanSectionFinal(makePlan(1));
    const events: string[] = [];
    composeWithRetrySpy.mockImplementation(async (_input, cb) => {
      events.push("compose");
      const plan = makeCompositionPlan();
      cb.onFinal(plan);
      return plan;
    });
    renderVegaSpy.mockImplementation(async () => {
      events.push("render");
      return "base64";
    });
    insertSlideSpy.mockImplementation(async () => {
      events.push("insert");
    });

    await orchestrateSectionToCompletion(makeInput(), makeCallbacks());

    expect(events).toEqual(["compose", "render", "insert"]);
  });

  it("D-09: outer AbortController.abort() propagates to composeWithRetry via signal", async () => {
    stubPlanSectionFinal(makePlan(2));

    let firstSignal: AbortSignal | undefined;
    composeWithRetrySpy.mockImplementation(async (input, cb) => {
      firstSignal = input.signal;
      // Never resolve — simulate in-flight.
      await new Promise(() => {});
      return makeCompositionPlan();
    });

    const cb = makeCallbacks();
    const ac = orchestrateSection(makeInput(), cb);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(firstSignal).toBeDefined();
    expect(firstSignal!.aborted).toBe(false);
    ac.abort();
    expect(firstSignal!.aborted).toBe(true);
  });

  it("D-09: outer abort during slide 2 of 4 → slides 3,4 transition directly to 'cancelled', never start composition", async () => {
    stubPlanSectionFinal(makePlan(4));

    let slotsTaken = 0;
    const gates: Array<() => void> = [];
    composeWithRetrySpy.mockImplementation(async (_input, cb) => {
      slotsTaken++;
      await new Promise<void>((resolve) => gates.push(resolve));
      const plan = makeCompositionPlan();
      cb.onFinal(plan);
      return plan;
    });

    const cb = makeCallbacks();
    const ac = orchestrateSection(makeInput(), cb);
    // Let meta-composer resolve + 2 composer tasks start (cap=2).
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(slotsTaken).toBe(2);

    ac.abort();
    // Release so the two in-flight tasks settle and semaphore frees up.
    while (gates.length) gates.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // Slides 3 and 4 should have flipped to 'cancelled' without starting composition.
    expect(composeWithRetrySpy).toHaveBeenCalledTimes(2);
    const miniCalls = (cb.onMiniChange as ReturnType<typeof vi.fn>).mock.calls;
    const slide3Statuses = miniCalls.filter((c) => c[0] === 2).map((c) => (c[1] as MiniPreviewState).status);
    const slide4Statuses = miniCalls.filter((c) => c[0] === 3).map((c) => (c[1] as MiniPreviewState).status);
    expect(slide3Statuses).toContain("cancelled");
    expect(slide4Statuses).toContain("cancelled");
  });

  it("D-07: insertSlide for slide i+1 awaits slide i's insertSlide (serial mutex ordering) even when composition finishes out-of-order", async () => {
    stubPlanSectionFinal(makePlan(3));

    // Slide 0 compose takes longest; slide 1 is fast; slide 2 is medium.
    // But insertSlide must still be called in plan order.
    const composeTimings: Record<number, number> = { 0: 40, 1: 5, 2: 20 };
    let callIdx = 0;
    composeWithRetrySpy.mockImplementation(async (_input, cb) => {
      const idx = callIdx++;
      await new Promise((r) => setTimeout(r, composeTimings[idx] ?? 0));
      const plan = makeCompositionPlan();
      cb.onFinal(plan);
      return plan;
    });

    const insertOrder: string[] = [];
    insertSlideSpy.mockImplementation(async (content) => {
      insertOrder.push((content as { title: string }).title);
    });

    const cb = makeCallbacks();
    // Tag each composed plan's title by its slide idx so insertSlide captures the order.
    let compositionIdx = 0;
    composeWithRetrySpy.mockImplementation(async (_input, cb2) => {
      const idx = compositionIdx++;
      await new Promise((r) => setTimeout(r, composeTimings[idx] ?? 0));
      const plan = makeCompositionPlan({ title: `slide-${idx}` });
      cb2.onFinal(plan);
      return plan;
    });

    await orchestrateSectionToCompletion(makeInput(), cb);

    // Plan order: slide-0, slide-1, slide-2.
    expect(insertOrder).toEqual(["slide-0", "slide-1", "slide-2"]);
  });

  it("D-07: onMiniChange fires through pending → fetching-data → composing → rendering → done for each slide", async () => {
    stubPlanSectionFinal(makePlan(1));
    const cb = makeCallbacks();
    await orchestrateSectionToCompletion(makeInput(), cb);

    const statuses = (cb.onMiniChange as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => c[0] === 0)
      .map((c) => (c[1] as MiniPreviewState).status);

    // Must include each expected transition in order.
    expect(statuses).toContain("pending");
    expect(statuses).toContain("fetching-data");
    expect(statuses).toContain("composing");
    expect(statuses).toContain("rendering");
    expect(statuses).toContain("done");
    const idxOf = (s: string) => statuses.indexOf(s);
    expect(idxOf("pending")).toBeLessThan(idxOf("fetching-data"));
    expect(idxOf("fetching-data")).toBeLessThan(idxOf("composing"));
    expect(idxOf("composing")).toBeLessThan(idxOf("rendering"));
    expect(idxOf("rendering")).toBeLessThan(idxOf("done"));
  });

  it("D-13: per-slide composer error → only that slide transitions to 'error'; other slides continue", async () => {
    stubPlanSectionFinal(makePlan(3));

    let idx = 0;
    composeWithRetrySpy.mockImplementation(async (_input, cb) => {
      const slideIdx = idx++;
      if (slideIdx === 1) {
        throw new Error("compose blew up");
      }
      const plan = makeCompositionPlan({ title: `ok-${slideIdx}` });
      cb.onFinal(plan);
      return plan;
    });

    const cb = makeCallbacks();
    await orchestrateSectionToCompletion(makeInput(), cb);

    const miniCalls = (cb.onMiniChange as ReturnType<typeof vi.fn>).mock.calls;
    const slide1Statuses = miniCalls.filter((c) => c[0] === 1).map((c) => (c[1] as MiniPreviewState).status);
    const slide0Statuses = miniCalls.filter((c) => c[0] === 0).map((c) => (c[1] as MiniPreviewState).status);
    const slide2Statuses = miniCalls.filter((c) => c[0] === 2).map((c) => (c[1] as MiniPreviewState).status);

    expect(slide1Statuses).toContain("error");
    expect(slide0Statuses).toContain("done");
    expect(slide2Statuses).toContain("done");
    expect(slide0Statuses).not.toContain("error");
    expect(slide2Statuses).not.toContain("error");

    // Only slides 0 and 2 made it to insertSlide.
    expect(insertSlideSpy).toHaveBeenCalledTimes(2);
  });

  it("D-05: planSection error → onPlanError fires; onMiniChange never fires; no slides ever start", async () => {
    stubPlanSectionError(new Error("meta-composer down"));
    const cb = makeCallbacks();

    orchestrateSection(makeInput(), cb);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(cb.onPlanError).toHaveBeenCalledTimes(1);
    expect((cb.onPlanError as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toMatch(/meta-composer down/);
    expect(cb.onMiniChange).not.toHaveBeenCalled();
    expect(composeWithRetrySpy).not.toHaveBeenCalled();
    expect(cb.onAllDone).not.toHaveBeenCalled();
  });

  it("D-08: orchestrator calls composeWithRetry with originalVegaSpec from toolCall.input.vegaSpec (G2 fallback)", async () => {
    stubPlanSectionFinal(makePlan(1));
    await orchestrateSectionToCompletion(makeInput(), makeCallbacks());

    const call = composeWithRetrySpy.mock.calls[0];
    // composeWithRetry(input, cb, originalVegaSpec)
    expect(call[2]).toEqual({ mark: "bar" });
  });

  it("D-07: when composition returns a chartSpec, renderVegaToBase64Png is called with rows + outer signal; result passed to insertSlide", async () => {
    stubPlanSectionFinal(makePlan(1));
    composeWithRetrySpy.mockImplementation(async (_input, cb) => {
      const plan = makeCompositionPlan({ chartSpec: { mark: "line" } });
      cb.onFinal(plan);
      return plan;
    });

    await orchestrateSectionToCompletion(makeInput(), makeCallbacks());

    expect(renderVegaSpy).toHaveBeenCalledTimes(1);
    const renderArgs = renderVegaSpy.mock.calls[0][0] as {
      spec: object;
      rows: unknown[];
      signal?: AbortSignal;
    };
    expect(renderArgs.spec).toEqual({ mark: "line" });
    expect(renderArgs.rows).toEqual([{ store: "A", sales: 100 }]);
    expect(renderArgs.signal).toBeDefined();

    const inserted = insertSlideSpy.mock.calls[0][0] as { type: string; chartPngBase64?: string };
    expect(inserted.type).toBe("composed");
    expect(inserted.chartPngBase64).toBe("base64png");
  });

  it("D-09: when all slides abort (outer abort before any compose starts) → onAllDone is NOT called", async () => {
    stubPlanSectionFinal(makePlan(3));
    // Make composeWithRetry never resolve so we can abort cleanly.
    composeWithRetrySpy.mockImplementation(async () => {
      await new Promise(() => {});
      return makeCompositionPlan();
    });

    const cb = makeCallbacks();
    const ac = orchestrateSection(makeInput(), cb);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    ac.abort();
    // Let tasks settle their catch blocks.
    await new Promise((r) => setTimeout(r, 10));

    expect(cb.onAllDone).not.toHaveBeenCalled();
  });

  it("D-07: onAllDone fires exactly once after all slides settle (not aborted)", async () => {
    stubPlanSectionFinal(makePlan(2));
    const cb = makeCallbacks();
    await orchestrateSectionToCompletion(makeInput(), cb);

    expect(cb.onAllDone).toHaveBeenCalledTimes(1);
  });
});

/**
 * Helper: runs orchestrateSection and waits for either onAllDone or onPlanError.
 * Bounded by a 500ms timeout to avoid hanging tests on orchestrator bugs.
 */
async function orchestrateSectionToCompletion(
  input: SectionOrchestratorInput,
  cb: SectionOrchestratorCallbacks
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const originalAllDone = cb.onAllDone as unknown as ReturnType<typeof vi.fn>;
    const originalPlanError = cb.onPlanError as unknown as ReturnType<typeof vi.fn>;
    const timeout = setTimeout(() => reject(new Error("orchestrator timed out")), 500);
    (cb as { onAllDone: () => void }).onAllDone = () => {
      originalAllDone.call(cb);
      clearTimeout(timeout);
      resolve();
    };
    (cb as { onPlanError: (e: Error) => void }).onPlanError = (e) => {
      originalPlanError.call(cb, e);
      clearTimeout(timeout);
      resolve();
    };
    orchestrateSection(input, cb);
  });
  // Small drain tick for any trailing micro-task updates.
  await new Promise((r) => setTimeout(r, 0));
}
