import { describe, it, expect, vi, beforeEach } from "vitest";
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
