/**
 * Tests for composedRenderer (Phase 5 CMPS-02, CHRT-04, TABL-NATV-01).
 *
 * Covers:
 *   - fractionToPoints rounding on 960x540 canvas
 *   - hasOverlappingRegions (G3 guardrail) — pairwise, touching edges non-overlap
 *   - renderComposedSlide dispatch by region.kind
 *   - chart region calls fill.setImage with raw base64
 *   - table region passes tableSpec flags to addTable
 *   - single-PowerPoint.run discipline (S4 pattern)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fractionToPoints,
  hasOverlappingRegions,
  renderComposedSlide,
  type Region,
} from "./composedRenderer";
import type { ComposedSlideContent } from "./types";

describe("fractionToPoints", () => {
  it("CMPS-02: converts fractions to rounded integer points on 960x540 canvas", () => {
    expect(
      fractionToPoints(
        { id: "r", kind: "chart", x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
        960,
        540
      )
    ).toEqual({ left: 480, top: 270, width: 480, height: 270 });
  });

  it("CMPS-02: rounds fractional pixel edges (x:0.333 on 960 → 320)", () => {
    expect(
      fractionToPoints({ id: "r", kind: "chart", x: 0.333, y: 0, w: 0.333, h: 1 }, 960, 540)
    ).toEqual({ left: 320, top: 0, width: 320, height: 540 });
  });

  it("CMPS-02: full canvas (x:0, y:0, w:1, h:1) spans entire slide", () => {
    expect(
      fractionToPoints({ id: "r", kind: "chart", x: 0, y: 0, w: 1, h: 1 }, 960, 540)
    ).toEqual({ left: 0, top: 0, width: 960, height: 540 });
  });
});

describe("hasOverlappingRegions (G3 guardrail)", () => {
  const region = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    kind: Region["kind"] = "chart"
  ): Region => ({ id, kind, x, y, w, h });

  it("CMPS-02: detects pairwise overlap", () => {
    expect(
      hasOverlappingRegions([
        region("a", 0.1, 0.1, 0.5, 0.5),
        region("b", 0.3, 0.3, 0.5, 0.5),
      ])
    ).toBe(true);
  });

  it("CMPS-02: touching edges are NOT overlap (strict)", () => {
    expect(
      hasOverlappingRegions([
        region("a", 0, 0, 0.5, 1),
        region("b", 0.5, 0, 0.5, 1),
      ])
    ).toBe(false);
  });

  it("CMPS-02: non-adjacent rects are not overlap", () => {
    expect(
      hasOverlappingRegions([
        region("a", 0, 0, 0.3, 0.3),
        region("b", 0.5, 0.5, 0.3, 0.3),
      ])
    ).toBe(false);
  });

  it("CMPS-02: single region never overlaps itself", () => {
    expect(hasOverlappingRegions([region("a", 0, 0, 1, 1)])).toBe(false);
  });

  it("CMPS-02: identical rects are overlap", () => {
    expect(
      hasOverlappingRegions([
        region("a", 0.1, 0.1, 0.4, 0.4),
        region("b", 0.1, 0.1, 0.4, 0.4),
      ])
    ).toBe(true);
  });
});

describe("renderComposedSlide", () => {
  let shapesMock: any;
  let slideMock: any;
  let contextMock: any;

  beforeEach(() => {
    shapesMock = {
      addGeometricShape: vi.fn().mockReturnValue({
        fill: { setImage: vi.fn(), setSolidColor: vi.fn() },
        lineFormat: { weight: 0, color: "", dashStyle: "solid" },
        textFrame: {
          textRange: {
            text: "",
            font: {},
            paragraphFormat: { horizontalAlignment: "" },
          },
          verticalAlignment: "",
          leftMargin: 0,
          topMargin: 0,
          bottomMargin: 0,
          rightMargin: 0,
        },
        altTextDescription: "",
      }),
      addTextBox: vi.fn().mockReturnValue({
        textFrame: {
          textRange: { font: {}, text: "" },
          leftMargin: 0,
        },
        lineFormat: { weight: 0 },
      }),
      addTable: vi.fn().mockReturnValue({
        textFrame: { textRange: { font: {} } },
        lineFormat: { weight: 0 },
      }),
      load: vi.fn(),
      items: [],
    };
    slideMock = { shapes: shapesMock, load: vi.fn(), id: "slide-1" };

    const slidesCollection = {
      getItemAt: vi.fn().mockReturnValue(slideMock),
      add: vi.fn(),
      getCount: vi.fn().mockReturnValue({ value: 1 }),
      load: vi.fn(),
      items: [slideMock],
    };
    contextMock = {
      presentation: {
        slides: slidesCollection,
        getSelectedSlides: () => ({ load: vi.fn(), items: [slideMock] }),
      },
      sync: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("PowerPoint", {
      run: async (cb: any) => cb(contextMock),
      GeometricShapeType: { rectangle: "rectangle" },
      ParagraphHorizontalAlignment: { left: "left", center: "center", right: "right" },
      TextVerticalAlignment: { top: "top", middle: "middle", bottom: "bottom" },
      ShapeLineDashStyle: { solid: "solid", dash: "dash" },
    });
    vi.stubGlobal("Office", {
      context: { requirements: { isSetSupported: () => false } },
    });
  });

  function makeContent(partial: Partial<ComposedSlideContent> = {}): ComposedSlideContent {
    return {
      type: "composed",
      title: "Test title",
      subtitle: "Test subtitle",
      commentary: "Test commentary.",
      regions: [],
      ...partial,
    };
  }

  it("CMPS-02: dispatches shape creation for title + commentary regions", async () => {
    await renderComposedSlide(
      makeContent({
        regions: [
          { id: "t", kind: "title", x: 0.04, y: 0.04, w: 0.92, h: 0.12 },
          { id: "c", kind: "commentary", x: 0.04, y: 0.2, w: 0.92, h: 0.7 },
        ],
      })
    );
    // Title + commentary both dispatch to addTextBox via addTitle/addBody primitives
    expect(shapesMock.addTextBox).toHaveBeenCalledTimes(2);
  });

  it("CHRT-04: chart region calls fill.setImage with raw base64 when chartPngBase64 present", async () => {
    const setImage = vi.fn();
    shapesMock.addGeometricShape = vi.fn().mockReturnValue({
      fill: { setImage },
      lineFormat: { weight: 0 },
      altTextDescription: "",
    });
    await renderComposedSlide(
      makeContent({
        regions: [{ id: "ch", kind: "chart", x: 0.04, y: 0.2, w: 0.56, h: 0.74 }],
        chartPngBase64: "RAWBASE64",
      })
    );
    expect(shapesMock.addGeometricShape).toHaveBeenCalledTimes(1);
    expect(setImage).toHaveBeenCalledWith("RAWBASE64");
  });

  it("CHRT-04: chart region is skipped when chartPngBase64 is absent", async () => {
    await renderComposedSlide(
      makeContent({
        regions: [{ id: "ch", kind: "chart", x: 0.04, y: 0.2, w: 0.56, h: 0.74 }],
      })
    );
    expect(shapesMock.addGeometricShape).not.toHaveBeenCalled();
  });

  it("TABL-NATV-01: table region passes headers + rows + options to addTable", async () => {
    await renderComposedSlide(
      makeContent({
        regions: [{ id: "tb", kind: "table", x: 0.04, y: 0.2, w: 0.92, h: 0.74 }],
        tableSpec: {
          renderMode: "native-tablev2",
          columns: [
            { key: "state", header: "State" },
            { key: "sales", header: "Sales" },
          ],
          rows: [
            { state: "NSW", sales: 100 },
            { state: "VIC", sales: 80 },
          ],
          showRowTotals: true,
          showColumnTotals: true,
          showRowNumbers: true,
        },
      })
    );
    // tableRenderer's addTable ends up calling the Office.js shapes.addTable
    expect(shapesMock.addTable).toHaveBeenCalledTimes(1);
    const [, colCount, props] = shapesMock.addTable.mock.calls[0];
    // # + State + Sales + Total = 4 columns when showRowNumbers + showRowTotals are both on
    expect(colCount).toBe(4);
    expect(props.values[0]).toEqual(["#", "State", "Sales", "Total"]);
  });

  it("skips table region when tableSpec is absent", async () => {
    await renderComposedSlide(
      makeContent({
        regions: [{ id: "tb", kind: "table", x: 0.04, y: 0.2, w: 0.92, h: 0.74 }],
      })
    );
    expect(shapesMock.addTable).not.toHaveBeenCalled();
  });

  it("dispatches subtitle region to addTextBox via addSummaryText when subtitle is set", async () => {
    await renderComposedSlide(
      makeContent({
        subtitle: "My subtitle",
        regions: [{ id: "s", kind: "subtitle", x: 0.04, y: 0.16, w: 0.92, h: 0.06 }],
      })
    );
    expect(shapesMock.addTextBox).toHaveBeenCalledTimes(1);
  });

  it("dispatches callout region to addCalloutBox when calloutText is set", async () => {
    await renderComposedSlide(
      makeContent({
        calloutText: "KEY INSIGHT",
        regions: [{ id: "co", kind: "callout", x: 0.04, y: 0.8, w: 0.92, h: 0.18 }],
      })
    );
    // addCalloutBox uses addGeometricShape (two shapes: box + accent)
    expect(shapesMock.addGeometricShape).toHaveBeenCalled();
  });

  it("runs inside exactly one PowerPoint.run and calls context.sync", async () => {
    const powerPointRunSpy = vi.fn(async (cb: any) => cb(contextMock));
    vi.stubGlobal("PowerPoint", {
      run: powerPointRunSpy,
      GeometricShapeType: { rectangle: "rectangle" },
      ParagraphHorizontalAlignment: { left: "left", center: "center", right: "right" },
      TextVerticalAlignment: { top: "top", middle: "middle", bottom: "bottom" },
      ShapeLineDashStyle: { solid: "solid", dash: "dash" },
    });
    await renderComposedSlide(
      makeContent({
        regions: [{ id: "t", kind: "title", x: 0.04, y: 0.04, w: 0.92, h: 0.12 }],
      })
    );
    expect(powerPointRunSpy).toHaveBeenCalledTimes(1);
    // context.sync may be called multiple times (addSlideAtCurrentPosition syncs
    // internally); we care that the renderer commits at the end.
    expect(contextMock.sync).toHaveBeenCalled();
  });
});
