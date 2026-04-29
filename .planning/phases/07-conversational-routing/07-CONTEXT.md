# Phase 7: Conversational Routing & Response Taxonomy - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 adds a judgement layer that classifies every assistant turn into a 6-class response taxonomy (`clarify | data | modify | variant | section | refuse`) and routes each class to the right pipeline. The classifier replaces the current binary toolCall-vs-no-toolCall routing with semantic intent detection — fixing the Phase 6 Wave 8 UAT gap where conversational replies (clarifications, refusals) get the same Create Slide affordance as data responses, and where first-turn modify/variant intents go undetected because they require a prior slide today.

Concretely, Phase 7 delivers:

1. A new `responseClassifier.ts` (Haiku 4.5, forced tool_use, Zod-parsed) that mirrors the Phase 6 D-03 `refinementClassifier.ts` architecture.
2. A new `responseDispatcher.ts` that wraps `streamCubeAI` and centralises classify+route+suppress affordance logic across all 3 surfaces.
3. Surface integration in `ChatPanel`, `WizardPanel.ReviewStep`, and the outer entrypoint of `sectionOrchestrator`.
4. UI suppression for `clarify` and `refuse` (plain text bubble, no Create Slide / SlidePreview / SectionStrip).
5. Telemetry coverage (`response_classified` event per assistant turn, surface-tagged).

**Scope anchor:** Phase 7 is a routing/judgement layer only. It does NOT add new pipelines, does NOT change `streamCubeAI` itself, and does NOT modify the composition or section pipelines. It DOES re-shape when `planSection` runs (only on class=section, not unconditionally) and replaces the Phase 6 heuristic-driven chip with a classifier-driven one.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**9 requirements are locked.** See `07-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `07-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- New `responseClassifier.ts` service (Haiku 4.5, forced tool_use, Zod schema)
- New `responseDispatcher.ts` (or inline mapping helper) wiring class → MessageRoute + UI affordance suppression
- 6-class taxonomy enum (`clarify | data | modify | variant | section | refuse`)
- Integration in 3 surfaces: `ChatPanel`, `WizardPanel.ReviewStep`, `sectionOrchestrator` outer entrypoint
- Conversational render branch (plain text bubble, no slide affordance) for `clarify` and `refuse`
- First-turn `modify | variant` routing (no `lastBuildRef` requirement)
- Telemetry `response_classified` event per turn (surface-tagged)
- Fallback to `class="data"` on any classifier error
- Unit + fixture tests covering all 6 classes and fallback path

**Out of scope (from SPEC.md):**
- Multi-turn memory beyond Cube AI's `chatId`
- Replacing the existing `MessageRoute` enum (taxonomy layers on top via mapping)
- Streaming-time classification (post-`onComplete` only)
- Suggested-replies tray on clarify/refuse (plain text bubble only)
- Refusal recovery suggestions (parking-lot for v2)
- Telemetry visualisation / UAT replay tool
- Modifying `cubeai.ts` streaming protocol

</spec_lock>

<decisions>
## Implementation Decisions

### Dispatcher Architecture

- **D-01: New `responseDispatcher.ts` service that wraps `streamCubeAI`.** Expose a higher-level helper (e.g. `streamAndClassify(question, ctx, callbacks)`) that invokes `streamCubeAI`, then on `onComplete` calls `classifyResponse`, then emits a single `onClassified(class, route, ctx)` callback. ChatPanel, WizardPanel.ReviewStep, and sectionOrchestrator's outer entrypoint all consume this wrapper instead of `streamCubeAI` directly. Centralises the classifier+dispatch logic, eliminates duplication across the three surfaces, and gives a single place to change classifier behaviour later. Sits at `src/taskpane/services/responseDispatcher.ts`.

- **D-02: System prompt is a decision tree + 1–2 canonical examples per class, <2048 chars.** Mirrors the `refinementClassifierSystem.ts` style: short decision tree first (e.g. "Does the assistant text ask the user a question? → `clarify`. Did Cube AI emit a finalised toolCall? → continue. Does the user's question contain section keywords? → `section`. ..."), followed by 1–2 canonical examples per class. Total prompt length must remain under 2048 characters so it does not trip the Anthropic prompt-cache threshold (caching is wasted on a 256-token classifier call). Lives at `src/taskpane/prompts/responseClassifierSystem.ts` (matching the Phase 6 prompt-file convention).

### Classifier ↔ planSection Ordering

