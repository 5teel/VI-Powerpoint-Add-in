/**
 * Phase 6 D-01/D-02 refinement intent scorer — pure heuristic, zero network.
 *
 * Runs debounced (200ms) on chat input onChange from ChatPanel to decide
 * whether the "Refining: [last slide title]" chip is shown above the composer.
 * Threshold locked at 6 per 06-UI-SPEC §Interaction Contracts §Refinement Detection.
 *
 * Date.now() must be passed in via ctx.nowMs (not called inside) so unit tests
 * can assert deterministic scores against fixed timestamps.
 *
 * Scoring rules (06-RESEARCH §Pattern 1):
 *   +3  pronoun match — "it", "that", "this", "the chart|slide|table|commentary"
 *   +3  edit-verb match — "change", "add", "remove", "filter", "sort", "make", …
 *   +5  recency bonus — prior slide created within RECENCY_WINDOW_MS
 *   −1  no-recency penalty — no prior slide OR slide older than the window
 *   −2  length penalty — text length > LENGTH_PENALTY_CHARS (verbose new-question heuristic)
 *
 * Empty/whitespace-only text short-circuits to 0 so the chip never flickers on
 * an empty composer.
 */

export interface RefinementContext {
  /** "created" when the last assistant message inserted a slide; undefined otherwise. */
  lastAssistantSlideState?: "created";
  /** Epoch ms at which the last slide was inserted; undefined when no prior slide. */
  lastSlideCreatedAtMs?: number;
  /** Date.now() from the caller — injected for testability. */
  nowMs: number;
}

export const REFINEMENT_SCORE_THRESHOLD = 6;

const PRONOUNS = /\b(it|that|this|the chart|the slide|the table|the commentary)\b/;
const EDIT_VERBS =
  /\b(change|add|remove|filter|sort|make|swap|replace|update|show only|hide|highlight|shorten|expand|include|exclude)\b/;
const RECENCY_WINDOW_MS = 5 * 60 * 1000;
const LENGTH_PENALTY_CHARS = 120;

export function scoreRefinementIntent(input: string, ctx: RefinementContext): number {
  const text = input.toLowerCase().trim();
  if (text.length === 0) return 0;

  let score = 0;
  if (PRONOUNS.test(text)) score += 3;
  if (EDIT_VERBS.test(text)) score += 3;

  const hasRecentSlide =
    ctx.lastAssistantSlideState === "created" &&
    ctx.lastSlideCreatedAtMs !== undefined &&
    ctx.nowMs - ctx.lastSlideCreatedAtMs < RECENCY_WINDOW_MS;

  if (hasRecentSlide) {
    score += 5;
  } else {
    // No recent slide — cannot be a refinement of nothing. Withhold chip by
    // applying a small penalty so pronoun+verb alone (6) drops below threshold.
    score -= 1;
  }

  if (input.length > LENGTH_PENALTY_CHARS) score -= 2;

  return score;
}
