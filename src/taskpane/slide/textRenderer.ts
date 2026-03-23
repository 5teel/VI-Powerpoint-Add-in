/**
 * Text rendering primitives for PowerPoint slides.
 * Creates title text boxes, body bullet text boxes, callout boxes, and summary text.
 * All functions are synchronous — they add proxy objects to the batch.
 * The caller is responsible for calling context.sync() afterward.
 */

import { LayoutRegion } from "./types";
import { COLORS, FONT, BULLET_INDENT, INNER_PADDING } from "./constants";

/**
 * Adds a title text box to the slide.
 * Font: Calibri 28pt bold, Summit Navy (#0F1330).
 */
export function addTitle(
  shapes: PowerPoint.ShapeCollection,
  text: string,
  region: LayoutRegion
): PowerPoint.Shape {
  const shape = shapes.addTextBox(text, {
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
  });
  shape.textFrame.textRange.font.name = FONT.FAMILY;
  shape.textFrame.textRange.font.size = FONT.TITLE_SIZE;
  shape.textFrame.textRange.font.bold = true;
  shape.textFrame.textRange.font.color = COLORS.SUMMIT_NAVY;
  return shape;
}

/**
 * Adds a body text box with bullet points.
 * Each bullet is prefixed with Unicode bullet character.
 * Font: Calibri 18pt regular, body text gray (#333333).
 * Left margin: 18pt (BULLET_INDENT).
 */
export function addBody(
  shapes: PowerPoint.ShapeCollection,
  bullets: string[],
  region: LayoutRegion
): PowerPoint.Shape {
  const bulletText = bullets.map((b) => `\u2022 ${b}`).join("\n");
  const shape = shapes.addTextBox(bulletText, {
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
  });
  shape.textFrame.textRange.font.name = FONT.FAMILY;
  shape.textFrame.textRange.font.size = FONT.BODY_SIZE;
  shape.textFrame.textRange.font.bold = false;
  shape.textFrame.textRange.font.color = COLORS.BODY_TEXT;
  shape.textFrame.leftMargin = BULLET_INDENT;
  return shape;
}

/**
 * Adds a key insight callout box — a rectangle with light blue fill,
 * plus a thin navy accent border strip on the left edge.
 *
 * The two shapes (main box + accent strip) render correctly without grouping.
 * Grouping requires a sync first (Pitfall 5) and is deferred to the slide
 * renderer if needed.
 *
 * Font: Calibri 22pt bold, Summit Navy (#0F1330).
 * Fill: Light Summit Blue (#EBF0FA).
 * Accent border: 3pt wide, Summit Navy (#0F1330).
 * Margins: left=18, top=12, bottom=12, right=12.
 */
export function addCalloutBox(
  shapes: PowerPoint.ShapeCollection,
  text: string,
  region: LayoutRegion
): PowerPoint.Shape {
  // Main rectangle (background + text)
  const box = shapes.addGeometricShape(PowerPoint.GeometricShapeType.rectangle, {
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
  });
  box.fill.setSolidColor(COLORS.CALLOUT_BG);
  box.textFrame.textRange.text = text;
  box.textFrame.textRange.font.name = FONT.FAMILY;
  box.textFrame.textRange.font.size = FONT.INSIGHT_SIZE;
  box.textFrame.textRange.font.bold = true;
  box.textFrame.textRange.font.color = COLORS.CALLOUT_TEXT;
  box.textFrame.verticalAlignment = PowerPoint.TextVerticalAlignment.middle;
  box.textFrame.leftMargin = BULLET_INDENT; // 18pt to clear accent border
  box.textFrame.topMargin = INNER_PADDING;
  box.textFrame.bottomMargin = INNER_PADDING;
  box.textFrame.rightMargin = INNER_PADDING;

  // Left accent border (thin rectangle)
  const accent = shapes.addGeometricShape(PowerPoint.GeometricShapeType.rectangle, {
    left: region.left,
    top: region.top,
    width: 3,
    height: region.height,
  });
  accent.fill.setSolidColor(COLORS.CALLOUT_BORDER);

  return box;
}

/**
 * Adds a summary text box (plain paragraph, no bullet prefix).
 * Used by the table-text template for the summary region.
 * Font: Calibri 18pt regular, body text gray (#333333).
 * No left margin indent (unlike addBody).
 */
export function addSummaryText(
  shapes: PowerPoint.ShapeCollection,
  text: string,
  region: LayoutRegion
): PowerPoint.Shape {
  const shape = shapes.addTextBox(text, {
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
  });
  shape.textFrame.textRange.font.name = FONT.FAMILY;
  shape.textFrame.textRange.font.size = FONT.BODY_SIZE;
  shape.textFrame.textRange.font.bold = false;
  shape.textFrame.textRange.font.color = COLORS.BODY_TEXT;
  return shape;
}
