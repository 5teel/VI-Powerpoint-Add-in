import { describe, it } from "vitest";

describe("compositionRetry", () => {
  it.todo("G1: retries once when CompositionPlanSchema.safeParse fails");
  it.todo("G2: retries once with Ajv error summary injected as repair hint");
  it.todo("G2: falls back to Cube AI's original vegaSpec after second failure");
});
