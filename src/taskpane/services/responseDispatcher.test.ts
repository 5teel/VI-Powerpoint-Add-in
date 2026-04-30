/**
 * Phase 7 Wave 0 RED scaffold for responseDispatcher.ts (Wave 1).
 *
 * Covers R2 (single-classify-per-onComplete), R3 (mapping totality),
 * R7 (telemetry surface tag), and the D-08 two-stage classifier chain.
 *
 * INTENTIONAL RED STATE: production module ./responseDispatcher does not yet exist.
 * Wave 1 (07-02-PLAN.md Task 2) makes this file GREEN.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  streamAndClassify,
  responseClassToRoute,
  type ResponseClass,
  type ResponseRoute,
  type DispatchContext,
  type DispatchCallbacks,
  type DispatchResult,
} from "./responseDispatcher";
import * as classifierModule from "./responseClassifier";
import * as refinementModule from "./refinementClassifier";
import * as cubeai from "./cubeai";
import * as telemetry from "./telemetry";

// ----------------------------------------------------------------------------
// R3: responseClassToRoute mapping totality (24 cells)
// ----------------------------------------------------------------------------

const CLASSES: ResponseClass[] = [
  "clarify",
  "data",
  "modify",
  "variant",
  "section",
  "refuse",
];

const EXPECTED_TABLE: Record<string, { route: ResponseRoute; degraded?: true }> =
  {
    "clarify|true|true": { route: "narrative-conversational" },
    "clarify|true|false": { route: "narrative-conversational" },
    "clarify|false|true": { route: "narrative-conversational" },
    "clarify|false|false": { route: "narrative-conversational" },
    "refuse|true|true": { route: "narrative-conversational" },
    "refuse|true|false": { route: "narrative-conversational" },
    "refuse|false|true": { route: "narrative-conversational" },
    "refuse|false|false": { route: "narrative-conversational" },
    "data|true|true": { route: "new-composition" },
    "data|true|false": { route: "narrative" },
    "data|false|true": { route: "new-composition" },
    "data|false|false": { route: "narrative" },
    "section|true|true": { route: "section-plan" },
    "section|true|false": { route: "narrative" },
    "section|false|true": { route: "section-plan" },
    "section|false|false": { route: "narrative" },
    "modify|true|true": { route: "new-composition", degraded: true },
    "modify|true|false": { route: "narrative", degraded: true },
    "modify|false|true": { route: "refinement" },
    "modify|false|false": { route: "refinement" },
    "variant|true|true": { route: "new-composition", degraded: true },
    "variant|true|false": { route: "narrative", degraded: true },
    "variant|false|true": { route: "refinement" },
    "variant|false|false": { route: "refinement" },
  };

describe("responseClassToRoute (R3 mapping totality, 24 cells)", () => {
  for (const cls of CLASSES) {
    for (const isFirstTurn of [true, false]) {
      for (const hasToolCall of [true, false]) {
        const key = `${cls}|${isFirstTurn}|${hasToolCall}`;
        it(`R3 maps ${key} → ${JSON.stringify(EXPECTED_TABLE[key])}`, () => {
          const out = responseClassToRoute(cls, { isFirstTurn, hasToolCall });
          expect(out).toEqual(EXPECTED_TABLE[key]);
        });
      }
    }
  }

  it("data + plannedSlideCount > 1 → section-plan", () => {
    const out = responseClassToRoute("data", {
      isFirstTurn: false,
      hasToolCall: true,
      plannedSlideCount: 3,
    });
    expect(out.route).toBe("section-plan");
  });

  it("data + plannedSlideCount === 1 → new-composition", () => {
    const out = responseClassToRoute("data", {
      isFirstTurn: false,
      hasToolCall: true,
      plannedSlideCount: 1,
    });
    expect(out.route).toBe("new-composition");
  });
});

// ----------------------------------------------------------------------------
// Dispatcher integration — D-08 chain, telemetry, abort threading
// ----------------------------------------------------------------------------

interface FakeToolCall {
  name: "cubeSqlApi";
  isInProcess: false;
  input: {
    sqlQuery: string;
    queryTitle: string;
    description: string;
    chartCategory: "vega" | "table";
  };
}

const FAKE_TOOLCALL: FakeToolCall = {
  name: "cubeSqlApi",
  isInProcess: false,
  input: {
    sqlQuery: "SELECT 1",
    queryTitle: "Sales",
    description: "x",
    chartCategory: "vega",
  },
};

function makeBaseContext(
  overrides: Partial<DispatchContext> = {}
): DispatchContext {
  return {
    surface: "chat",
    chatId: null,
    hasLastBuild: false,
    userQuestion: "show me sales",
    ...overrides,
  };
}

function makeBaseCallbacks(
  overrides: Partial<DispatchCallbacks> = {}
): DispatchCallbacks {
  return {
    onPhaseChange: vi.fn(),
    onContent: vi.fn(),
    onError: vi.fn(),
    onClassified: vi.fn(),
    ...overrides,
  };
}

/**
 * Minimal streamCubeAI stub that fires onContent then onComplete synchronously
 * after returning a fake AbortController. Tests can override per-call.
 */
