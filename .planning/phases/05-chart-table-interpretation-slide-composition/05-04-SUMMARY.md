---
phase: 05-chart-table-interpretation-slide-composition
plan: 04
subsystem: ui-slide-preview-integration
tags: [phase-5, wave-3, slide-preview, ui-integration, d-02-router, cmps-03-grounding]

# Dependency graph
requires:
  - phase: 05-chart-table-interpretation-slide-composition/01
    provides: "CubeSqlApiToolCall + StreamCallbacks.onToolCall + translateSql / loadCubeData / UnsupportedSqlError"
  - phase: 05-chart-table-interpretation-slide-composition/02
    provides: "composeWithRetry + CompositionPlan Zod type + composer.cubeMeta.commentary grounding input"
  - phase: 05-chart-table-interpretation-slide-composition/03
    provides: "renderVegaToBase64Png + renderComposedSlide dispatch + ComposedSlideContent discriminated variant"
provides:
  - "SlidePreview — 280x158 16:9 live preview React component with 5-stage state machine (fetching-data → composing → rendering → success | failed) and single per-mount AbortController threaded through the full composition pipeline"
  - "slideRouter.routeCreateSlide — pure D-02 helper deciding composition vs narrative path from a RoutableMessage's toolCall state (name === 'cubeSqlApi' AND isInProcess === false)"
  - "ChatPanel.tsx integration — ChatMessage.slideState union widened; onToolCall captures finalised cubeSqlApi toolCall; onContent captures commentary (CMPS-03 grounding anchor); render branch mounts SlidePreview in composition stages; legacy narrative Create Slide path preserved when router returns 'narrative'"
  - "WizardPanel.tsx integration — toolCallRef + commentaryRef captured per-build; routeCreateSlide decides composition vs narrative in onComplete; ReviewStep receives toolCall + commentary + onBuildStateChange + mapStageToBuildState props"
  - "ReviewStep.tsx integration — mounts SlidePreview when buildState ∈ {fetching-data, composing, rendering} AND toolCall present; legacy narrative Build Slide flow untouched when router returns 'narrative'"
  - "BuildState union (slide/types.ts) — extended with fetching-data | composing | rendering (additive, pre-existing idle/building/built/failed preserved)"
  - "taskpane.css — @keyframes shimmer (1400ms linear) + @keyframes indeterminate-bar (2000ms) + .shimmer-region / .indeterminate-bar classes + prefers-reduced-motion fallback (shimmer frozen, progress bar at 0.5 scale)"
affects: [phase-5-sign-off, phase-5-checker-uat, phase-6-plan-01]

# Tech tracking
tech-stack:
  added: []  # UI integration uses existing @fluentui/react-components + react-icons
  patterns:
    - "Single per-mount AbortController stored in useRef, abort on cleanup (pattern mirrors ChatPanel's existing controllerRef)"
    - "Custom @keyframes shimmer (NOT Fluent Skeleton per 05-UI-SPEC.md explicit forbid) — gradient-swept background-position with prefers-reduced-motion fallback"
    - "D-02 router as pure helper (slideRouter.ts) — testable in isolation; consumed by both ChatPanel and WizardPanel to guarantee production and test exercise the same predicate"
    - "CMPS-03 grounding capture pattern: parent surfaces (ChatPanel/WizardPanel) accumulate commentary via onContent tail; pass through SlidePreview commentary prop into composer.cubeMeta.commentary (D-05 source-of-truth narrative)"
    - "SlidePreviewStage → ChatMessage.slideState and SlidePreviewStage → BuildState mappers kept at parent site (success → created/built, failed → failed, rest passes through)"

