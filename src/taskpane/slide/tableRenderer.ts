/**
 * Table rendering for PowerPoint slides (TABL-01, TABL-02).
 * Creates formatted data tables with Summit navy headers, alternating row colors,
 * right-aligned numbers, and left-aligned text via specificCellProperties.
 *
 * Does NOT use the `style` property (requires API 1.9, not available — Pitfall 3).
 */

import { LayoutRegion } from "./types";
import { COLORS, FONT } from "./constants";
import { formatCellValue } from "./numberFormatter";

/** Standard border definition for all table cells. */
const CELL_BORDER = {
  color: COLORS.TABLE_BORDER,
  dashStyle: PowerPoint.ShapeLineDashStyle.solid,
  weight: 1,
};

const BORDERS = {
  left: CELL_BORDER,
  right: CELL_BORDER,
  top: CELL_BORDER,
  bottom: CELL_BORDER,
};

/**
 * Adds a formatted data table to the slide.
 *
 * - Header row: Summit navy background (#0F1330), white bold text, center-aligned
 * - Body rows: alternating white (#FFFFFF) / light blue-gray (#F2F4F8)
 * - Numeric cells: right-aligned; text cells: left-aligned
 * - All values run through formatCellValue() for display formatting
 *
 * @returns The table shape proxy (caller must sync).
 */
export function addTable(
  shapes: PowerPoint.ShapeCollection,
  headers: string[],
  rows: (string | number)[][],
  region: LayoutRegion
): PowerPoint.Shape {
  const colCount = headers.length;
  const rowCount = rows.length + 1; // +1 for header row

  // Build values 2D array: header row + formatted data rows
  const formattedRows = rows.map((row) =>
    row.map((cell) => formatCellValue(cell))
  );

  const values: string[][] = [
    headers,
    ...formattedRows.map((row) => row.map((cell) => cell.display)),
  ];

  // Build specificCellProperties 2D array
  const specificCellProperties: PowerPoint.TableCellProperties[][] = [];

  // Header row properties
  const headerRowProps: PowerPoint.TableCellProperties[] = headers.map(() => ({
    fill: { color: COLORS.TABLE_HEADER_BG },
    font: {
      color: COLORS.TABLE_HEADER_TEXT,
      name: FONT.FAMILY,
      size: FONT.TABLE_SIZE,
      bold: true,
    },
    horizontalAlignment: PowerPoint.ParagraphHorizontalAlignment.center,
    verticalAlignment: PowerPoint.TextVerticalAlignment.middle,
    borders: BORDERS,
  }));
  specificCellProperties.push(headerRowProps);

  // Body row properties
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const isEvenRow = rowIndex % 2 === 0;
    const rowProps: PowerPoint.TableCellProperties[] = formattedRows[rowIndex].map(
      (cell) => ({
        fill: { color: isEvenRow ? COLORS.TABLE_BODY_EVEN : COLORS.TABLE_BODY_ODD },
        font: {
          color: COLORS.BODY_TEXT,
          name: FONT.FAMILY,
          size: FONT.TABLE_SIZE,
        },
        horizontalAlignment: cell.isNumeric
          ? PowerPoint.ParagraphHorizontalAlignment.right
          : PowerPoint.ParagraphHorizontalAlignment.left,
        verticalAlignment: PowerPoint.TextVerticalAlignment.middle,
        borders: BORDERS,
      })
    );
    specificCellProperties.push(rowProps);
  }

  // Create the table — no style property (requires API 1.9)
  const shape = shapes.addTable(rowCount, colCount, {
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
    values,
    specificCellProperties,
  });

  return shape;
}