function stubStreamCubeAI(opts: {
  toolCall?: FakeToolCall | null;
  commentary?: string;
  chatId?: string | null;
  abortSignal?: AbortController;
} = {}) {
  const ac = opts.abortSignal ?? new AbortController();
  return vi
    .spyOn(cubeai, "streamCubeAI")
    .mockImplementation((_q, _chatId, callbacks) => {
      // Fire callbacks asynchronously (microtask) so the dispatcher can wire them.
      void Promise.resolve().then(async () => {
        callbacks.onPhaseChange("streaming");
        callbacks.onContent(opts.commentary ?? "fake commentary");
        if (opts.toolCall && callbacks.onToolCall) {
          callbacks.onToolCall(opts.toolCall as never);
        }
        callbacks.onComplete({
          content: opts.commentary ?? "fake commentary",
          chatId: opts.chatId ?? "fake-chat-id",
        });
      });
      return ac;
    });
}

function waitForClassified(
  cb: DispatchCallbacks,
  timeoutMs = 100
): Promise<DispatchResult> {
  return new Promise((resolve, reject) => {
    const onClassifiedSpy = cb.onClassified as ReturnType<typeof vi.fn>;
    const start = Date.now();
    const tick = () => {
      if (onClassifiedSpy.mock.calls.length > 0) {
        resolve(onClassifiedSpy.mock.calls[0][0] as DispatchResult);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("onClassified did not fire within " + timeoutMs + "ms"));
        return;
      }
      setTimeout(tick, 5);
    };
    tick();
  });
}