- **D-03: Classifier-first ordering — `planSection` runs only when `responseClass === "section"`.** `responseClassifier` runs immediately after `streamCubeAI.onComplete` and before any other downstream call. When class is `data`, the dispatcher routes directly to the single-slide composer (existing Phase 5 path) without invoking `planSection`. When class is `section`, the dispatcher then invokes `planSection` to get the multi-slide breakdown. Saves ~1–3s on the common single-slide path and aligns total post-stream latency to the 600ms classifier budget rather than the 1–3s `planSection` budget.

- **D-04: Classifier infers `section` intent from user-question signals + commentary length, not from `planSection` output.** The system prompt teaches the model to recognise section-shaped questions: words like "review", "breakdown", "overview", "compare across", plural metrics, multi-time-period asks. Commentary length above a hint threshold (the Cube AI assistant text is longer when the answer is multi-faceted) acts as a secondary signal. The classifier flags "needs section treatment" — the dispatcher then calls `planSection` for the actual slide count and breakdown. Classifier does NOT need to predict slide count.

### First-Turn Modify/Variant Fallback

- **D-05: First-turn `modify` or `variant` routes as `data` — the captured toolCall already encodes the constraints.** When the user's first message contains a modifier ("build sales by state but make it pie", "show only NSW for Q3"), Cube AI receives the FULL question and produces a toolCall whose `vegaSpec` / SQL already reflects the constraint. So even though the classifier identifies modify/variant intent, the route degrades to the existing `new-composition` path because there is no prior slide to refine and the toolCall is already what the user asked for. No second Cube AI call, no synthetic refinement framing. The classifier output is preserved as telemetry rather than influencing routing on first turn.

- **D-06: Telemetry preserves classifier intent separately from the route taken.** When classifier returns `modify` or `variant` on first turn but the dispatcher degrades to `data`, emit `response_classified` with `{ class: "modify", route: "data", degraded: true, surface }`. Lets post-demo analysis measure how often first-turn modify/variant happens without conflating with the route actually taken — informs whether the v2 path of re-prompting Cube AI for a true refinement is worth building.

### Phase 6 Chip ↔ Phase 7 Classifier Coexistence

- **D-07: Refinement chip becomes a visual confirmation of classifier output.** Phase 6 D-02 introduced the "Refining: [last slide title]" chip driven by the heuristic `scoreRefinementIntent`. Phase 7 retires the heuristic as the routing decision-maker — the classifier is now the source of truth. The chip remains as a UI signal that fires when classifier returns `modify`/`variant` on a continuation turn (i.e., when `lastBuildRef` exists). Pre-submit (while user is typing the draft) the chip uses a lightweight prediction — `scoreRefinementIntent` can be retained as a draft-time predictor only — to anticipate what the upcoming classifier verdict will likely be. After classification completes, the chip's appearance is reconciled with the actual verdict. Simplest UX framing: "the chip means the system thinks this is a refinement of [slide]".

- **D-08: Two-stage classifier chain — `responseClassifier` first, `refinementClassifier` on `modify`/`variant` only.** When Phase 7's classifier emits class `modify` or `variant` on a continuation turn (lastBuildRef present), the dispatcher then calls Phase 6's `refinementClassifier` to disambiguate the composer-only vs cube-ai+composer sub-route. Two Haiku calls in series (~1.2s combined) on refinement turns; one call (~600ms) on all other turns. Each classifier owns a single decision (single-responsibility), Phase 6 prompts and tests stay intact, and the schema-by-class boundary remains clean.

### Claude's Discretion

- **Exact wording of the responseClassifier decision tree and per-class examples** — must be ≤2048 chars and stay current with how Cube AI actually phrases each type of response. Tune during planning by sampling real Cube AI replies for each class.
- **Threshold for the lightweight pre-submit chip predictor (D-07)** — current Phase 6 threshold is 6; Phase 7 may raise/lower based on live classifier agreement rate. Tune during planning.
- **Commentary-length signal calibration (D-04)** — the "long commentary suggests section" signal needs an empirical hint value (e.g., > 600 chars). Tune during planning by sampling Cube AI section-shaped vs single-slide responses.
- **Whether `responseDispatcher.ts` exposes a single `onClassified` callback or a richer set** — implementation detail; planner's call.
- **Where `MessageRoute` enum gets extended for `narrative-conversational`** — either a new value in `slideRouter.ts` or a separate `responseRoute` type that the surfaces consume in parallel. Planner's choice based on test impact.
- **Whether to retire `scoreRefinementIntent` entirely or keep as draft-time predictor only (D-07)** — depends on whether the lightweight prediction signal is valuable enough to maintain. Planner can decide based on prompt-time UX testing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This Phase (locked requirements)
- `.planning/phases/07-conversational-routing/07-SPEC.md` — Locked requirements (9), boundaries, acceptance criteria, ambiguity report. **MUST read before planning.** All "what" decisions are locked here.

