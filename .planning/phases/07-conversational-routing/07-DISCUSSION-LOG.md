# Phase 7: Conversational Routing & Response Taxonomy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 07-conversational-routing
**Areas discussed:** Dispatcher placement & prompt design, Classifier ↔ planSection ordering, First-turn modify/variant fallback, Phase 6 chip ↔ Phase 7 classifier coexistence

---

## Dispatcher Placement & Prompt Design

### Q1: Where does the classify+dispatch logic physically live?

| Option | Description | Selected |
|--------|-------------|----------|
| New responseDispatcher.ts service that wraps streamCubeAI | Higher-level helper `streamAndClassify(question, ctx, callbacks)` that runs streamCubeAI + classifyResponse + emits onClassified. Centralises logic across 3 surfaces. | ✓ |
| Inline classifier call per surface | Each surface imports classifyResponse and runs it inline in its onComplete. Less abstraction; matches Phase 6 inline pattern. | |
| Hook-based: useResponseClassifier() | React hook owns classifier call + state. Doesn't help sectionOrchestrator (non-React). | |

**User's choice:** New responseDispatcher.ts service that wraps streamCubeAI

### Q2: How is the responseClassifier system prompt structured?

| Option | Description | Selected |
|--------|-------------|----------|
| Decision tree + 1-2 examples per class | Mirrors refinementClassifierSystem.ts: short decision tree first, 1-2 canonical examples per class. <2048 chars (no cache). | ✓ |
| Few-shot only (8-12 examples) | Skip decision tree, lean on examples. Higher token cost, may exceed cache threshold. | |
| Pure rule-based (no examples) | Tight rule list. Cheapest tokens but brittle on novel phrasings. | |

**User's choice:** Decision tree + 1-2 examples per class (Recommended)

---

## Classifier ↔ planSection Ordering

### Q1: When does planSection run relative to the classifier?

| Option | Description | Selected |
|--------|-------------|----------|
| Classifier first — planSection only when class=section | responseClassifier runs immediately after onComplete. planSection runs ONLY when class==='section'. Saves ~1-3s on common path. | ✓ |
| planSection first — classifier sees slide count | planSection runs unconditionally. Classifier receives plannedSlideCount as input. Pays planSection latency on every turn. | |
| Parallel — race both, take classifier verdict | Fire classifier and planSection in parallel. Wastes Sonnet 4.6 calls on non-section turns. | |

**User's choice:** Classifier first — planSection only when class=section (Recommended)

### Q2: How does the classifier infer 'section' intent without seeing planSection's output?

| Option | Description | Selected |
|--------|-------------|----------|
| User-question signals + commentary length | Words like 'review', 'breakdown', 'overview', 'compare across' + commentary length hint. Classifier flags 'needs section', dispatcher then calls planSection. | ✓ |
| Always run planSection cheaply for class disambiguation | Tiny pre-pass on planSection (Haiku for slide-count only). Adds ~400ms but eliminates classifier guesswork. | |
| User explicit cue only | Section only when user explicitly says 'sections', 'multi-slide'. Loses Phase 6 D-05 'allow-multi' magic. | |

**User's choice:** User-question signals + commentary length (Recommended)

---

## First-Turn Modify/Variant Fallback

### Q1: When responseClass=modify or variant on FIRST turn, what does the dispatcher do?

| Option | Description | Selected |
|--------|-------------|----------|
| Treat as `data` — toolCall already encodes constraints | First-turn modifier was sent to Cube AI INSIDE the question. toolCall already reflects constraint. Routes to new-composition with existing toolCall. | ✓ |
| Re-prompt Cube AI with refinement framing | Synthetic prior context + cube-ai+composer refinement path. Adds second Cube AI call (2x latency). | |
| composer-only with rows=[] | Same path as classifier-fallback when lastBuildRef empty. Functionally similar to option 1. | |

**User's choice:** Treat as `data` — the toolCall already encodes the constraints (Recommended)

### Q2: Should the classifier output for first-turn modify/variant be telemetry-recorded even when route degrades to `data`?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — emit response_classified with class=modify, route=data, degraded=true | Telemetry preserves classifier intent separately from route. Lets us measure first-turn modify rate. | ✓ |
| No — emit class=data when degraded | Single source of truth: telemetry shows route actually taken. | |

**User's choice:** Yes — emit response_classified with class=modify, route=data, degraded=true (Recommended)

---

## Phase 6 Chip ↔ Phase 7 Classifier Coexistence

### Q1: What role does the Phase 6 'Refining: [last slide title]' chip play after Phase 7 ships?

| Option | Description | Selected |
|--------|-------------|----------|
| Visual confirmation of classifier output | Chip becomes UI signal that fires when classifier returns modify/variant. Heuristic retired or used only as draft-time predictor. | ✓ |
| Heuristic shortcut: chip bypasses classifier when score>=threshold | Skip classifier when score >= 6, route directly to refinementClassifier. Saves ~600ms. Adds branching complexity. | |
| Retire chip entirely | Phase 7 classifier subsumes the chip. Cleanest code but loses pre-submit zero-surprise UX. | |

**User's choice:** Visual confirmation of classifier output (Recommended)

### Q2: How does Phase 7 relate to the existing refinementClassifier.ts (composer-only vs cube-ai+composer)?

| Option | Description | Selected |
|--------|-------------|----------|
| Two-stage: responseClassifier first, refinementClassifier on modify/variant only | responseClassifier emits 6-way taxonomy. On modify/variant, refinementClassifier runs for sub-routing. ~1.2s on refinement, ~600ms otherwise. | ✓ |
| Merge: single classifier returns both class AND sub-route | One model call with richer prompt. Faster (~600ms) but prompt grows past 2048 chars; refinementClassifier retired. | |
| responseClassifier emits sub-route directly: variant=composer-only, modify=cube-ai+composer | Hard-code mapping. No second classifier call. Loses ambiguity-fallback nuance from Phase 6. | |

**User's choice:** Two-stage: responseClassifier first, refinementClassifier on modify/variant only (Recommended)

---

## Claude's Discretion

- Exact wording of the responseClassifier decision tree and per-class examples (≤2048 chars)
- Threshold for the lightweight pre-submit chip predictor (D-07)
- Commentary-length signal calibration (D-04)
- Whether responseDispatcher.ts exposes a single onClassified callback or a richer set
- Where MessageRoute enum gets extended for narrative-conversational
- Whether to retire scoreRefinementIntent entirely or keep as draft-time predictor only

## Deferred Ideas

- Re-prompting Cube AI on first-turn modify/variant for a true refinement experience (D-05 alternative for v2)
- Suggested-replies tray on clarify/refuse (locked out by SPEC.md)
- Refusal recovery suggestions (locked out by SPEC.md)
- Editable classifications / 'wrong route' button
- Telemetry dashboard / UAT replay tool (locked out by SPEC.md)
- Streaming-time classification (locked out by SPEC.md)
- Multi-turn memory beyond chatId (locked out by SPEC.md)
- New taxonomy classes beyond the 6 (soft-locked)
