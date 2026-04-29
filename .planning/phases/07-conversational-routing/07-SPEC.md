# Phase 7: Conversational Routing & Response Taxonomy — Specification

**Created:** 2026-04-29
**Ambiguity score:** 0.145 (gate: ≤ 0.20)
**Requirements:** 9 locked

## Goal

Every assistant turn passes through a 6-class response classifier (`clarify | data | modify | variant | section | refuse`) whose output deterministically selects the downstream pipeline (compose, refine, conversational reply, refuse) and the UI affordance shown to the user — eliminating the Phase 6 Wave 8 UAT gap where the addin treats every assistant response as a slide candidate.

## Background

Today the addin routes assistant turns through `slideRouter.routeMessage` (`src/taskpane/services/slideRouter.ts`), which collapses the decision into 4 paths (`narrative | section-plan | refinement | new-composition`) using only:
- `toolCall` presence (`routeCreateSlide`)
- A heuristic refinement chip (`refinementDetector.scoreRefinementIntent`) that requires a recent prior slide
- A meta-composer slide-count hint (`planSection`)

This produces three concrete failure modes observed during Phase 6 Wave 8 UAT:
1. When Cube AI asks a clarifying question (e.g. *"Did you mean NSW or all states?"*), the addin renders plain assistant text and a "Create Slide" button that, when clicked, builds a meaningless slide from the question text.
2. When Cube AI refuses (*"I don't have data on competitor pricing"*), same Create Slide affordance appears.
3. The refinement classifier (`refinementClassifier.ts`) only fires when `chipVisible && lastBuildRef.current` — meaning a first-turn modify intent ("build me a sales chart but pie not bar") never reaches it.

`refinementClassifier.ts` (Haiku 4.5, forced tool_use, Zod-parsed) is the right architectural pattern. Phase 7 introduces a sibling `responseClassifier.ts` that emits the 6-way taxonomy, runs after `streamCubeAI.onComplete`, and feeds a mapping layer that hands off to the existing `MessageRoute` enum.

## Requirements

1. **Response classifier service**: A new `src/taskpane/services/responseClassifier.ts` exports `classifyResponse()` which returns one of `clarify | data | modify | variant | section | refuse`.
   - Current: No response classifier exists. `slideRouter.routeMessage` decides routing from `toolCall` + heuristic chip only.
   - Target: New service file mirrors `refinementClassifier.ts` architecture (singleton Anthropic client, `__setAnthropicClientForTesting`, Haiku 4.5, forced `tool_choice`, Zod-validated `ResponseClassSchema`, `temperature=0`, `max_tokens=256`).
   - Acceptance: `classifyResponse({ assistantText, toolCallPresent, lastSlideTitle, isFirstTurn })` returns a value matching the Zod schema for at least 6 fixture cases (one per class) and falls back to `{ class: "data", rationale: "classifier-fallback" }` on any error.

2. **Post-stream classification trigger**: The classifier runs synchronously after `streamCubeAI.onComplete` in every surface that streams Cube AI.
   - Current: `ChatPanel.handleSubmit.onComplete` makes a binary `toolCall ? composition : narrative` decision; `WizardPanel`/`ReviewStep` do likewise; `sectionOrchestrator` bypasses both.
   - Target: A single shared helper (e.g. `dispatchResponse(class, ctx)`) is called from `ChatPanel`, `WizardPanel.ReviewStep`, and `sectionOrchestrator`'s outer entrypoint after the stream resolves but before any slide-render side effect runs.
   - Acceptance: All 3 surfaces invoke `classifyResponse` exactly once per assistant turn; verified via injected client stub asserting call count.

3. **Taxonomy → MessageRoute mapping**: A pure function maps each of the 6 classes to a `MessageRoute` (or new `narrative-conversational` extension).
   - Current: `MessageRoute` = `new-composition | refinement | section-plan | narrative`. No mapping table exists.
   - Target: Mapping locked in code:
     - `data` → `new-composition` (single-slide) **or** `section-plan` (when `planSection` returns >1)
     - `modify` → `refinement` (cube-ai+composer sub-route)
     - `variant` → `refinement` (composer-only sub-route)
     - `section` → `section-plan`
     - `clarify` → `narrative-conversational` (NEW — plain reply, no slide affordance)
     - `refuse` → `narrative-conversational`
   - Acceptance: Unit test asserts mapping table is total (every enum value mapped) and stable; no class produces an unhandled route.

4. **Conversational UI suppression**: `clarify` and `refuse` classes render plain text bubble with NO Create Slide button, NO SlidePreview, NO SectionStrip.
   - Current: All assistant messages render with a Create Slide affordance unless they are `error` role.
   - Target: When `responseClass ∈ {clarify, refuse}`, the render branch in `ChatPanel`, `WizardPanel`, and `ReviewStep` shows ONLY the assistant text bubble. Setting `slideState` is suppressed.
   - Acceptance: Snapshot test (or DOM assertion) confirms zero buttons/preview shapes rendered for assistant messages with `responseClass="clarify"` or `"refuse"`.

