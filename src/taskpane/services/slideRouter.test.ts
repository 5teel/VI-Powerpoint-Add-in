import { describe, it, expect } from "vitest";
import { routeCreateSlide } from "./slideRouter";
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