key-files:
  created:
    - "src/taskpane/components/SlidePreview.tsx — 326 lines; top-level + StageLabelStrip + PreviewCanvas + RegionContent + ActionRow sub-components"
    - "src/taskpane/components/SlidePreview.test.tsx — module-surface + PREV-01 smoke test + 6 it.todo UAT deferrals"
    - "src/taskpane/services/slideRouter.ts — routeCreateSlide pure helper"
    - "src/taskpane/services/slideRouter.test.ts — 4 D-02 scenarios (composition / narrative absent / narrative isInProcess / narrative wrong name)"
  modified:
    - "src/taskpane/taskpane.css — appended Phase 5 shimmer/indeterminate-bar/reduced-motion block"
    - "src/taskpane/components/ChatPanel.tsx — slideState union, toolCall + commentary capture in streamCubeAI callbacks, routeCreateSlide branch in handleCreateSlide, SlidePreview render branch, helper findLastUserQuestion + mapStageToSlideState"
    - "src/taskpane/components/WizardPanel.tsx — toolCallRef + commentaryRef; onToolCall + onContent capture; routeCreateSlide branch in onComplete; ReviewStep prop threading; mapStageToBuildState helper"
    - "src/taskpane/components/wizard/ReviewStep.tsx — accept toolCall/commentary/onBuildStateChange/mapStageToBuildState props; mount SlidePreview during composition stages"
    - "src/taskpane/slide/types.ts — BuildState union widened with fetching-data | composing | rendering (additive)"

key-decisions:
  - "D-02 router extracted as pure helper (slideRouter.ts) rather than inlined. Guarantees the automated slideRouter.test.ts covers the same predicate that runs in production (ChatPanel + WizardPanel both call routeCreateSlide instead of inlining the isInProcess check). Tradeoff accepted per plan guidance."
  - "SlidePreview sub-components (StageLabelStrip, PreviewCanvas, RegionContent, ActionRow) kept inline in the same file for locality — matches codebase discipline in ChatPanel/StepIndicator (inline style, module-scope color constants, no makeStyles)."
  - "SlidePreview tests (SlidePreview.test.tsx) assert module surface + PREV-01 error boundary only — full render/state-machine tests deferred to manual UAT per 05-UI-SPEC.md (Vitest env=node; jsdom setup out-of-scope for v1). The state machine exercises translateSql / loadCubeData / composeWithRetry / renderVegaToBase64Png / insertSlide — all individually unit-tested by Plans 01–03."
  - "CMPS-03 grounding capture uses onContent-tail-accumulation pattern (final value wins) rather than onComplete.finalContent because existing streamCubeAI shape delivers content via throttled onContent fires + one final un-throttled flush. Both ChatPanel and WizardPanel capture the last value; WizardPanel additionally falls back to raw result.content on onComplete if onContent never fired."
  - "ReviewStep prop contract expanded (toolCall, commentary, onBuildStateChange, mapStageToBuildState) all optional — the legacy narrative Build Slide flow still works when none are passed, preserving backward compatibility with any test harness that doesn't exercise Phase 5 paths."
  - "BuildState widened additively (new states appended to union) rather than factored into a separate type — every existing consumer (ReviewStep narrative branches, WizardPanel bottom-nav buttons) still compiles because the legacy states remain first-class."

patterns-established:
  - "Pattern: D-02 router as pure helper. Extracting the toolCall-state predicate into a tested helper avoids duplicating the condition across ChatPanel.handleCreateSlide and WizardPanel.onComplete."
  - "Pattern: CMPS-03 grounding capture via onContent tail + onComplete fallback. The parent captures whichever fires last; the composer receives a non-empty commentary whenever Cube AI streamed both toolCall and assistant content in the same stream."
  - "Pattern: SlidePreviewStage union mapped at parent boundary (mapStageToSlideState in ChatPanel, mapStageToBuildState in WizardPanel) — SlidePreview doesn't know about ChatMessage or BuildState, and parents don't import SlidePreview's union transitively."
  - "Pattern: custom CSS @keyframes + prefers-reduced-motion fallback in global taskpane.css — React component references className (shimmer-region, indeterminate-bar) without importing a style module; accessibility fallback is declarative (no JS)."

