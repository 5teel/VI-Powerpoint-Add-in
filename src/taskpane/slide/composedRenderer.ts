/**
 * Phase 5 composed-slide renderer (CMPS-02).
 *
 * Consumes ComposedSlideContent (fractional regions from a validated
 * CompositionPlan) and produces a PowerPoint slide inside a single Office.js
 * batch (S4 pattern — no nested batches).
 *
 * Legacy template-based variants (TextOnlyContent, ChartTextContent,
 * TableTextContent, FullCombinationContent) remain in slideRenderer.ts;
 * the dispatcher in slideRenderer.insertSlide does an EARLY RETURN to
 * renderComposedSlide for the composed variant.
 *
 * G3 guardrail (pairwise region overlap) is exposed as hasOverlappingRegions
 * for pre-flight checks by upstream callers; the renderer itself trusts
 * regions to be valid.
 */
import { detectSlideWidth, addSlideAtCurrentPosition } from "./layoutEngine";
import { addTitle, addBody, addSummaryText, addCalloutBox } from "./textRenderer";
import { addTable, type TableRenderOptions } from "./tableRenderer";
import type { LayoutRegion } from "./types";
import { WIDESCREEN } from "./constants";
import type { ComposedSlideContent } from "./types";

export interface Region {
  id: string;
  kind: "title" | "subtitle" | "commentary" | "chart" | "table" | "callout";
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Maps a fractional region to integer PowerPoint points.
 *
 * Example: fractionToPoints({x:0.5, y:0.5, w:0.5, h:0.5}, 960, 540)
 *          → {left:480, top:270, width:480, height:270}
 */
export function fractionToPoints(
  r: Region,
  slideWidthPt: number,
  slideHeightPt: number
): LayoutRegion {
  return {
    left: Math.round(r.x * slideWidthPt),
    top: Math.round(r.y * slideHeightPt),
    width: Math.round(r.w * slideWidthPt),
    height: Math.round(r.h * slideHeightPt),
  };
}

/**
 * Pairwise axis-aligned rectangle overlap detection (G3 guardrail).
 *
 * Returns true if ANY two regions in the list overlap. Touching edges
 * (e.g., a.x + a.w === b.x) do NOT count as overlap — this is strict
 * geometric overlap, not proximity. The composer is responsible for
 * applying any tolerance upstream.
 */
export function hasOverlappingRegions(regions: Region[]): boolean {
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      if (rectsOverlap(regions[i], regions[j])) return true;
    }
  }
  return false;
}

function rectsOverlap(a: Region, b: Region): boolean {
  // Non-overlap if one rect is entirely to the left, right, above, or below
  // the other. Touching edges (a.x + a.w === b.x) satisfy `<=` and count as
  // non-overlap (strict).
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

/**
 * Renders a ComposedSlideContent to a new slide.
 *
 * Single Office.js batch (S4 pattern). Detects slide width, creates a slide,
 * iterates regions mapping fractional coords → points → dispatch by kind.
 * Final context.sync() commits all shapes in one round-trip.
 */
export async function renderComposedSlide(content: ComposedSlideContent): Promise<void> {
  await PowerPoint.run(async (context) => {
    const slideWidth = await detectSlideWidth(context);
    const slideHeight = WIDESCREEN.height;

    const slide = await addSlideAtCurrentPosition(context);
    const shapes = slide.shapes;

    for (const region of content.regions) {
      const rect = fractionToPoints(region, slideWidth, slideHeight);

      switch (region.kind) {
        case "title":
          addTitle(shapes, content.title, rect);
          break;
        case "subtitle":
          if (content.subtitle) addSummaryText(shapes, content.subtitle, rect);
          break;
        case "commentary":
          addBody(shapes, [content.commentary], rect);
          break;
        case "callout":
          if (content.calloutText) addCalloutBox(shapes, content.calloutText, rect);
          break;
        case "chart": {
          if (!content.chartPngBase64) break;
          const shape = shapes.addGeometricShape(
            PowerPoint.GeometricShapeType.rectangle,
            {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }
          );
          shape.fill.setImage(content.chartPngBase64);
          shape.lineFormat.weight = 0;
          shape.altTextDescription = content.title;
          break;
        }
        case "table": {
          if (!content.tableSpec) break;
          const { columns, rows: tableRows } = content.tableSpec;
          const headers = columns.map((c) => c.header);
          const bodyRows = tableRows.map((row) =>
            columns.map((c) => {
              const v = row[c.key];
              // Type-narrow to primitives (T-05-17 mitigation): non-primitive
              // values coerce to strings rather than leaking into styling logic.
              return typeof v === "number" ? v : String(v ?? "");
            })
          );
          const tableOptions: TableRenderOptions = {
            showRowNumbers: content.tableSpec.showRowNumbers ?? false,
            showColumnTotals: content.tableSpec.showColumnTotals ?? false,
            showRowTotals: content.tableSpec.showRowTotals ?? false,
            showPagination: content.tableSpec.showPagination ?? false,
          };
          addTable(shapes, headers, bodyRows, rect, tableOptions);
          break;
        }
      }
    }

    await context.sync();
  });
}
