import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as composerModule from "./composer";
import { composeWithRetry } from "./compositionRetry";
import type { CompositionPlan } from "./compositionSchema";

function validPlan(chartSpec: Record<string, unknown>): CompositionPlan {
  return {
    layout: "chart-only",
    regions: [{ id: "r1", kind: "chart", x: 0, y: 0, w: 1, h: 1 }],
    title: "t",
    commentary: "c",
    chartSpec,
  } as CompositionPlan;
}

// Must include `data` because vega-lite v6 schema requires it as a top-level prop
// when validating a single-view spec. Without data, the spec fails Ajv validation
// and compositionRetry would incorrectly retry (false G2 positive).
const VALID_SPEC = {
  $schema: "https://vega.github.io/schema/vega-lite/v5.json",
  data: { values: [{ a: "x", b: 1 }] },
  mark: "bar",
  encoding: { x: { field: "a", type: "nominal" }, y: { field: "b", type: "quantitative" } },
};
const INVALID_SPEC = { mark: { type: "not-a-valid-mark-type-anywhere" } };

function baseInput() {
  return {
    userQuestion: "q",
    cubeMeta: { queryTitle: "", description: "", commentary: "" },
    rows: [],
    canvas: { widthPx: 960, heightPx: 540 },
  };
}

describe("composeWithRetry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("G2: no retry when first plan has valid chartSpec", async () => {
    const spy = vi.spyOn(composerModule, "composeSlide").mockImplementation(async (_i, cb) => {
      cb.onFinal(validPlan(VALID_SPEC));
    });
    const onFinal = vi.fn();
    await composeWithRetry(baseInput(), { onPartialPlan: vi.fn(), onFinal, onError: vi.fn() });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith(expect.objectContaining({ chartSpec: VALID_SPEC }));
  });

  it("G2: retries exactly once when first plan has invalid chartSpec", async () => {
    let call = 0;
    const spy = vi.spyOn(composerModule, "composeSlide").mockImplementation(async (input, cb) => {
      call++;
      if (call === 1) cb.onFinal(validPlan(INVALID_SPEC));
      else {
        expect(input.userQuestion).toMatch(/REPAIR INSTRUCTIONS/);
        cb.onFinal(validPlan(VALID_SPEC));
      }
    });
    const onFinal = vi.fn();
    await composeWithRetry(baseInput(), { onPartialPlan: vi.fn(), onFinal, onError: vi.fn() });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(onFinal).toHaveBeenCalledWith(expect.objectContaining({ chartSpec: VALID_SPEC }));
  });

  it("G2 fallback: uses originalVegaSpec after second invalid chartSpec", async () => {
    vi.spyOn(composerModule, "composeSlide").mockImplementation(async (_i, cb) => {
      cb.onFinal(validPlan(INVALID_SPEC));
    });
    const ORIGINAL = {
      mark: "bar",
      encoding: { x: { field: "a", type: "nominal" }, y: { field: "b", type: "quantitative" } },
    };
    const onFinal = vi.fn();
    await composeWithRetry(
      baseInput(),
      { onPartialPlan: vi.fn(), onFinal, onError: vi.fn() },
      ORIGINAL
    );
    expect(onFinal).toHaveBeenCalledWith(expect.objectContaining({ chartSpec: ORIGINAL }));
  });

  it("G1: surfaces onError when composeSlide errors (no retry)", async () => {
    vi.spyOn(composerModule, "composeSlide").mockImplementation(async (_i, cb) => {
      cb.onError(new Error("network down"));
    });
    const onError = vi.fn();
    await expect(
      composeWithRetry(baseInput(), { onPartialPlan: vi.fn(), onFinal: vi.fn(), onError })
    ).rejects.toThrow(/network down/);
    expect(onError).toHaveBeenCalled();
  });
});