requirements-completed: [PREV-01]
requirements-progressed: [CMPS-01, CMPS-02, CMPS-03, CHRT-04, DATA-01, TABL-NATV-01]

# Metrics
duration: 11min
completed: 2026-04-24
tasks_total: 3
tasks_executed: 2
tasks_pending: 1  # Task 3 is a human-verify checkpoint — requires D-23/D-24/D-25 resolution
files_created: 4
files_modified: 5
commits: 4
---

# Phase 5 Plan 04: SlidePreview UI Integration Summary

**Wave 3 UI integration complete for the code-level tasks: SlidePreview live-preview React component with 5-stage state machine + single-AbortController pipeline + custom CSS shimmer + D-02 router helper wires ChatPanel and WizardPanel to the composition path whenever Cube AI emits a finalised cubeSqlApi toolCall. Legacy narrative Create Slide / Build Slide flows preserved. Full Vitest suite 143 passing (0 failures, 6 UAT it.todo).**

**Task 3 (manual UAT in PowerPoint) is an explicit `checkpoint:human-verify` that cannot be executed by the agent — it requires PowerPoint Desktop sideload + end-to-end verification of the 8 scenarios in 05-04-PLAN.md + resolution of D-23/D-24/D-25 (Cube Cloud agent link, deployment env vars, ANTHROPIC_API_KEY). The unit-testable surface is complete and the plan's autonomous flag is false specifically to gate phase sign-off at this step.**

## Performance

- **Duration:** ~11 min (2 tasks, TDD cycles for each)
- **Started:** 2026-04-24T02:36:54Z
- **Completed:** 2026-04-24T02:47:35Z (for Tasks 1 + 2; Task 3 pending human UAT)
- **Tasks executed:** 2 of 3 (Task 3 is a human-verify checkpoint)
- **Files created:** 4 (SlidePreview.tsx, SlidePreview.test.tsx, slideRouter.ts, slideRouter.test.ts)
- **Files modified:** 5 (taskpane.css, ChatPanel.tsx, WizardPanel.tsx, ReviewStep.tsx, slide/types.ts)
- **Commits:** 4 (2 TDD RED + 2 TDD GREEN pairs)

## Task 1 — SlidePreview component + shimmer CSS

**RED commit `2ac9e10`:** `test(05-04-01): add failing test for SlidePreview module surface` — imports from `./SlidePreview` fail (module missing), confirming the test exercises the real surface.

**GREEN commit `b8c24c8`:** `feat(05-04-01): implement SlidePreview live composition preview`

### SlidePreview component inventory

| Component | Role |
|-----------|------|
| `SlidePreview` (top-level) | FC with props `{toolCall, userQuestion, commentary, onStageChange, onSuccess, onError}`; owns AbortController + resetKey + partial-plan state |
| `StageLabelStrip` | Renders Fluent `Spinner` (active stages), `CheckmarkCircle16Filled` (success), `ErrorCircle20Regular` (failed), stage-labelled `Text` + indeterminate progress bar |
| `PreviewCanvas` | 280×158 16:9 positioned region map, defaults to D-12 60/40 split until `partial.regions` streams |
| `RegionContent` | Branches on `region.kind` → text snapshot if corresponding partial field present, otherwise shimmer div |
| `ActionRow` | `Stop building` subtle button during active stages, `Try again` primary button in failed state, hidden in success |
| `buildComposedTableSpec` | Converts CompositionPlan.tableSpec + resolved rows + Cube AI tableChartSpec flags into ComposedSlideContent.tableSpec (threading `showRowNumbers` per TABL-NATV-01) |

### State machine flow

```
mount → fetching-data (translateSql → loadCubeData)
     → composing (composeWithRetry, partial-plan streamed into setPartial)
     → rendering (renderVegaToBase64Png if chartSpec; insertSlide)
     → success (hold 1200ms → onSuccess)
     → (any error) failed (setError + onError + telemetry 'slidepreview.failed')
```