### Prior Phase Context (required)
- `.planning/phases/06-polish-and-demo-readiness/06-CONTEXT.md` — Phase 6 D-01 through D-16 establish refinement chip, refinementClassifier, multi-slide section pipeline, WizardPanel D-16 inheritance. Phase 7 builds on D-02 (chip), D-03 (classifier prompt pattern), D-05 (planSection meta-composer), D-15/D-16 (ChatPanel vs WizardPanel scope rules).
- `.planning/phases/05-chart-table-interpretation-slide-composition/05-CONTEXT.md` — D-04 (browser-mode Anthropic SDK pattern), D-06 (streaming), D-07 (prompt cache rules — 2048-char threshold).

### Project-Level (required)
- `.planning/PROJECT.md` — Internal-demo posture, Summit VI minimal branding, no AppSource shipping.
- `.planning/REQUIREMENTS.md` — TASK-04 (streaming), CUBE-03/CUBE-04 (multi-turn refinement) — Phase 7 closes these from Phase 6.
- `.planning/ROADMAP.md` §Phase 7 — Goal statement and motivation (Wave 8 UAT gap).

### Existing Code (extend — do NOT rewrite)
- `src/taskpane/services/cubeai.ts` — `streamCubeAI(question, chatId, callbacks)` is the function `responseDispatcher` wraps. `CubeSqlApiToolCall` and `CubeAIStreamResult` are the inputs the classifier consumes. Do NOT modify.
- `src/taskpane/services/refinementClassifier.ts` — Phase 6 D-03 architecture template. Phase 7 mirrors: singleton client, `__setAnthropicClientForTesting`, Haiku 4.5, forced tool_choice, Zod post-parse. Phase 7 calls this as the second stage of the chain (D-08).
- `src/taskpane/prompts/refinementClassifierSystem.ts` — Style template for the new `responseClassifierSystem.ts`. Same posture: <2048 chars, no `cache_control`, decision tree + examples.
- `src/taskpane/services/slideRouter.ts` — `MessageRoute` enum and `routeMessage` function. Phase 7 either extends the enum with `narrative-conversational` or adds a parallel `responseRoute` consumed by the dispatcher.
- `src/taskpane/services/refinementDetector.ts` — `scoreRefinementIntent` heuristic. Phase 7 D-07 either retires it or keeps it as a draft-time predictor only.
- `src/taskpane/components/ChatPanel.tsx` — Primary integration site. `handleSubmit.onComplete` is where the dispatcher replaces the current inline classify+route logic. Lines 478–656 (current onComplete handler) are the integration zone.
- `src/taskpane/components/WizardPanel.tsx` + `src/taskpane/components/wizard/ReviewStep.tsx` — Second integration site. Phase 6 D-16 already wired the refinement classifier here; Phase 7 swaps in the dispatcher.
- `src/taskpane/services/sectionOrchestrator.ts` — Third integration site. The classifier should run BEFORE the orchestrator's `planSection` call per D-03.
- `src/taskpane/services/telemetry.ts` — `logEvent` ring buffer. Phase 7 emits `response_classified` events per turn (D-06 schema).
- `src/taskpane/components/RefiningChip.tsx` — Phase 6 chip component. Phase 7 D-07 reconciles it with classifier output.

### External APIs & Docs
- `@anthropic-ai/sdk` — Same posture as Phase 6 `refinementClassifier.ts`: `messages.create()` (not stream) for one-shot classifier, `tool_choice: { type: "tool", name }`, `temperature: 0`, `max_tokens: 256`.
- Anthropic prompt-cache 2048-char threshold — must stay BELOW for the new prompt (no caching benefit for one-shot 256-token classifier calls).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`refinementClassifier.ts` architecture (Phase 6 D-03)** — Singleton Anthropic client at module load with `dangerouslyAllowBrowser: true`, `__setAnthropicClientForTesting` test stub override, forced `tool_choice`, Zod post-parse, telemetry on success and fallback. Phase 7's `responseClassifier.ts` mirrors this file structure 1:1 with the schema swapped to the 6-class enum.
- **`refinementClassifierSystem.ts` prompt style** — Decision-tree-then-examples format under 2048 chars. The Phase 7 `responseClassifierSystem.ts` adopts the same template, expanding the decision tree from 2 routes to 6 classes.
- **Telemetry ring buffer (`telemetry.ts`)** — `logEvent(event, payload)` is the contract. Phase 7 emits `response_classified` with `{ class, rationale, latencyMs, fallback?, degraded?, route, surface }`.
- **`MessageRoute` enum (`slideRouter.ts`)** — Phase 6 D-05 already added `section-plan` and `refinement` values. Phase 7 adds `narrative-conversational` (or introduces a parallel `responseRoute`).
- **`AbortController` plumbing through `streamCubeAI`** — Already wired through ChatPanel/WizardPanel/sectionOrchestrator. The classifier call must accept the same signal so it cancels with the parent stream on user interrupt.

