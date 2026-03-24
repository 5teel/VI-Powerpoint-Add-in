/**
 * Top-level slide renderer orchestrator (LYOT-02).
 * Single entry point for creating fully formatted slides from content data.
 *
 * Wraps all rendering in a single PowerPoint.run() call (Pattern 1).
 * Routes content to the correct template layout and renderer functions.
 */

import { SlideContent } from "../slide/types";
import {
  TEXT_ONLY,
  CHART_TEXT,
  TABLE_TEXT,
  FULL_COMBINATION,
  WITH_IMAGE,
  IMAGE_TABLE_MAX_ROWS,
  adaptLayout,
} from "../slide/constants";
import { addTitle, addBody, addCalloutBox, addSummaryText } from "../slide/textRenderer";
import { addTable } from "../slide/tableRenderer";
import { addChartPlaceholder } from "../slide/placeholderRenderer";
import { detectSlideWidth, addSlideAtCurrentPosition } from "../slide/layoutEngine";

/**
 * Inserts a new slide with the given content, using the appropriate layout template.
 *
 * Supports all four template types:
 * - "text-only": title + bullets + callout
 * - "chart-text": title + chart placeholder + summary bullets + callout
 * - "table-text": title + data table + summary text
 * - "full-combination": title + chart placeholder + table + callout
 *
 * All shapes are created within a single PowerPoint.run() call for performance.
 * Layout regions are adapted for the detected slide width (D-01).
 */
export async function insertSlide(content: SlideContent, productImageBase64?: string): Promise<void> {
  await PowerPoint.run(async (context) => {
    // Detect slide dimensions for adaptive layout (D-01)
    const slideWidth = await detectSlideWidth(context);

    // Create a new slide at the current position (D-03, LYOT-03)
    const slide = await addSlideAtCurrentPosition(context);
    const shapes = slide.shapes;

    // When a product image is provided, use the image-aware layout
    // to prevent overlap: image left, content right, insight below.
    if (productImageBase64) {
      addTitle(shapes, content.title, adaptLayout(TEXT_ONLY.TITLE, slideWidth));

      // Product image on the left
      const imageRegion = adaptLayout(WITH_IMAGE.IMAGE, slideWidth);
      const imgShape = shapes.addGeometricShape(
        PowerPoint.GeometricShapeType.rectangle,
        { left: imageRegion.left, top: imageRegion.top, width: imageRegion.width, height: imageRegion.height }
      );
      imgShape.fill.setImage(productImageBase64);
      imgShape.lineFormat.weight = 0;
      imgShape.altTextDescription = "Product image";

      // Content on the right (table or bullets depending on type)
      switch (content.type) {
        case "text-only":
          addBody(shapes, content.bullets, adaptLayout(WITH_IMAGE.BODY, slideWidth));
          addCalloutBox(shapes, content.insight, adaptLayout(WITH_IMAGE.INSIGHT, slideWidth));
          break;
        case "chart-text":
          addBody(shapes, content.summaryBullets, adaptLayout(WITH_IMAGE.BODY, slideWidth));
          addCalloutBox(shapes, content.insight, adaptLayout(WITH_IMAGE.INSIGHT, slideWidth));
          break;
        case "table-text": {
          const cappedRows = content.rows.slice(0, IMAGE_TABLE_MAX_ROWS);
          addTable(shapes, content.headers, cappedRows, adaptLayout(WITH_IMAGE.TABLE, slideWidth));
          addSummaryText(shapes, content.summary, adaptLayout(WITH_IMAGE.INSIGHT, slideWidth));
          break;
        }
        case "full-combination": {
          const cappedRows = content.rows.slice(0, IMAGE_TABLE_MAX_ROWS);
          addTable(shapes, content.headers, cappedRows, adaptLayout(WITH_IMAGE.TABLE, slideWidth));
          addCalloutBox(shapes, content.insight, adaptLayout(WITH_IMAGE.INSIGHT, slideWidth));
          break;
        }
      }
    } else {
      // No product image — use standard layouts
      switch (content.type) {
        case "text-only": {
          addTitle(shapes, content.title, adaptLayout(TEXT_ONLY.TITLE, slideWidth));
          addBody(shapes, content.bullets, adaptLayout(TEXT_ONLY.BODY, slideWidth));
          addCalloutBox(shapes, content.insight, adaptLayout(TEXT_ONLY.CALLOUT, slideWidth));
          break;
        }
        case "chart-text": {
          addTitle(shapes, content.title, adaptLayout(CHART_TEXT.TITLE, slideWidth));
          addChartPlaceholder(shapes, adaptLayout(CHART_TEXT.CHART, slideWidth));
          addBody(shapes, content.summaryBullets, adaptLayout(CHART_TEXT.TEXT, slideWidth));
          addCalloutBox(shapes, content.insight, adaptLayout(CHART_TEXT.CALLOUT, slideWidth));
          break;
        }
        case "table-text": {
          addTitle(shapes, content.title, adaptLayout(TABLE_TEXT.TITLE, slideWidth));
          addTable(shapes, content.headers, content.rows, adaptLayout(TABLE_TEXT.TABLE, slideWidth));
          addSummaryText(shapes, content.summary, adaptLayout(TABLE_TEXT.SUMMARY, slideWidth));
          break;
        }
        case "full-combination": {
          addTitle(shapes, content.title, adaptLayout(FULL_COMBINATION.TITLE, slideWidth));
          addChartPlaceholder(shapes, adaptLayout(FULL_COMBINATION.CHART, slideWidth));
          addTable(shapes, content.headers, content.rows, adaptLayout(FULL_COMBINATION.TABLE, slideWidth));
          addCalloutBox(shapes, content.insight, adaptLayout(FULL_COMBINATION.CALLOUT, slideWidth));
          break;
        }
      }
    }

    // Commit all shapes to PowerPoint in a single sync
    await context.sync();
  });
}