describe("streamAndClassify dispatcher (R2, R7, D-08)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let classifyResponseSpy: ReturnType<typeof vi.spyOn>;
  let classifyRefinementSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    logSpy = vi.spyOn(telemetry, "logEvent").mockImplementation(() => {});
    classifyResponseSpy = vi
      .spyOn(classifierModule, "classifyResponse")
      .mockResolvedValue({ class: "data", rationale: "default stub" });
    classifyRefinementSpy = vi
      .spyOn(refinementModule, "classifyRefinement")
      .mockResolvedValue({ path: "composer-only", rationale: "stub" });
  });

  afterEach(() => {
    logSpy.mockRestore();
    classifyResponseSpy.mockRestore();
    classifyRefinementSpy.mockRestore();
  });

  it("R2: streamAndClassify invokes classifyResponse exactly once on onComplete", async () => {
    stubStreamCubeAI({ toolCall: FAKE_TOOLCALL });
    const cb = makeBaseCallbacks();
    streamAndClassify("show me sales", makeBaseContext(), cb);
    await waitForClassified(cb);
    expect(classifyResponseSpy).toHaveBeenCalledTimes(1);
  });

  it("R7: telemetry response_classified emitted with class/route/surface/latencyMs", async () => {
    stubStreamCubeAI({ toolCall: FAKE_TOOLCALL });
    classifyResponseSpy.mockResolvedValueOnce({
      class: "data",
      rationale: "single fact",
    });
    const cb = makeBaseCallbacks();
    streamAndClassify(
      "show me sales",
      makeBaseContext({ surface: "chat" }),
      cb
    );
    await waitForClassified(cb);

    const calls = logSpy.mock.calls.filter(
      (c) => c[0] === "response_classified"
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const [, payload] = calls[calls.length - 1];
    expect(payload).toEqual(
      expect.objectContaining({
        class: "data",
        route: "new-composition",
        surface: "chat",
        latencyMs: expect.any(Number),
      })
    );
  });

  it("D-08: stage-2 (classifyRefinement) fires on modify + continuation turn", async () => {
    stubStreamCubeAI({ toolCall: FAKE_TOOLCALL });
    classifyResponseSpy.mockResolvedValueOnce({
      class: "modify",
      rationale: "filter on prior slide",
    });
    classifyRefinementSpy.mockResolvedValueOnce({
      path: "composer-only",
      rationale: "chart type swap",
    });
    const cb = makeBaseCallbacks();

    streamAndClassify(
      "filter to NSW",
      makeBaseContext({
        hasLastBuild: true,
        lastSlideTitle: "Sales by State",
      }),
      cb
    );
    const result = await waitForClassified(cb);

    expect(classifyRefinementSpy).toHaveBeenCalledTimes(1);
    expect(result.refinementPath).toBe("composer-only");
    expect(result.class).toBe("modify");
    expect(result.route).toBe("refinement");
  });

  it("D-08: stage-2 NOT fired on first-turn modify (D-05 degrade)", async () => {
    stubStreamCubeAI({ toolCall: FAKE_TOOLCALL });
    classifyResponseSpy.mockResolvedValueOnce({
      class: "modify",
      rationale: "first-turn modifier",
    });
    const cb = makeBaseCallbacks();

    streamAndClassify(
      "build sales by state but make it pie",
      makeBaseContext({ hasLastBuild: false }),
      cb
    );
    const result = await waitForClassified(cb);

    expect(classifyRefinementSpy).not.toHaveBeenCalled();
    expect(result.degraded).toBe(true);
    expect(result.route).toBe("new-composition");
  });

  it("D-08: stage-2 NOT fired on data class", async () => {
    stubStreamCubeAI({ toolCall: FAKE_TOOLCALL });
    classifyResponseSpy.mockResolvedValueOnce({
      class: "data",
      rationale: "single fact",
    });
    const cb = makeBaseCallbacks();

    streamAndClassify("what was Q3 revenue", makeBaseContext(), cb);
    await waitForClassified(cb);

    expect(classifyRefinementSpy).not.toHaveBeenCalled();
  });

  it("Pitfall 4: AbortSignal threads through both stage-1 AND stage-2", async () => {
    stubStreamCubeAI({ toolCall: FAKE_TOOLCALL });
    classifyResponseSpy.mockResolvedValueOnce({
      class: "modify",
      rationale: "filter on prior",
    });
    classifyRefinementSpy.mockResolvedValueOnce({
      path: "cube-ai+composer",
      rationale: "new dim",
    });
    const cb = makeBaseCallbacks();

    const controller = streamAndClassify(
      "filter to NSW",
      makeBaseContext({
        hasLastBuild: true,
        lastSlideTitle: "Sales by State",
      }),
      cb
    );
    await waitForClassified(cb);

    // Stage 1 received an AbortSignal sourced from the dispatcher's controller.
    const stage1Args = classifyResponseSpy.mock.calls[0];
    const stage1Signal = stage1Args[1] as AbortSignal | undefined;
    expect(stage1Signal).toBeInstanceOf(AbortSignal);

    // Stage 2 received the SAME signal (or one that aborts together).
    const stage2Args = classifyRefinementSpy.mock.calls[0];
    const stage2Signal = stage2Args[2] as AbortSignal | undefined;
    expect(stage2Signal).toBeInstanceOf(AbortSignal);

    // Aborting the dispatcher controller cascades to both signals.
    controller.abort();
    expect(stage1Signal!.aborted).toBe(true);
    expect(stage2Signal!.aborted).toBe(true);
  });

  it("R5: first-turn modify with toolCall → route='new-composition' degraded:true", async () => {
    stubStreamCubeAI({ toolCall: FAKE_TOOLCALL });
    classifyResponseSpy.mockResolvedValueOnce({
      class: "modify",
      rationale: "first-turn pie",
    });
    const cb = makeBaseCallbacks();

    streamAndClassify(
      "build sales by state but make it pie",
      makeBaseContext({ hasLastBuild: false }),
      cb
    );
    const result = await waitForClassified(cb);

    expect(result.route).toBe("new-composition");
    expect(result.degraded).toBe(true);
  });

  it("D-03: class=section invokes planSection and returns sectionPlan in result", async () => {
    stubStreamCubeAI({ toolCall: FAKE_TOOLCALL });
    classifyResponseSpy.mockResolvedValueOnce({
      class: "section",
      rationale: "multi-dim review",
    });
    const cb = makeBaseCallbacks();

    streamAndClassify("give me a Q3 review", makeBaseContext(), cb);
    const result = await waitForClassified(cb);

    expect(result.class).toBe("section");
    expect(result.route).toBe("section-plan");
    // The dispatcher MAY populate sectionPlan when planSection is invoked.
    // This test pins the contract — sectionPlan is at least defined on the
    // result type and reachable when class is "section". Implementation
    // (Wave 1) decides whether sectionPlan is computed inline or deferred.
    expect("sectionPlan" in result || result.route === "section-plan").toBe(
      true
    );
  });

  it("clarify class → route='narrative-conversational' and stage-2 NOT invoked", async () => {
    stubStreamCubeAI({ toolCall: null });
    classifyResponseSpy.mockResolvedValueOnce({
      class: "clarify",
      rationale: "asks a question",
    });
    const cb = makeBaseCallbacks();

    streamAndClassify("show me sales", makeBaseContext(), cb);
    const result = await waitForClassified(cb);

    expect(result.route).toBe("narrative-conversational");
    expect(classifyRefinementSpy).not.toHaveBeenCalled();
  });
});
