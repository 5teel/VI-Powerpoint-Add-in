import { describe, it, expect } from "vitest";
import {
  scoreRefinementIntent,
  REFINEMENT_SCORE_THRESHOLD,
  type RefinementContext,
} from "./refinementDetector";

/**
 * Phase 6 D-01/D-02 refinement intent scorer — 12 fixture cases.
 *
 * Threshold locked at 6 per 06-UI-SPEC §Interaction Contracts §Refinement Detection.
 * Scoring formula (from 06-RESEARCH §Pattern 1):
 *   +3 pronoun match (it / that / this / the chart / the slide / the table / the commentary)
 *   +3 edit verb match (change / add / remove / filter / sort / make / swap / …)
 *   +5 if a prior slide was created in the last 5 minutes (recency bonus)
 *   -2 length penalty when text > 120 chars
 * ctx.nowMs is injected by the caller — Date.now() is NEVER called inside for determinism.
 */
describe("scoreRefinementIntent (D-02)", () => {
  const NOW = 1_700_000_000_000;
  const RECENT = (agoSec: number) => NOW - agoSec * 1000;

  it("D-02: 'change it to pie chart' + slide created 30s ago → score ≥ 6 (chip visible)", () => {
    const ctx: RefinementContext = {
      lastAssistantSlideState: "created",
      lastSlideCreatedAtMs: RECENT(30),
      nowMs: NOW,
    };
    expect(scoreRefinementIntent("change it to pie chart", ctx)).toBeGreaterThanOrEqual(
      REFINEMENT_SCORE_THRESHOLD
    );
  });

  it("D-02: 'add Q3 numbers' + slide created 60s ago → score ≥ 6", () => {
    const ctx: RefinementContext = {
      lastAssistantSlideState: "created",
      lastSlideCreatedAtMs: RECENT(60),
      nowMs: NOW,
    };
    expect(scoreRefinementIntent("add Q3 numbers", ctx)).toBeGreaterThanOrEqual(
      REFINEMENT_SCORE_THRESHOLD
    );
  });

  it("D-02: 'make the chart bigger' + slide created 10s ago → score ≥ 6", () => {
    const ctx: RefinementContext = {
      lastAssistantSlideState: "created",
      lastSlideCreatedAtMs: RECENT(10),
      nowMs: NOW,
    };
    expect(scoreRefinementIntent("make the chart bigger", ctx)).toBeGreaterThanOrEqual(
      REFINEMENT_SCORE_THRESHOLD
    );
  });

  it("D-02: 'sort by sales descending' + slide created 60s ago → score ≥ 6", () => {
    const ctx: RefinementContext = {
      lastAssistantSlideState: "created",
      lastSlideCreatedAtMs: RECENT(60),
      nowMs: NOW,
    };
    expect(scoreRefinementIntent("sort by sales descending", ctx)).toBeGreaterThanOrEqual(
      REFINEMENT_SCORE_THRESHOLD
    );
  });

  it("D-02: 'show only California stores' + slide created 2min ago → score ≥ 6", () => {
    const ctx: RefinementContext = {
      lastAssistantSlideState: "created",
      lastSlideCreatedAtMs: RECENT(120),
      nowMs: NOW,
    };
    expect(scoreRefinementIntent("show only California stores", ctx)).toBeGreaterThanOrEqual(
      REFINEMENT_SCORE_THRESHOLD
    );
  });

  it("D-02: 'highlight the top performer' + slide created 30s ago → score ≥ 6", () => {
    const ctx: RefinementContext = {
      lastAssistantSlideState: "created",
      lastSlideCreatedAtMs: RECENT(30),
      nowMs: NOW,
    };
    expect(scoreRefinementIntent("highlight the top performer", ctx)).toBeGreaterThanOrEqual(
      REFINEMENT_SCORE_THRESHOLD
    );
  });

  it("D-02: 'What were total sales last quarter?' + slide created 30s ago → score < 6 (new question, no pronoun no edit verb)", () => {
    const ctx: RefinementContext = {
      lastAssistantSlideState: "created",
      lastSlideCreatedAtMs: RECENT(30),
      nowMs: NOW,
    };
    expect(scoreRefinementIntent("What were total sales last quarter?", ctx)).toBeLessThan(
      REFINEMENT_SCORE_THRESHOLD
    );
  });

  it("D-02: 'Quarterly review' + no slide yet → score < 6 (no slide recency bonus)", () => {
    const ctx: RefinementContext = {
      lastAssistantSlideState: undefined,
      lastSlideCreatedAtMs: undefined,
      nowMs: NOW,
    };
    expect(scoreRefinementIntent("Quarterly review", ctx)).toBeLessThan(
      REFINEMENT_SCORE_THRESHOLD
    );
  });

  it("D-02: 'change it' + slide created 10 minutes ago → score < 6 (slide stale, no recency bonus)", () => {
    const ctx: RefinementContext = {
      lastAssistantSlideState: "created",
      lastSlideCreatedAtMs: NOW - 10 * 60 * 1000,
      nowMs: NOW,
    };
    // "change it" = verb (+3) + pronoun (+3) = 6 WITHOUT recency. Slide is stale (>5min)
    // so no recency bonus. Still 6 — but stale context should push below threshold.
    // Implementation note: the recency window cutoff is strict (<5min). Stale slide
    // gives NO bonus, so score stays at 6. Test assertion: < threshold means < 6.
    // Per the 06-RESEARCH §Pattern 1 formula, stale slides still score 6 for
    // "change it" — so the intended behaviour is that plain 6 with no recency bonus
    // IS treated as non-refinement. We assert < 6 to encode the spec contract: stale
    // context MUST prevent chip display. The formula must therefore subtract something
    // (e.g., explicit staleness penalty) OR the threshold semantics are "≥ threshold AND
    // had recency bonus". We implement staleness by requiring recency for chip visibility
    // via a separate clause in the scorer: if slide is stale (or absent), cap pronoun+verb
    // alone at < threshold. Simplest implementation: when stale (slide exists but >5min),
    // subtract 1 to drop 6 → 5 below threshold.
    //
    // Concrete implementation chosen: staleness guard — if lastAssistantSlideState is
    // "created" but lastSlideCreatedAtMs is outside the 5min window, apply a -1 penalty
    // so score ends at 5 (< 6). This keeps the pronoun/verb value but withholds the
    // chip when the user likely moved on.
    expect(scoreRefinementIntent("change it", ctx)).toBeLessThan(REFINEMENT_SCORE_THRESHOLD);
  });

  it("D-02: long new-question 'please provide a comprehensive summary...' + recent slide → score < 6 (length penalty over 120 chars + no pronoun/verb match)", () => {
    const ctx: RefinementContext = {
      lastAssistantSlideState: "created",
      lastSlideCreatedAtMs: RECENT(30),
      nowMs: NOW,
    };
    // Genuinely long new-question style prompt — deliberately avoids pronouns and
    // edit verbs so only the recency bonus (+5) + length penalty (−2) apply.
    // Net = 3, below threshold. Encodes the intent of 06-RESEARCH §Pattern 1:
    // long verbose questions are NOT refinements even when a recent slide exists.
    const longText =
      "please provide a comprehensive summary of revenue across all geographic regions over the previous four fiscal quarters for executive review";
    expect(longText.length).toBeGreaterThan(120);
    expect(scoreRefinementIntent(longText, ctx)).toBeLessThan(REFINEMENT_SCORE_THRESHOLD);
  });

  it("D-02: 'change it to pie chart' + no prior slide (ctx.lastAssistantSlideState undefined) → score < 6 (no recency bonus)", () => {
    const ctx: RefinementContext = {
      lastAssistantSlideState: undefined,
      lastSlideCreatedAtMs: undefined,
      nowMs: NOW,
    };
    expect(scoreRefinementIntent("change it to pie chart", ctx)).toBeLessThan(
      REFINEMENT_SCORE_THRESHOLD
    );
  });

  it("D-02: empty string + any ctx → score 0", () => {
    const ctx: RefinementContext = {
      lastAssistantSlideState: "created",
      lastSlideCreatedAtMs: RECENT(30),
      nowMs: NOW,
    };
    expect(scoreRefinementIntent("", ctx)).toBe(0);
    expect(scoreRefinementIntent("   ", ctx)).toBe(0);
  });
});
