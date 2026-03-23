/**
 * Number format detection and formatting for table cell values (D-07).
 * Detects currency, percentage, large integer, decimal, and plain text.
 */

import { FormatResult } from "./types";

/**
 * Formats a raw cell value for display in a slide table.
 *
 * Detection order:
 * 1. Currency — starts with `$` followed by digits/commas/decimals
 * 2. Percentage — digits followed by `%`
 * 3. Parseable number — large integers get comma formatting, decimals kept as-is
 * 4. Plain text — everything else
 */
export function formatCellValue(raw: string | number): FormatResult {
  // Handle numeric input directly
  if (typeof raw === "number") {
    if (!isFinite(raw)) {
      return { display: String(raw), isNumeric: false };
    }
    return formatNumber(raw);
  }

  const str = String(raw).trim();
  if (str === "") {
    return { display: "", isNumeric: false };
  }

  // Currency: starts with $ followed by digits, commas, decimals
  if (/^\$[\d,.]+$/.test(str)) {
    const num = parseFloat(str.replace(/[$,]/g, ""));
    if (!isNaN(num)) {
      // Preserve decimals if present in input
      const hasDecimals = str.includes(".");
      const formatted = hasDecimals
        ? num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      return { display: `$${formatted}`, isNumeric: true };
    }
    return { display: str, isNumeric: true };
  }

  // Percentage: digits (with optional comma/decimal) followed by %
  if (/^[\d,.]+%$/.test(str)) {
    return { display: str, isNumeric: true };
  }

  // Parseable number (no currency/percentage prefix/suffix)
  const cleaned = str.replace(/,/g, "");
  const num = parseFloat(cleaned);
  if (!isNaN(num) && /^[\d,.]+$/.test(str)) {
    return formatNumber(num);
  }

  // Plain text
  return { display: str, isNumeric: false };
}

/** Format a pure number value. */
function formatNumber(num: number): FormatResult {
  if (Number.isInteger(num) && Math.abs(num) >= 1000) {
    return { display: num.toLocaleString("en-US"), isNumeric: true };
  }
  // For smaller integers or decimals, use toLocaleString for consistent formatting
  return { display: num.toLocaleString("en-US"), isNumeric: true };
}
