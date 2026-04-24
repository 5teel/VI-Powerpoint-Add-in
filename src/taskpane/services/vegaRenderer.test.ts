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

  it("does not mutate the input spec (width/height/background added to clone only)", async () => {
    const originalSpec = {
      mark: "bar" as const,
      data: { name: "table" },
      encoding: {
        x: { field: "a", type: "nominal" },
        y: { field: "b", type: "quantitative" },
      },
    };
    const specSnapshotBefore = JSON.stringify(originalSpec);
    await renderVegaToBase64Png({
      spec: originalSpec as unknown as Record<string, unknown>,
      rows: [{ a: "x", b: 1 }],
      widthPx: 640,
      heightPx: 480,
    });
    // Input spec is not mutated — width/height/background go onto a shallow clone only.
    expect(JSON.stringify(originalSpec)).toBe(specSnapshotBefore);
    expect(Object.prototype.hasOwnProperty.call(originalSpec, "width")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(originalSpec, "height")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(originalSpec, "background")).toBe(false);
  });

  it("injects width/height into the compiled spec — verified via runtime dataflow signal widths", async () => {
    // We can't spyOn vega-lite.compile or vega.parse/View (ESM namespace lock).
    // Instead, verify the signal names set by vega.parse from the compiled spec
    // include widths sized to our inputs. The `view.signal("width")` API returns
    // the concrete width signal value after runAsync() settles.
    let capturedWidth: number | undefined;
    let capturedHeight: number | undefined;
    let capturedBackground: string | undefined;
    // Replace runAsync with a thin wrapper that captures signals before resolving.
    const originalRun = vega.View.prototype.runAsync;
    const runSpy = vi.spyOn(vega.View.prototype, "runAsync").mockImplementation(async function (
      this: vega.View,
      ...args: Parameters<typeof originalRun>
    ) {
      const result = await originalRun.apply(this, args);
      try {
        capturedWidth = this.signal("width") as number;
        capturedHeight = this.signal("height") as number;
        capturedBackground = this.signal("background") as string;
      } catch {
        // signals not yet defined — ignore
      }
      return result;
    });
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
      widthPx: 640,
      heightPx: 480,
    });
    expect(runSpy).toHaveBeenCalled();
    expect(capturedWidth).toBe(640);
    expect(capturedHeight).toBe(480);
    expect(capturedBackground).toBe("#FFFFFF");
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
