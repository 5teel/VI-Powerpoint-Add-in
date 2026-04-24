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
  const rowsJsonFull = JSON.stringify(input.rows);
  const rowsJson =
    rowsJsonFull.length <= MAX_ROWS_CHARS ? rowsJsonFull : rowsJsonFull.slice(0, MAX_ROWS_CHARS);
  const truncated = rowsJsonFull.length > MAX_ROWS_CHARS;

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