Abort path: Stop click → `acRef.current.abort()`; the effect's `cancelled` guard + Cube signal terminate every async leg silently (no user-facing error).

### taskpane.css additions

| Addition | Purpose |
|----------|---------|
| `@keyframes shimmer` (1400ms linear) | Background-position sweep `-200% → 200%` for `.shimmer-region` |
| `.shimmer-region` | Gradient background + animation binding; fallback bg `#F3F4F6` |
| `@keyframes indeterminate-bar` (2000ms ease-in-out) | 0→1→0 scaleX pulse for `.indeterminate-bar` progress strip |
| `.indeterminate-bar` | Animation binding for the 2px progress strip under StageLabelStrip |
| `@media (prefers-reduced-motion: reduce)` | Freezes both animations (shimmer static gray, bar at scaleX 0.5) |

### Done-criteria receipts

- `grep -c "SlidePreview\|SlidePreviewProps\|SlidePreviewStage" src/taskpane/components/SlidePreview.tsx` → 12 (≥ 3) ✓
- `grep -c "AbortController\|ac.abort" src/taskpane/components/SlidePreview.tsx` → 4 (≥ 2) ✓
- All 5 pipeline imports present (`translateSql`, `loadCubeData`, `composeWithRetry`, `renderVegaToBase64Png`, `insertSlide`) → 12 match lines ✓
- `grep -c "@keyframes shimmer\|@keyframes indeterminate-bar\|prefers-reduced-motion" src/taskpane/taskpane.css` → 3 ✓
- `grep -c "makeStyles\|useStyles\|@skeleton" src/taskpane/components/SlidePreview.tsx` → 0 ✓ (no Fluent Skeleton, no makeStyles)
- **CMPS-03 grounding:** `grep -c "commentary" src/taskpane/components/SlidePreview.tsx` → 11 ✓ (prop declared, destructured, threaded into composeWithRetry({cubeMeta: {commentary, ...}}))

## Task 2 — ChatPanel + WizardPanel + ReviewStep integration

**RED commit `d57095f`:** `test(05-04-02): add failing test for D-02 slide router` — 4 scenarios covering composition / narrative absent / narrative isInProcess:true / narrative wrong name.

**GREEN commit `1433961`:** `feat(05-04-02): wire SlidePreview into ChatPanel + WizardPanel via D-02 router`

### slideRouter.routeCreateSlide contract

```ts
routeCreateSlide({toolCall: CubeSqlApiToolCall | null | undefined}) → "composition" | "narrative"
```

- Returns `"narrative"` if `toolCall` is falsy OR `toolCall.name !== "cubeSqlApi"` OR `toolCall.isInProcess !== false`
- Returns `"composition"` otherwise

Consumed by ChatPanel.handleCreateSlide (routes via this, not inline check) AND WizardPanel.onComplete (same).

### ChatPanel diff summary

1. `slideState` union widened with `"fetching-data" | "composing" | "rendering"` (additive; existing `idle | creating | created | failed` preserved)
2. Two new optional ChatMessage fields: `toolCall?: CubeSqlApiToolCall` + `commentary?: string` (CMPS-03)
3. `handleSubmit`: new `capturedToolCall` and `capturedCommentary` closure bindings; `onToolCall` + `onContent` callbacks populate them; `onComplete` attaches both to the new assistant message
4. `handleCreateSlide`: early branch via `routeCreateSlide(msg)` — composition flips slideState to `fetching-data` (SlidePreview takes over on next render); narrative path unchanged
5. Render branch: new conditional mounts `<SlidePreview ... />` when `msg.slideState ∈ {fetching-data, composing, rendering} AND msg.toolCall` — uses `findLastUserQuestion(i)` helper + `mapStageToSlideState` for stage → ChatMessage.slideState translation
6. Legacy `msg.slideState === "creating" | "created" | "failed"` branches untouched

