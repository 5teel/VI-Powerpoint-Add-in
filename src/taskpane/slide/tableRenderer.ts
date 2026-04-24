/**
 * Table rendering for PowerPoint slides (TABL-01, TABL-02, TABL-NATV-01).
 * Creates formatted data tables with Summit navy headers, alternating row colors,
 * right-aligned numbers, and left-aligned text via specificCellProperties.
 *
 * Does NOT use the `style` property (requires API 1.9, not available — Pitfall 3).
 *
 * Phase 5 extension (TABL-NATV-01): optional TableRenderOptions 5th parameter
 * adds showRowNumbers (# prefix column), showRowTotals (Total suffix column),
 * showColumnTotals (Total footer row), showPagination (logged, not rendered),
 * and maxRows (overrides the 10-row cap).
 *
 * Ordering: row totals → row numbers → column totals, so the bottom-right cell
 * is the grand total when both dimensions are enabled.
 */

import { LayoutRegion } from "./types";
import { COLORS, FONT } from "./constants";
import { formatCellValue } from "./numberFormatter";

/**
 * Options for addTable (TABL-NATV-01).
 * Absent options preserve existing behaviour verbatim (backward-compatible).
 */
export interface TableRenderOptions {
  showRowNumbers?: boolean;
  showColumnTotals?: boolean;
  showRowTotals?: boolean;
  /** Intentionally unused — TableV2 has no native pagination. Logs once via console.info. */
  showPagination?: boolean;
  /** Overrides default 10-row cap. */
  maxRows?: number;
}

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
 * - Optional (TABL-NATV-01): row numbers, row totals, column totals via options
 *
 * @returns The table shape proxy (caller must sync).
 */
export function addTable(
  shapes: PowerPoint.ShapeCollection,
  headers: string[],
  rows: (string | number)[][],
  region: LayoutRegion,
  options: TableRenderOptions = {}
): PowerPoint.Shape {
  const rowCap = options.maxRows ?? 10;

  if (options.showPagination) {
    // Intentionally unsupported — native TableV2 has no pagination primitive.
    // eslint-disable-next-line no-console
    console.info(
      "[tableRenderer] showPagination requested but ignored — TableV2 has no native pagination."
    );
  }

  const colCount = headers.length;

  // Normalize rows: pad short rows, trim long rows, apply row cap.
  const normalizedRows = rows.map((row) => {
    if (row.length === colCount) return row;
    if (row.length > colCount) return row.slice(0, colCount);
    return [...row, ...Array(colCount - row.length).fill("")];
  });
  const cappedRows = normalizedRows.slice(0, rowCap);

  // Apply TABL-NATV-01 options on the raw headers + cappedRows BEFORE formatting.
  // Ordering: row totals first (so column total of Total column is the grand total),
  // then row numbers (prepend # column so it stays far left), then column totals
  // (append footer row after all augmentation).

  let workingHeaders: string[] = [...headers];
  let workingRows: (string | number)[][] = cappedRows.map((r) => [...r]);

  // Row totals — append "Total" column with per-row numeric sum.
  if (options.showRowTotals) {
    workingHeaders = [...workingHeaders, "Total"];
    workingRows = workingRows.map((row) => {
      const rowSum = row.reduce<number>(
        (acc, cell) => acc + (typeof cell === "number" ? cell : 0),
        0
      );
      return [...row, rowSum];
    });
  }

  // Row numbers — prepend "#" column with 1..N body numbering.
  if (options.showRowNumbers) {
    workingHeaders = ["#", ...workingHeaders];
    workingRows = workingRows.map((row, idx) => [idx + 1, ...row]);
  }

  // Column totals — append footer row with per-column numeric sum.
  // The "#" column (if present) gets "Total" label; other non-numeric columns empty string.
  if (options.showColumnTotals) {
    const totalsRow: (string | number)[] = workingHeaders.map((_, colIdx) => {
      // Row-numbers "#" column: "Total" label
      if (options.showRowNumbers && colIdx === 0) return "Total";

      const colValues = workingRows.map((r) => r[colIdx]);
      const anyNumber = colValues.some((v) => typeof v === "number");
      if (!anyNumber) {
        // Leftmost non-numeric column (excluding # if present) gets "Total" label
        const firstNonNumColIdx = options.showRowNumbers ? 1 : 0;
        return colIdx === firstNonNumColIdx ? "Total" : "";
      }
      return colValues.reduce<number>(
        (acc, v) => acc + (typeof v === "number" ? v : 0),
        0
      );
    });
    workingRows = [...workingRows, totalsRow];
  }

  const effectiveColCount = workingHeaders.length;
  const rowCount = workingRows.length + 1; // +1 header

  // Format body rows for display
  const formattedRows = workingRows.map((row) => row.map((cell) => formatCellValue(cell)));

  const values: string[][] = [
    workingHeaders,
    ...formattedRows.map((row) => row.map((cell) => cell.display)),
  ];

  // Build specificCellProperties 2D array
  const specificCellProperties: PowerPoint.TableCellProperties[][] = [];

  // Header row properties
  const headerRowProps: PowerPoint.TableCellProperties[] = workingHeaders.map(() => ({
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

  // Body row properties (alternating fills; numeric cells right-aligned)
  for (let rowIndex = 0; rowIndex < workingRows.length; rowIndex++) {
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
  const shape = shapes.addTable(rowCount, effectiveColCount, {
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
    values,
    specificCellProperties,
  });

  return shape;
}
