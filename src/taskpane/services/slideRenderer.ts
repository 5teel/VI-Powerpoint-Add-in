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
  IMAGE_REGION,
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

    switch (content.type) {
      case "text-only": {
        const titleRegion = adaptLayout(TEXT_ONLY.TITLE, slideWidth);
        const bodyRegion = adaptLayout(TEXT_ONLY.BODY, slideWidth);
        const calloutRegion = adaptLayout(TEXT_ONLY.CALLOUT, slideWidth);

        addTitle(shapes, content.title, titleRegion);
        addBody(shapes, content.bullets, bodyRegion);
        addCalloutBox(shapes, content.insight, calloutRegion);
        break;
      }

      case "chart-text": {
        const titleRegion = adaptLayout(CHART_TEXT.TITLE, slideWidth);
        const chartRegion = adaptLayout(CHART_TEXT.CHART, slideWidth);
        const textRegion = adaptLayout(CHART_TEXT.TEXT, slideWidth);
        const calloutRegion = adaptLayout(CHART_TEXT.CALLOUT, slideWidth);

        addTitle(shapes, content.title, titleRegion);
        addChartPlaceholder(shapes, chartRegion);
        addBody(shapes, content.summaryBullets, textRegion);
        addCalloutBox(shapes, content.insight, calloutRegion);
        break;
      }

      case "table-text": {
        const titleRegion = adaptLayout(TABLE_TEXT.TITLE, slideWidth);
        const tableRegion = adaptLayout(TABLE_TEXT.TABLE, slideWidth);
        const summaryRegion = adaptLayout(TABLE_TEXT.SUMMARY, slideWidth);

        addTitle(shapes, content.title, titleRegion);
        addTable(shapes, content.headers, content.rows, tableRegion);
        addSummaryText(shapes, content.summary, summaryRegion);
        break;
      }

      case "full-combination": {
        const titleRegion = adaptLayout(FULL_COMBINATION.TITLE, slideWidth);
        const chartRegion = adaptLayout(FULL_COMBINATION.CHART, slideWidth);
        const tableRegion = adaptLayout(FULL_COMBINATION.TABLE, slideWidth);
        const calloutRegion = adaptLayout(FULL_COMBINATION.CALLOUT, slideWidth);

        addTitle(shapes, content.title, titleRegion);
        addChartPlaceholder(shapes, chartRegion);
        addTable(shapes, content.headers, content.rows, tableRegion);
        addCalloutBox(shapes, content.insight, calloutRegion);
        break;
      }
    }

    // Add product image if provided (D-07)
    if (productImageBase64) {
      const imageRegion = adaptLayout(IMAGE_REGION, slideWidth);
      const imgShape = shapes.addGeometricShape(
        PowerPoint.GeometricShapeType.rectangle,
        {
          left: imageRegion.left,
          top: imageRegion.top,
          width: imageRegion.width,
          height: imageRegion.height,
        }
      );
      imgShape.fill.setImage(productImageBase64);
      imgShape.lineFormat.weight = 0;
      imgShape.altTextDescription = "Product image";
    }

    // Commit all shapes to PowerPoint in a single sync
    await context.sync();
  });
}