5. **First-turn modify routing**: The classifier correctly identifies `modify | variant` intent on the FIRST user turn (no prior slide exists).
   - Current: `refinementClassifier` is gated by `chipVisible && capturedToolCall && lastBuildRef.current`. A first-turn message containing a modifier ("but make it a pie chart", "show only NSW") is treated as `data`.
   - Target: `responseClassifier` evaluates intent independently of `lastBuildRef`. When class is `modify | variant` and no `lastBuildRef` exists, the dispatcher gracefully degrades — for `variant` (composer-only), it falls back to running `cube-ai+composer` since there are no prior rows to reuse.
   - Acceptance: Fixture test — submitting "Build me sales by state but make it a pie" as the first turn in a fresh `ChatPanel` produces `responseClass="modify"` (or `variant`) and routes to `cube-ai+composer`, NOT `new-composition` with default chart type.

6. **Latency budget**: Classifier completes within p95 ≤ 600ms when run against Haiku 4.5.
   - Current: No classifier in the post-stream path; total post-stream latency is dominated by `planSection` (~1–3s).
   - Target: `classifyResponse` p95 ≤ 600ms measured across at least 20 invocations against the live Anthropic API. Telemetry-recorded `latencyMs` proves it.
   - Acceptance: Manual UAT run records 20 classifier latencies via `telemetry` ring-buffer dump; p95 (rank 19/20) ≤ 600ms.

7. **Telemetry coverage**: Every assistant turn emits exactly one `response_classified` event.
   - Current: `refinement_routed` is the only classifier event. No event when classifier is skipped.
   - Target: `logEvent("response_classified", { class, rationale, latencyMs, fallback?: true, surface: "chat"|"wizard"|"section" })` fires once per `streamCubeAI.onComplete`. Includes the surface that invoked it.
   - Acceptance: Telemetry ring-buffer dump after a 5-turn conversation contains exactly 5 `response_classified` events with required fields populated.

8. **Wave 8 UAT lift**: Phase 6 `06-08-PLAN.md` Wave 8 UAT scenarios for clarify/refuse pass after Phase 7 lands.
   - Current: 06-08-PLAN.md Wave 8 UAT is deferred per `STATE.md` — addin shows Create Slide on conversational replies.
   - Target: When Wave 8 UAT is re-run post-Phase 7, the clarify-suppression and refuse-suppression scenarios produce a plain text bubble with no Create Slide affordance.
   - Acceptance: Manual UAT against deployed addin: ask Cube AI a question that triggers a clarification (e.g. ambiguous brand name), ask a refused question (e.g. "predict next quarter"); both show plain text only.

9. **Fallback safety**: Classifier errors (network, abort, Zod fail, missing tool_use) fall back to `class="data"` so the user is never blocked.
   - Current: No classifier in this path; but `refinementClassifier` fallback returns `cube-ai+composer` (the safer route).
   - Target: On any error, `classifyResponse` returns `{ class: "data", rationale: "classifier-fallback" }` and logs `response_classified` with `fallback: true`. This preserves today's "show Create Slide when toolCall present" behavior as the safe default.
   - Acceptance: Test case — stub Anthropic client to throw; `classifyResponse` resolves to `{ class: "data", rationale: "classifier-fallback" }` and emits a telemetry event with `fallback: true`.

## Boundaries

**In scope:**
- New `responseClassifier.ts` service (Haiku 4.5, forced tool_use, Zod schema)
- New `responseDispatcher.ts` (or inline mapping helper) wiring class → `MessageRoute` + UI affordance suppression
- 6-class taxonomy enum (`clarify | data | modify | variant | section | refuse`)
- Integration in 3 surfaces: `ChatPanel`, `WizardPanel.ReviewStep`, `sectionOrchestrator` outer entrypoint
- Conversational render branch (plain text bubble, no slide affordance) for `clarify` and `refuse`
- First-turn `modify | variant` routing (no `lastBuildRef` requirement)
- Telemetry `response_classified` event per turn (surface-tagged)
- Fallback to `class="data"` on any classifier error
- Unit + fixture tests covering all 6 classes and fallback path

**Out of scope:**
- **Multi-turn memory beyond Cube AI's `chatId`** — no new conversation-history layer; classifier sees only the current turn's `assistantText`, `toolCallPresent`, and `lastSlideTitle`. Reason: explicitly chosen during interview to keep scope tight.
- **Replacing the existing `MessageRoute` enum** — taxonomy layers on top via mapping; `slideRouter.ts` and its tests stay green. Reason: minimise churn and preserve Phase 6 verification surface.
- **Streaming-time classification** — classifier runs only after `onComplete`. Reason: classifier needs full assistant text + final `toolCall` to be accurate.
- **Suggested-replies tray on clarify/refuse** — plain text bubble only. Reason: avoids second model call and prompt-engineering risk; keeps Phase 7 minimal.
- **Refusal recovery suggestions** — when agent refuses, no auto-generated alternatives; user reformulates manually. Reason: separate UX concern, parking-lot for v2.
- **Telemetry visualisation / UAT replay tool** — events flow into existing `telemetry.ts` ring buffer only. Reason: tooling effort outweighs Phase 7 demo value.
- **Modifying `cubeai.ts` streaming protocol** — classifier consumes the existing `CubeAIStreamResult.content` and `onToolCall` outputs; no NDJSON-level changes.

