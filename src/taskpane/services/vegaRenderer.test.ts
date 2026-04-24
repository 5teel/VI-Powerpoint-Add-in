/**
 * Tests for renderVegaToBase64Png — CHRT-01..04.
 *
 * Under Vitest (node env), Vega View.toCanvas() doesn't return a DOM HTMLCanvasElement.
 * We mock the vega.View prototype method to return a fake canvas-like object with
 * toDataURL, matching the browser contract the function expects.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vega from "vega";
import { renderVegaToBase64Png } from "./vegaRenderer";

describe("renderVegaToBase64Png", () => {
  let toCanvasSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const fakeCanvas = {
      toDataURL: vi.fn().mockReturnValue("data:image/png;base64,TESTPAYLOAD"),
    };
    toCanvasSpy = vi
      .spyOn(vega.View.prototype, "toCanvas")
      .mockResolvedValue(fakeCanvas as unknown as HTMLCanvasElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("CHRT-01: compiles a Vega-Lite bar spec and returns base64 payload", async () => {
    const result = await renderVegaToBase64Png({
      spec: {
        mark: "bar",
        data: { name: "table" },
        encoding: {
          x: { field: "state", type: "nominal" },
          y: { field: "sales", type: "quantitative" },
        },
      },
      rows: [
        { state: "NSW", sales: 100 },
        { state: "VIC", sales: 80 },
      ],
    });
    expect(result).toBe("TESTPAYLOAD");
  });

  it("CHRT-02: compiles a Vega-Lite line spec", async () => {
    const result = await renderVegaToBase64Png({
      spec: {
        mark: "line",
        data: { name: "table" },
        encoding: {
          x: { field: "week", type: "temporal" },
          y: { field: "revenue", type: "quantitative" },
        },
      },
      rows: [{ week: "2024-01-01", revenue: 100 }],
    });
    expect(result).toBe("TESTPAYLOAD");
  });

  it("CHRT-03: compiles a Vega-Lite arc (pie) spec", async () => {
    const result = await renderVegaToBase64Png({
      spec: {
        mark: "arc",
        data: { name: "table" },
        encoding: {
          theta: { field: "sales", type: "quantitative" },
          color: { field: "category", type: "nominal" },
        },
      },
      rows: [
        { category: "A", sales: 60 },
        { category: "B", sales: 40 },
      ],
    });
    expect(result).toBe("TESTPAYLOAD");
  });

  it("CHRT-04: returned string does NOT start with 'data:' prefix", async () => {
    const result = await renderVegaToBase64Png({
      spec: {
        mark: "bar",
        data: { name: "table" },
        encoding: {
          x: { field: "a", type: "nominal" },
          y: { field: "b", type: "quantitative" },
        },
      },
      rows: [{ a: "x", b: 1 }],
    });
    expect(result).not.toMatch(/^data:/);
  });

  it("injects width, height, and white background into the spec without mutating input", async () => {
    const originalSpec = {
      mark: "bar" as const,
      data: { name: "table" },
      encoding: {
        x: { field: "a", type: "nominal" },
        y: { field: "b", type: "quantitative" },
      },
    };
    const vegaLite = await import("vega-lite");
    const compileSpy = vi.spyOn(vegaLite, "compile");
    await renderVegaToBase64Png({
      spec: originalSpec as unknown as Record<string, unknown>,
      rows: [{ a: "x", b: 1 }],
      widthPx: 640,
      heightPx: 480,
    });
    expect(compileSpy).toHaveBeenCalled();
    const passed = compileSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(passed.width).toBe(640);
    expect(passed.height).toBe(480);
    expect(passed.background).toBe("#FFFFFF");
    // Input spec is not mutated
    expect(Object.prototype.hasOwnProperty.call(originalSpec, "width")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(originalSpec, "height")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(originalSpec, "background")).toBe(false);
  });

  it("skips view.data when rows is absent or empty", async () => {
    const dataSpy = vi.spyOn(vega.View.prototype, "data");
    await renderVegaToBase64Png({
      spec: {
        mark: "bar",
        data: { values: [{ a: 1, b: 2 }] },
        encoding: { x: { field: "a", type: "quantitative" }, y: { field: "b", type: "quantitative" } },
      },
    });
    expect(dataSpy).not.toHaveBeenCalled();
  });

  it("passes scaleFactor to view.toCanvas (default 2)", async () => {
    await renderVegaToBase64Png({
      spec: {
        mark: "bar",
        data: { name: "table" },
        encoding: {
          x: { field: "a", type: "nominal" },
          y: { field: "b", type: "quantitative" },
        },
      },
      rows: [{ a: "x", b: 1 }],
    });
    expect(toCanvasSpy).toHaveBeenCalledWith(2);
  });
});