### Established Patterns

- **Browser-mode Anthropic SDK** — `dangerouslyAllowBrowser: true`, `ANTHROPIC_API_KEY` from `config.ts`. Same posture as composer/refinementClassifier. No new env vars needed.
- **Forced `tool_choice` for structured output** — `tool_choice: { type: "tool", name }` with a Zod schema validated post-parse. Failure modes (no tool_use block, Zod parse fail) fall back to a safe default.
- **Two-classifier chain pattern (new in Phase 7)** — responseClassifier → refinementClassifier (only on modify/variant). Each classifier owns one decision. Sequential, not parallel.
- **Single dispatcher per surface** — Today ChatPanel inlines its own classify+route logic in `onComplete`; WizardPanel.ReviewStep does the same; sectionOrchestrator does its own. Phase 7's `responseDispatcher.ts` becomes the SINGLE point of truth that all three surfaces consume.

### Integration Points

- **`responseDispatcher.streamAndClassify(question, ctx, callbacks)`** — Replaces direct `streamCubeAI` calls in ChatPanel.handleSubmit, WizardPanel.handleBuild, sectionOrchestrator.runSection. Internally calls `streamCubeAI`, then on `onComplete` calls `classifyResponse`, then computes route, then emits `onClassified(class, route, ctx)`. Surfaces consume `onClassified` instead of running their own routing logic.
- **`routeMessage` extension** — Either add `narrative-conversational` to `MessageRoute` enum + extend the precedence ladder in `routeMessage`, OR add a separate `responseRoute` type that the surfaces switch on. Planner's call.
- **Render branch suppression** — In ChatPanel/Wizard render trees, gate the Create Slide button / SlidePreview / SectionStrip mounts on `responseClass !== 'clarify' && responseClass !== 'refuse'` (or equivalently `route !== 'narrative-conversational'`).
- **Chip reconciliation** — `RefiningChip` mount condition becomes: `responseClass === 'modify' || responseClass === 'variant'` for the classified turn. Pre-submit prediction (draft-time) optional.

</code_context>

<specifics>
## Specific Ideas

- **The two-classifier chain (D-08) feels like a mini-pipeline:** taxonomy → sub-route. Each classifier is small, deterministic, and testable in isolation. Avoids the temptation to merge them into one fat prompt that's hard to reason about.
- **The `responseDispatcher.ts` wrapper is the right abstraction shape:** it makes the post-stream sequence explicit (stream → classify → route → dispatch) instead of having three surfaces re-implement the same sequence with subtle drift.
- **Telemetry's `degraded: true` flag (D-06)** is a small thing but it's the kind of analytical signal that pays off later — measuring real classifier intent vs route taken is exactly the kind of thing that will inform whether we build first-turn modify v2.

</specifics>

<deferred>
## Deferred Ideas

- **Re-prompting Cube AI on first-turn modify/variant for a true refinement experience** — D-05 explicitly chose to degrade to `data`. If telemetry shows a high rate of first-turn modify/variant happens AND users react poorly to the degraded experience, revisit in v2.
- **Suggested-replies tray on clarify/refuse** — locked out by SPEC.md. Could be added in a future polish phase if user feedback wants it.
- **Refusal recovery suggestions** ("Cube AI doesn't have data on X — try asking about Y") — locked out by SPEC.md. Separate UX concern.
- **Editable classifications / 'wrong route' button** — user can't override the classifier today. If misroutes become a recurring complaint, add a thumbs-down + reroute affordance later.
- **Telemetry dashboard / UAT replay tool** — events flow into the existing ring buffer only. Tooling effort outweighs Phase 7 demo value.
- **Streaming-time classification** (firing classifier mid-stream on partial commentary) — locked out by SPEC.md. Would need stream-event hooks that don't exist today.
- **Multi-turn memory beyond Cube AI's chatId** — locked out by SPEC.md. Classifier sees current turn only.
- **New taxonomy classes beyond the 6** — soft-locked. Adding `error` or `partial` later would invalidate the schema and tests; treat the 6-class enum as sealed for Phase 7.

</deferred>

---

*Phase: 07-conversational-routing*
*Context gathered: 2026-04-29*