## Constraints

- Model is locked to **Haiku 4.5** (`claude-haiku-4-5`) with `temperature=0`, `max_tokens=256`, forced `tool_choice` — same posture as `refinementClassifier.ts`. Latency p95 ≤ 600ms.
- Classifier prompt MUST be a single system prompt under 2048 chars (do NOT trip the Anthropic prompt-cache threshold — caching is unnecessary for one-shot 256-token calls).
- Must use the existing `ANTHROPIC_API_KEY` from `config.ts` and the same `dangerouslyAllowBrowser:true` posture as `composer.ts` / `refinementClassifier.ts`.
- The `responseClassifier.ts` module MUST expose `__setAnthropicClientForTesting` for unit-test stubbing (mirrors composer/refinementClassifier).
- The dispatcher integration in `sectionOrchestrator` must NOT break the existing `OrderedInsertionMutex` invariant — classifier runs at the outer entrypoint, before `planSection` is invoked.

## Acceptance Criteria

- [ ] `src/taskpane/services/responseClassifier.ts` exports `classifyResponse()` and `ResponseClassSchema` (Zod), with test stub via `__setAnthropicClientForTesting`
- [ ] `responseClassifier.test.ts` covers 6 fixture cases (one per class) and the fallback case (stubbed throw → `class="data"`)
- [ ] `slideRouter.ts` (or a new `responseDispatcher.ts`) exports a pure mapping function `responseClassToRoute(class, planSlideCount)` whose unit test asserts the mapping table is total
- [ ] `ChatPanel`, `WizardPanel.ReviewStep`, and `sectionOrchestrator` all invoke `classifyResponse` exactly once per `streamCubeAI.onComplete` (verified via stub call-count)
- [ ] Assistant messages classified `clarify` or `refuse` render with NO `Create Slide` button, NO `SlidePreview`, NO `SectionStrip` (DOM assertion)
- [ ] Submitting "build me sales but make it a pie" as first turn (empty `messages`, empty `lastBuildRef`) classifies as `modify` or `variant` and routes to `cube-ai+composer` — NOT `new-composition`
- [ ] Telemetry ring-buffer contains exactly one `response_classified` event per assistant turn, including `surface` field (`"chat"|"wizard"|"section"`)
- [ ] Manual UAT against the deployed Railway build: clarification reply produces plain text bubble; refusal reply produces plain text bubble (the deferred Phase 6 Wave 8 UAT scenarios)
- [ ] Classifier latency p95 ≤ 600ms across 20 sampled invocations recorded via telemetry
- [ ] Stubbed-throw test confirms classifier errors resolve to `{ class: "data", rationale: "classifier-fallback" }` and emit `response_classified` with `fallback: true`

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                          |
|--------------------|-------|------|--------|------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Architecture, model, surfaces locked           |
| Boundary Clarity   | 0.80  | 0.70 | ✓      | 7 explicit out-of-scope items with reasoning   |
| Constraint Clarity | 0.85  | 0.65 | ✓      | Haiku 4.5, p95 ≤ 600ms, prompt < 2048 chars    |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 10 pass/fail criteria including UAT scenarios  |
| **Ambiguity**      | 0.145 | ≤0.20| ✓      |                                                |

## Interview Log

| Round | Perspective                | Question summary                                | Decision locked                                                          |
|-------|----------------------------|------------------------------------------------|---------------------------------------------------------------------------|
| 1     | Researcher                 | New service or extend `refinementClassifier`?   | NEW `responseClassifier.ts` — clean separation                            |
| 1     | Researcher                 | When does classifier run?                       | After `streamCubeAI.onComplete` (synchronous, full context)               |
| 2     | Researcher + Simplifier    | Which surfaces?                                 | ALL THREE: `ChatPanel`, `WizardPanel.ReviewStep`, `sectionOrchestrator`   |
| 2     | Researcher + Simplifier    | Replace or layer on `MessageRoute`?             | Layer on top — taxonomy → `MessageRoute` mapping table                    |
| 3     | Boundary Keeper            | UI for clarify/refuse?                          | Plain text bubble, NO Create Slide button                                 |
| 3     | Boundary Keeper            | Out of scope?                                   | Multi-turn memory beyond `chatId` (other items left ambient/in-scope)     |
| 4     | Failure Analyst + Closer   | Model + latency budget?                         | Haiku 4.5, p95 ≤ 600ms                                                    |
| 4     | Failure Analyst + Closer   | UAT pass criteria?                              | All 4: clarify-suppress, refuse-suppress, first-turn modify, telemetry    |

---

*Phase: 07-conversational-routing*
*Spec created: 2026-04-29*
*Next step: /gsd-discuss-phase 7 — implementation decisions (prompt design, dispatcher placement, ReviewStep wiring details)*
