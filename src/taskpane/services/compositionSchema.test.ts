import { describe, it, expect } from "vitest";
import { CompositionPlanSchema } from "./compositionSchema";

function validMinimalPlan() {
  return {
    layout: "chart-only" as const,
    regions: [{ id: "r1", kind: "chart" as const, x: 0, y: 0, w: 1, h: 1 }],
    title: "NSW drives a third of national sales",
    commentary: "Metro store density drives the gap; VIC is catching up.",
    chartSpec: { mark: "bar" },
  };
}

describe("CompositionPlanSchema", () => {
  it("CMPS-01: accepts a minimal valid plan", () => {
    const r = CompositionPlanSchema.safeParse(validMinimalPlan());
    expect(r.success).toBe(true);
  });

  it("CMPS-01: rejects missing commentary", () => {
    const p = validMinimalPlan() as any;
    delete p.commentary;
    expect(CompositionPlanSchema.safeParse(p).success).toBe(false);
  });

  it("CMPS-01: rejects missing title", () => {
    const p = validMinimalPlan() as any;
    delete p.title;
    expect(CompositionPlanSchema.safeParse(p).success).toBe(false);
  });

  it("CMPS-01: rejects title > 120 chars", () => {
    const p = validMinimalPlan();
    p.title = "x".repeat(121);
    expect(CompositionPlanSchema.safeParse(p).success).toBe(false);
  });

  it("CMPS-01: rejects commentary > 1200 chars", () => {
    const p = validMinimalPlan();
    p.commentary = "x".repeat(1201);
    expect(CompositionPlanSchema.safeParse(p).success).toBe(false);
  });

  it("CMPS-01: rejects layout outside enum", () => {
    const p = validMinimalPlan() as any;
    p.layout = "fantasy-layout";
    expect(CompositionPlanSchema.safeParse(p).success).toBe(false);
  });

  it("CMPS-01: rejects region kind outside enum", () => {
    const p = validMinimalPlan() as any;
    p.regions[0].kind = "unknown-kind";
    expect(CompositionPlanSchema.safeParse(p).success).toBe(false);
  });

  it("CMPS-01: rejects empty regions array", () => {
    const p = validMinimalPlan();
    p.regions = [];
    expect(CompositionPlanSchema.safeParse(p).success).toBe(false);
  });

  it("CMPS-01: rejects regions array length > 6", () => {
    const p = validMinimalPlan();
    p.regions = Array.from({ length: 7 }, (_, i) => ({
      id: `r${i}`,
      kind: "commentary" as const,
      x: 0,
      y: 0,
      w: 0.1,
      h: 0.1,
    }));
    expect(CompositionPlanSchema.safeParse(p).success).toBe(false);
  });

  it("CMPS-02: rejects region with x+w > 1", () => {
    const p = validMinimalPlan();
    p.regions[0] = { id: "r1", kind: "chart", x: 0.7, y: 0, w: 0.4, h: 1 };
    expect(CompositionPlanSchema.safeParse(p).success).toBe(false);
  });

  it("CMPS-02: rejects region with y+h > 1", () => {
    const p = validMinimalPlan();
    p.regions[0] = { id: "r1", kind: "chart", x: 0, y: 0.7, w: 1, h: 0.4 };
    expect(CompositionPlanSchema.safeParse(p).success).toBe(false);
  });

  it("CMPS-01: refine — chart region without chartSpec fails", () => {
    const p = validMinimalPlan() as any;
    delete p.chartSpec;
    expect(CompositionPlanSchema.safeParse(p).success).toBe(false);
  });

  it("CMPS-01: refine — table region without tableSpec fails", () => {
    const p = {
      layout: "chart-only" as const,
      regions: [{ id: "t1", kind: "table" as const, x: 0, y: 0, w: 1, h: 1 }],
      title: "t",
      commentary: "c",
      // no tableSpec
    };
    expect(CompositionPlanSchema.safeParse(p).success).toBe(false);
  });

  it("CMPS-01: text-only plan with only commentary region passes without chart/table spec", () => {
    const p = {
      layout: "chart-only" as const,
      regions: [{ id: "c1", kind: "commentary" as const, x: 0, y: 0, w: 1, h: 1 }],
      title: "t",
      commentary: "c",
    };
    expect(CompositionPlanSchema.safeParse(p).success).toBe(true);
  });

  it("CMPS-01: rejects region coords < 0", () => {
    const p = validMinimalPlan();
    p.regions[0] = { id: "r1", kind: "chart", x: -0.1, y: 0, w: 0.5, h: 0.5 };
    expect(CompositionPlanSchema.safeParse(p).success).toBe(false);
  });
});