describe("composeWithRetry D-13 rate-limit retry (Phase 6)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function make429(): Error {
    const err = new Error("429 rate limit");
    (err as unknown as { status: number }).status = 429;
    return err;
  }

  it("D-13: first attempt 429 + second attempt success → onRateLimitRetry fires once, 2 composer calls, final plan returned", async () => {
    let call = 0;
    const spy = vi
      .spyOn(composerModule, "composeSlide")
      .mockImplementation(async (_i, cb) => {
        call++;
        if (call === 1) cb.onError(make429());
        else cb.onFinal(validPlan(VALID_SPEC));
      });

    const onFinal = vi.fn();
    const onRateLimitRetry = vi.fn();
    const promise = composeWithRetry(baseInput(), {
      onPartialPlan: vi.fn(),
      onFinal,
      onError: vi.fn(),
      onRateLimitRetry,
    });

    const guarded = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    await guarded;

    expect(spy).toHaveBeenCalledTimes(2);
    expect(onRateLimitRetry).toHaveBeenCalledTimes(1);
    expect(onRateLimitRetry.mock.calls[0][0]).toBe(1); // attempt number
    expect(typeof onRateLimitRetry.mock.calls[0][1]).toBe("number"); // delayMs
    expect(onFinal).toHaveBeenCalledWith(
      expect.objectContaining({ chartSpec: VALID_SPEC })
    );
  });

  it("D-13: 3x consecutive 429 → throws, onRateLimitRetry fires 2x, onError fires once", async () => {
    const spy = vi
      .spyOn(composerModule, "composeSlide")
      .mockImplementation(async (_i, cb) => {
        cb.onError(make429());
      });

    const onError = vi.fn();
    const onRateLimitRetry = vi.fn();
    const promise = composeWithRetry(baseInput(), {
      onPartialPlan: vi.fn(),
      onFinal: vi.fn(),
      onError,
      onRateLimitRetry,
    });

    const guarded = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await guarded;

    expect(spy).toHaveBeenCalledTimes(3);
    expect(onRateLimitRetry).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((err as { status?: number }).status).toBe(429);
  });

  it("D-13: non-rate-limit error on attempt 1 → no retry, immediately rethrows", async () => {
    const spy = vi
      .spyOn(composerModule, "composeSlide")
      .mockImplementation(async (_i, cb) => {
        cb.onError(new Error("schema error"));
      });
    const onError = vi.fn();
    const onRateLimitRetry = vi.fn();

    const promise = composeWithRetry(baseInput(), {
      onPartialPlan: vi.fn(),
      onFinal: vi.fn(),
      onError,
      onRateLimitRetry,
    });
    const guarded = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await guarded;

    expect(spy).toHaveBeenCalledTimes(1);
    expect(onRateLimitRetry).not.toHaveBeenCalled();
    expect((err as Error).message).toMatch(/schema error/);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("D-13: 429 on attempt 1 then AbortError → no further retry", async () => {
    const ac = new AbortController();
    let call = 0;
    const spy = vi
      .spyOn(composerModule, "composeSlide")
      .mockImplementation(async (_i, cb) => {
        call++;
        if (call === 1) {
          cb.onError(make429());
          // Abort synchronously so the mid-wait listener fires
          ac.abort();
        } else {
          cb.onFinal(validPlan(VALID_SPEC));
        }
      });

    const input = { ...baseInput(), signal: ac.signal };
    const onError = vi.fn();
    const promise = composeWithRetry(input, {
      onPartialPlan: vi.fn(),
      onFinal: vi.fn(),
      onError,
      onRateLimitRetry: vi.fn(),
    });
    const guarded = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await guarded;

    expect(spy).toHaveBeenCalledTimes(1);
    expect((err as Error).name).toBe("AbortError");
  });

  it("D-13: G2 Vega-Lite retry still works (non-429) → existing behaviour preserved", async () => {
    let call = 0;
    const spy = vi
      .spyOn(composerModule, "composeSlide")
      .mockImplementation(async (input, cb) => {
        call++;
        if (call === 1) cb.onFinal(validPlan(INVALID_SPEC));
        else {
          expect(input.userQuestion).toMatch(/REPAIR INSTRUCTIONS/);
          cb.onFinal(validPlan(VALID_SPEC));
        }
      });
    const onFinal = vi.fn();
    const onRateLimitRetry = vi.fn();

    const promise = composeWithRetry(baseInput(), {
      onPartialPlan: vi.fn(),
      onFinal,
      onError: vi.fn(),
      onRateLimitRetry,
    });
    const guarded = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    await guarded;

    expect(spy).toHaveBeenCalledTimes(2);
    expect(onRateLimitRetry).not.toHaveBeenCalled();
    expect(onFinal).toHaveBeenCalledWith(
      expect.objectContaining({ chartSpec: VALID_SPEC })
    );
  });

  it("D-13: G1/G2 repair-hint retry path unaffected — 429 wrapper only on first attempt", async () => {
    // First attempt: invalid spec (G2 trigger). Second attempt (repair hint): valid.
    // If the wrapper accidentally retried repair-hint attempts on non-429, we'd see 3+ calls.
    let call = 0;
    const spy = vi
      .spyOn(composerModule, "composeSlide")
      .mockImplementation(async (_i, cb) => {
        call++;
        if (call === 1) cb.onFinal(validPlan(INVALID_SPEC));
        else cb.onFinal(validPlan(VALID_SPEC));
      });

    const promise = composeWithRetry(baseInput(), {
      onPartialPlan: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
      onRateLimitRetry: vi.fn(),
    });
    const guarded = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    await guarded;

    expect(spy).toHaveBeenCalledTimes(2); // G2 retry only, no 429 compounding
  });

  it("D-13: onRateLimitRetry is optional — omitting it does not throw", async () => {
    let call = 0;
    vi.spyOn(composerModule, "composeSlide").mockImplementation(async (_i, cb) => {
      call++;
      if (call === 1) cb.onError(make429());
      else cb.onFinal(validPlan(VALID_SPEC));
    });

    const promise = composeWithRetry(baseInput(), {
      onPartialPlan: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
      // onRateLimitRetry intentionally omitted
    });
    const guarded = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    await guarded;

    expect(call).toBe(2);
  });
});
