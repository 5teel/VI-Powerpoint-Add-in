/**
 * Phase 6 D-12: Suggested-questions tray — hard-coded chip array.
 *
 * Each chip MUST produce a great slide against the live Cube AI agent —
 * validated end-to-end during the wave 7 UAT checkpoint before calling
 * Phase 6 complete. Change these only after re-running the full UAT matrix.
 *
 * The final entry, "Quarterly review", is deliberately multi-slide — it's the
 * trigger phrase the meta-composer (D-05) recognises to plan a 2-6 slide section.
 * Do not reorder without updating the 06-UI-SPEC copy contract.
 */
export const SUGGESTED_QUESTIONS: ReadonlyArray<string> = [
  "Top 10 products by margin",
  "Q3 sales by store",
  "Units sold by category",
  "Year-over-year regional performance",
  "Quarterly review",
] as const;
