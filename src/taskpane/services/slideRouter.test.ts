import { describe, it, expect } from "vitest";
import {
  routeCreateSlide,
  routeMessage,
  type MessageRoute,
  type MessageRouteContext,
} from "./slideRouter";
import type { CubeSqlApiToolCall } from "./cubeai";

describe("routeCreateSlide (D-02)", () => {
  const validToolCall: CubeSqlApiToolCall = {
    name: "cubeSqlApi",
    isInProcess: false,
    input: {
      sqlQuery: "SELECT MEASURE(revenue) FROM sales_view",
      queryTitle: "Revenue",
      description: "Total revenue",
      chartCategory: "vega",
      vegaSpec: { mark: "bar" },
    },
  };

  it("D-02: toolCall present with isInProcess:false → composition", () => {
    expect(routeCreateSlide({ toolCall: validToolCall })).toBe("composition");
  });

  it("D-02: toolCall absent → narrative", () => {
    expect(routeCreateSlide({})).toBe("narrative");
    expect(routeCreateSlide({ toolCall: null })).toBe("narrative");
    expect(routeCreateSlide({ toolCall: undefined })).toBe("narrative");
  });

  it("D-02: toolCall present but isInProcess:true (still streaming) → narrative", () => {
    const intermediate = { ...validToolCall, isInProcess: true } as unknown as CubeSqlApiToolCall;
    expect(routeCreateSlide({ toolCall: intermediate })).toBe("narrative");
  });

  it("D-02: toolCall present with wrong name → narrative", () => {
    const wrongName = { ...validToolCall, name: "someOther" } as unknown as CubeSqlApiToolCall;
    expect(routeCreateSlide({ toolCall: wrongName })).toBe("narrative");
  });
});

describe("routeMessage (Phase 6)", () => {
  const validToolCall: CubeSqlApiToolCall = {
    name: "cubeSqlApi",
    isInProcess: false,
    input: {
      sqlQuery: "SELECT 1",
      queryTitle: "t",
      description: "d",
      chartCategory: "vega",
    },
  };

  it("D-15: no toolCall + chip dismissed → 'narrative'", () => {
    const ctx: MessageRouteContext = { refinementChipVisible: false };
    const route: MessageRoute = routeMessage({}, ctx);
    expect(route).toBe("narrative");
  });

  it("D-15: toolCall finalised + chip NOT visible → 'new-composition'", () => {
    const ctx: MessageRouteContext = { refinementChipVisible: false };
    expect(routeMessage({ toolCall: validToolCall }, ctx)).toBe("new-composition");
  });

  it("D-01/D-02: toolCall finalised + refinementChipVisible=true → 'refinement'", () => {
    const ctx: MessageRouteContext = {
      refinementChipVisible: true,
      lastSlideTitle: "Q3 sales by store",
    };
    expect(routeMessage({ toolCall: validToolCall }, ctx)).toBe("refinement");
  });

  it("D-05: sectionPlanHint='allow-multi' + toolCall finalised → 'section-plan'", () => {
    const ctx: MessageRouteContext = {
      refinementChipVisible: false,
      sectionPlanHint: "allow-multi",
    };
    expect(routeMessage({ toolCall: validToolCall }, ctx)).toBe("section-plan");
  });

  it("D-05: sectionPlanHint='force-single' + toolCall finalised → 'new-composition'", () => {
    const ctx: MessageRouteContext = {
      refinementChipVisible: false,
      sectionPlanHint: "force-single",
    };
    expect(routeMessage({ toolCall: validToolCall }, ctx)).toBe("new-composition");
  });

  it("D-15: toolCall.isInProcess=true + chip visible → 'narrative' (router degrades when toolCall not finalised regardless of chip)", () => {
    const intermediate = { ...validToolCall, isInProcess: true } as unknown as CubeSqlApiToolCall;
    const ctx: MessageRouteContext = { refinementChipVisible: true };
    expect(routeMessage({ toolCall: intermediate }, ctx)).toBe("narrative");
  });

  it("D-15: toolCall.name !== 'cubeSqlApi' → 'narrative' (narrative path unchanged from D-02)", () => {
    const wrongName = { ...validToolCall, name: "someOther" } as unknown as CubeSqlApiToolCall;
    const ctx: MessageRouteContext = { refinementChipVisible: true };
    expect(routeMessage({ toolCall: wrongName }, ctx)).toBe("narrative");
  });

  it("D-02 preserved: routeCreateSlide still returns 'composition' for finalised cubeSqlApi toolCall", () => {
    // Explicit regression guard — extending slideRouter must not change routeCreateSlide semantics.
    expect(routeCreateSlide({ toolCall: validToolCall })).toBe("composition");
  });

  it("D-05 + refinement precedence: section-plan beats refinement when both set", () => {
    // Per 06-CONTEXT D-05, the meta-composer decision overrides the chip path —
    // section-plan hint wins when the plan expanded the question beyond a single slide.
    const ctx: MessageRouteContext = {
      refinementChipVisible: true,
      sectionPlanHint: "allow-multi",
    };
    expect(routeMessage({ toolCall: validToolCall }, ctx)).toBe("section-plan");
  });
});
