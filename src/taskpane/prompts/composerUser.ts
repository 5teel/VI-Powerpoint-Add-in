/**
 * Per-request user content assembler (Phase 5, NOT cached).
 * Applies defensive truncation discipline: rows head-truncated at 12k chars,
 * commentary tail-truncated at 2k chars (tail so concrete facts at the end
 * are preserved over generic preamble).
 */
import type { ComposerInput } from "../services/composer";

export const MAX_ROWS_CHARS = 12_000;
export const MAX_COMMENTARY_CHARS = 2_000;

export function buildUserContent(input: ComposerInput): string {
  // Row-boundary truncation: a byte-boundary slice of JSON.stringify(rows) would
  // almost always produce malformed JSON like `[{"state":"NSW"},{"state":"VI`
  // which silently invalidates the advertised schema. Binary-search the largest
  // prefix of rows whose JSON fits under MAX_ROWS_CHARS so the output is always
  // a valid, well-formed JSON array.
  const rowsJsonFull = JSON.stringify(input.rows);
  let rowsJson: string;
  let truncated: boolean;
  if (rowsJsonFull.length <= MAX_ROWS_CHARS) {
    rowsJson = rowsJsonFull;
    truncated = false;
  } else {
    // Binary search for the largest row count whose serialised length fits.
    let lo = 0;
    let hi = input.rows.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (JSON.stringify(input.rows.slice(0, mid)).length <= MAX_ROWS_CHARS) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    rowsJson = JSON.stringify(input.rows.slice(0, lo));
    truncated = lo < input.rows.length;
  }

  const commentaryFull = input.cubeMeta.commentary ?? "";
  const commentary =
    commentaryFull.length <= MAX_COMMENTARY_CHARS
      ? commentaryFull
      : commentaryFull.slice(-MAX_COMMENTARY_CHARS);

  const originalSpec = input.cubeMeta.vegaSpec ?? input.cubeMeta.tableChartSpec ?? {};

  return [
    `User question: ${input.userQuestion}`,
    `Cube query title: ${input.cubeMeta.queryTitle}`,
    `Cube description: ${input.cubeMeta.description}`,
    `Cube commentary (source-of-truth narrative): ${commentary}`,
    `Rows (${input.rows.length}${truncated ? ", truncated" : ""}): ${rowsJson}`,
    `Original chart spec: ${JSON.stringify(originalSpec)}`,
  ].join("\n\n");
}