### WizardPanel diff summary

1. `toolCallRef` + `commentaryRef` hoisted (refs, not state — mutated inside stream callbacks without triggering re-render)
2. `handleBuild`: reset both refs at start; add `onToolCall` callback + extend `onContent` to accumulate commentary tail
3. `onComplete`: `routeCreateSlide({toolCall: toolCallRef.current})` decides composition vs narrative; composition flips `buildState → "fetching-data"` (ReviewStep mounts SlidePreview); narrative path is the legacy `extractSlideContent + insertSlide + setBuildState("built" | "failed")` flow unchanged
4. New `mapStageToBuildState` helper (pure) passed to ReviewStep
5. ReviewStep receives: `toolCall={toolCallRef.current}`, `commentary={commentaryRef.current}`, `onBuildStateChange={setBuildState}`, `mapStageToBuildState={mapStageToBuildState}`
6. Bottom-nav button branches untouched — new composition states fall into the existing "not idle and not building" branch (Back-only), which is the correct UX for mid-composition

### ReviewStep diff summary

- New optional props: `toolCall`, `commentary`, `onBuildStateChange`, `mapStageToBuildState` (all optional to preserve backward compatibility)
- New conditional between `building` and `built` branches: mounts `<SlidePreview ... />` when `buildState ∈ {fetching-data, composing, rendering} AND toolCall` present
- Legacy `idle | building | built | failed` branches untouched

### Done-criteria receipts

- `grep -c "toolCall\|onToolCall\|SlidePreview\|CubeSqlApiToolCall" src/taskpane/components/ChatPanel.tsx` → 18 (≥ 6) ✓
- `grep -c "toolCallRef\|onToolCall\|fetching-data\|composing\|rendering" src/taskpane/components/WizardPanel.tsx` → 7 (≥ 4) ✓
- `grep -n "SlidePreview" src/taskpane/components/wizard/ReviewStep.tsx` → 7 hits (≥ 1) ✓
- **CMPS-03:** `grep -E "msg.commentary|capturedCommentary|commentaryRef" src/taskpane/components/ChatPanel.tsx src/taskpane/components/WizardPanel.tsx` → 9 (≥ 3) ✓
- **CMPS-03:** `grep -E "commentary=\\{" src/taskpane/components/ChatPanel.tsx src/taskpane/components/wizard/ReviewStep.tsx` → 2 (≥ 2) ✓
- **D-02 coverage:** `routeCreateSlide` present in slideRouter.ts + slideRouter.test.ts + ChatPanel.tsx + WizardPanel.tsx (≥ 5 matches) ✓
- `npx vitest run src/taskpane/services/slideRouter.test.ts` → 4 passing ✓
- `npx vitest run` → 143 passing + 6 todo (full suite no regressions) ✓
- Legacy `extractSlideContent` still present in ChatPanel narrative path ✓

## Task 3 — Manual UAT checkpoint (DEFERRED)

**Checkpoint type:** `checkpoint:human-verify` (blocking per 05-04-PLAN.md `autonomous: false`)

**Deferred because:** Task 3 requires PowerPoint Desktop sideload + end-to-end visual/functional verification of 8 scenarios AND depends on D-23/D-24/D-25 external prerequisites (Cube Cloud agent 13 linked to `dFdm_7Eleven`, deployment-specific `CUBE_DATA_BASE_URL` + `CUBE_DATA_JWT`, `ANTHROPIC_API_KEY`). The executor agent runs headless (no PowerPoint desktop access) and cannot provide secrets.

**When D-23/D-24/D-25 resolve:** Re-run this checkpoint per the 8 scenarios listed in 05-04-PLAN.md (Test 1 chat chart, Test 2 chat table, Test 3 chat narrative fallback, Test 4 wizard chart, Test 5 Stop building, Test 6 error recovery, Test 7 prefers-reduced-motion, Test 8 prompt-cache telemetry). Reviewer returns `"approved"` on all green, or specific failure notes.

