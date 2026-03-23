/**
 * Chart placeholder rendering for PowerPoint slides.
 * Creates a gray rectangle with centered "Chart Area" text and accessibility alt text.
 * In Phase 5, the placeholder fill will be replaced with real Chart.js images
 * via ShapeFill.setImage().
 */

import { LayoutRegion } from "./types";
import { COLORS, FONT } from "./constants";

/**
 * Adds a chart placeholder shape to the slide.
 *
 * - Fill: light gray (#E5E7EB)
 * - Border: 1pt solid, medium gray (#9CA3AF); dashed if lineFormat.dashStyle is available
 * - Text: "Chart Area", Calibri 14pt, medium gray, centered both ways
 * - Alt text set for accessibility
 *
 * @returns The placeholder shape proxy (caller must sync).
 */
export function addChartPlaceholder(
  shapes: PowerPoint.ShapeCollection,
  region: LayoutRegion
): PowerPoint.Shape {
  const shape = shapes.addGeometricShape(PowerPoint.GeometricShapeType.rectangle, {
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
  });

  // Fill
  shape.fill.setSolidColor(COLORS.PLACEHOLDER_FILL);

  // Border — attempt dashed, fall back to solid
  shape.lineFormat.color = COLORS.PLACEHOLDER_BORDER;
  shape.lineFormat.weight = 1;
  try {
    shape.lineFormat.dashStyle = PowerPoint.ShapeLineDashStyle.dash;
  } catch {
    // dashStyle not available — solid border is acceptable fallback
    shape.lineFormat.dashStyle = PowerPoint.ShapeLineDashStyle.solid;
  }

  // Centered placeholder text
  shape.textFrame.textRange.text = "Chart Area";
  shape.textFrame.textRange.font.name = FONT.FAMILY;
  shape.textFrame.textRange.font.size = FONT.TABLE_SIZE;
  shape.textFrame.textRange.font.color = COLORS.PLACEHOLDER_BORDER;
  shape.textFrame.verticalAlignment = PowerPoint.TextVerticalAlignment.middle;
  shape.textFrame.textRange.paragraphFormat.horizontalAlignment =
    PowerPoint.ParagraphHorizontalAlignment.center;

  // Accessibility
  shape.altTextDescription = "Chart area - data visualization placeholder";

  return shape;
}