## Deviations from Plan

None — plan executed exactly as written. All Rule 1–3 guards were unnecessary (no bugs surfaced, no missing-critical-functionality gaps, no blocking issues encountered during implementation).

## Authentication Gates

None encountered during executor run. Task 3 UAT will require `ANTHROPIC_API_KEY`, `CUBE_DATA_JWT`, and `CUBEAI_API_KEY` (all three are documented prerequisites in the plan's `how-to-verify` Setup section).

## Threat Flags

No new surface introduced outside the `<threat_model>` table in 05-04-PLAN.md. T-05-18 through T-05-22 disposition stands:
- T-05-18 (DoS via rapid Create Slide clicks) mitigated by per-message `slideState` disabling the button in non-idle states
- T-05-19 (taskpane commentary preview) accepted (user-local device)
- T-05-20 (aborted stream partial PowerPoint state) mitigated by late `insertSlide` call — only after finalPlan + chart PNG ready
- T-05-21 (error stack leak) mitigated — failed-state UI renders `err.message` only, not `err.stack`
- T-05-22 (reduced-motion ignored) accepted — ARIA + role=group + aria-live="polite" are the accessibility primary; motion is secondary

## Known Stubs / Deferred Items

- **SlidePreview.test.tsx 6 it.todo UAT entries** — not stubs in the user-facing sense; they document which scenarios require jsdom/DOM rendering infrastructure that is intentionally out-of-scope for v1 (05-UI-SPEC.md defers these to manual UAT). The underlying services (translateSql, loadCubeData, composeWithRetry, renderVegaToBase64Png, insertSlide) have complete Vitest coverage via Plans 01–03.

## Remaining Phase 5 gap items for /gsd-verify-work

- LLM-judge run against fixtures (mentioned in 05-04-PLAN.md output section) — requires Anthropic API access, deferred until D-23/D-24/D-25 resolve
- Cache-hit telemetry verification (`cache_read_input_tokens > 0` on 2nd composition call within 5 min) — manual inspection via `localStorage.getItem("summit.ai.trace.v1")` during UAT Test 8
- Phase 5 sign-off blocked on Task 3 UAT approval

## TDD Gate Compliance

Both tasks followed RED → GREEN cycles cleanly:
- Task 1 RED (2ac9e10) → Task 1 GREEN (b8c24c8)
- Task 2 RED (d57095f) → Task 2 GREEN (1433961)

No REFACTOR commits needed — initial implementations matched the spec contract without requiring cleanup. TDD gate sequence verified in `git log --oneline`.

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| `2ac9e10` | test(05-04-01) | add failing test for SlidePreview module surface |
| `b8c24c8` | feat(05-04-01) | implement SlidePreview live composition preview |
| `d57095f` | test(05-04-02) | add failing test for D-02 slide router |
| `1433961` | feat(05-04-02) | wire SlidePreview into ChatPanel + WizardPanel via D-02 router |

## Self-Check: PASSED

**Created files verified on disk:**
- `src/taskpane/components/SlidePreview.tsx` — FOUND
- `src/taskpane/components/SlidePreview.test.tsx` — FOUND
- `src/taskpane/services/slideRouter.ts` — FOUND
- `src/taskpane/services/slideRouter.test.ts` — FOUND

**Commits verified in git log:**
- `2ac9e10` — FOUND
- `b8c24c8` — FOUND
- `d57095f` — FOUND
- `1433961` — FOUND

**Test suite:** 143 passing / 0 failing / 6 todo (UAT deferrals)

**tsc on plan 04 files:** zero errors (pre-existing tsc errors in composer.ts, compositionRetry.ts, cubeai.ts, composerUser.test.ts, sqlTranslator.ts, compositionSchema.test.ts are out-of-scope — present before this plan, scope-boundary rule applies)
