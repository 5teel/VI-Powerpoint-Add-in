---
phase: 05-chart-table-interpretation-slide-composition
plan: 02
subsystem: composer-ai
tags: [phase-5, wave-1, composer-ai, anthropic, zod, ajv, prompt-cache, guardrails, telemetry]

# Dependency graph
requires:
  - phase: 05-chart-table-interpretation-slide-composition/01
    provides: "config.ts ANTHROPIC_API_KEY + ANTHROPIC_MODEL, runtime deps (@anthropic-ai/sdk, zod, zod-to-json-schema, ajv, ajv-formats, vega-lite), and the Wave 0 test-file stubs (compositionSchema.test.ts + compositionRetry.test.ts replaced in-place)"
provides:
  - "CompositionPlanSchema (Zod) + inferred CompositionPlan type — consumed by Plans 03 (renderer) and 04 (live preview)"
  - "COMPOSER_SYSTEM_PROMPT_V1 — byte-stable 11219-char prompt above Sonnet 4.6 2048-token cache minimum (ephemeral cache block)"
  - "buildUserContent — per-request user assembler with MAX_ROWS_CHARS=12000 (head-truncate) + MAX_COMMENTARY_CHARS=2000 (tail-truncate)"
  - "composeSlide — Anthropic SDK forced-tool streaming call with dangerouslyAllowBrowser, max_tokens=4096, temperature=0.4, AbortSignal threading"
  - "composeWithRetry — G1 (Zod) + G2 (Ajv Vega-Lite) guardrails: 1-retry-with-repair-hint + final fallback to originalVegaSpec"
  - "telemetry logEvent/readEvents/clearEvents — localStorage ring buffer (summit.ai.trace.v1 key, 100-event cap) with throw-swallow discipline"
  - "__setAnthropicClientForTesting — test-only client override (T-05-11 accepted)"
affects: [phase-5-plan-03, phase-5-plan-04]

# Tech tracking
tech-stack:
  added: []  # All deps installed in Plan 01
  patterns:
    - "Singleton Anthropic client at module load (Pitfall 5 fail-fast — dangerouslyAllowBrowser throws at construction, not first call)"
    - "Forced tool_choice + streaming inputJson + Zod.parse on finalMessage tool_use.input — constrains model output to schema"
    - "Module-level Ajv compile for Vega-Lite schema — cost paid once per bundle lifetime (strict:false to tolerate unknown formats like color-hex)"
    - "G2 retry pattern: REPAIR INSTRUCTIONS prepended to userQuestion on second attempt, final fallback swaps in originalVegaSpec"
    - "localStorage ring buffer with throw-swallow (telemetry MUST NEVER block the composition call)"

key-files:
  created:
    - "src/taskpane/services/compositionSchema.ts (2196 bytes) — Zod CompositionPlanSchema with RegionSchema/DataFilterSchema/TableSpecSchema sub-schemas + 2 refine rules"
    - "src/taskpane/prompts/composerSystem.ts (11667 bytes, 11219-char prompt string) — COMPOSER_SYSTEM_PROMPT_V1 with six canonical sections in order"
    - "src/taskpane/prompts/composerUser.ts — buildUserContent assembler with truncation discipline"
    - "src/taskpane/prompts/composerUser.test.ts — 9 tests (5 buildUserContent + 4 COMPOSER_SYSTEM_PROMPT_V1)"
    - "src/taskpane/services/composer.ts (4073 bytes) — Anthropic SDK forced-tool streaming composition call"
    - "src/taskpane/services/composer.test.ts — 5 tests (parameter wiring, onFinal, onPartialPlan, onError paths)"
    - "src/taskpane/services/compositionRetry.ts (2425 bytes) — Ajv + G1/G2 guardrails with 1-retry-with-repair-hint"
    - "src/taskpane/services/telemetry.ts (1462 bytes) — localStorage ring buffer with throw-swallow discipline"
    - "src/taskpane/services/telemetry.test.ts — 3 tests (write-read, 100-event cap, error suppression)"
  modified:
    - "src/taskpane/services/compositionSchema.test.ts — Plan 01 it.todo stubs replaced with 15 real tests"
    - "src/taskpane/services/compositionRetry.test.ts — Plan 01 it.todo stubs replaced with 4 real tests"

key-decisions:
  - "Module-load singleton Anthropic client (Pitfall 5): fail-fast on missing API key or invalid construction args rather than lazy surfacing the error on first composeSlide call"
  - "Forced tool_choice: {type:'tool', name:'compose_slide'} (not 'auto'): guarantees one tool_use block, constrains next-token distribution to the JSON schema, eliminates free-text jailbreak surface (T-05-07 mitigation)"
  - "Ajv strict:false + allErrors:true: Vega-Lite v6 schema references the color-hex format which Ajv's strict mode would reject; strict:false emits a warning instead and validation proceeds. allErrors:true gives us the top-5 errors for the repair hint"
  - "G2 retry strategy: prepend REPAIR INSTRUCTIONS to userQuestion (not system prompt) so the byte-stable cache hit on system[0] is preserved"
  - "localStorage ring buffer with [...existing, new].slice(-MAX_EVENTS) semantics: oldest event is dropped when cap reached (FIFO)"

patterns-established:
  - "Pattern: Module-level Anthropic singleton with __setForTesting hook — enables unit tests to inject stubs without changing module-load behaviour in prod"
  - "Pattern: Byte-stable system prompt as exported module-level const — never templated, never interpolated, name carries V1/V2 version marker for coordinated schema+prompt rolls"
  - "Pattern: Ajv module-load compile + telemetry-wrapped retry — G2 guardrails surface validation failures to the ring buffer for observability without blocking the composer path"

requirements-completed: [CMPS-01, CMPS-02, CMPS-03]

# Metrics
duration: 14min
completed: 2026-04-24
---

# Phase 5 Plan 02: Composition AI Layer Summary

**Composition AI layer landed: CompositionPlanSchema (Zod) + COMPOSER_SYSTEM_PROMPT_V1 (11219 chars, above Sonnet 4.6 cache minimum) + buildUserContent truncation discipline + composer.composeSlide forced-tool streaming call + compositionRetry.composeWithRetry G1/G2 guardrails + telemetry ring buffer — full Vitest suite 105 passed / 0 failed.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-04-24T01:50:28Z
- **Completed:** 2026-04-24T02:04:34Z
- **Tasks:** 2
- **Files modified:** 11 (9 created, 2 modified)

## Accomplishments

- **CompositionPlanSchema** (Zod): full shape per 05-AI-SPEC.md §4b.1 with RegionSchema (id/kind/x/y/w/h), DataFilterSchema (topN/includeOthersBucket/orderBy/orderDir), TableSpecSchema (renderMode native-tablev2|image, columns, totals/pagination flags), top-level schema with 2 `.refine` rules (chart/table region requires corresponding spec; regions within canvas bounds). 15 tests cover valid-plan + 14 distinct rejection paths.
- **COMPOSER_SYSTEM_PROMPT_V1**: 11219 chars (well above the conservative 6200-char / 2048-token threshold for Sonnet 4.6 prompt cache). Six canonical sections in order: `<RESPONSIBILITIES>` → `<LAYOUT_RULES>` → `<COMMENTARY_RULES>` → `<CHART_MUTATION_RULES>` → `<TABLE_RENDER_RULES>` (D-13 native-tablev2 ≤10 rows ∧ ≤5 cols heuristic) → `<FEW_SHOT_EXAMPLES>` (split, stacked, multi-element). Byte-stable: no template literals, no interpolation markers (`${`) — cache hygiene enforced by a test.
- **buildUserContent**: deterministic assembler with six labelled sections; MAX_ROWS_CHARS=12000 (head-truncation, flagged with "truncated" marker); MAX_COMMENTARY_CHARS=2000 (tail-truncation to preserve concrete facts over generic preamble). Falls back to tableChartSpec when vegaSpec is absent.
- **composer.composeSlide**: Anthropic SDK `messages.stream(...)` with exact parameter set — model=ANTHROPIC_MODEL, max_tokens=4096, temperature=0.4, system[0]=COMPOSER_SYSTEM_PROMPT_V1 with `cache_control:{type:"ephemeral"}`, system[1]=per-request canvas line (NOT cached), tools=[compose_slide], `tool_choice:{type:"tool", name:"compose_slide"}`, messages=[user buildUserContent], second-arg `{signal: input.signal}` for AbortSignal. Subscribes to `stream.on("inputJson", (_, snapshot) => cb.onPartialPlan(snapshot))` and `stream.on("error", cb.onError)`. Awaits `stream.finalMessage()`, finds tool_use block, runs `CompositionPlanSchema.parse(toolUse.input)`, invokes `cb.onFinal(plan)`. Any throw → `cb.onError(err)`.
- **compositionRetry.composeWithRetry**: Ajv + vega-lite-schema.json compiled at module load (strict:false for unknown-format tolerance). If the first plan's chartSpec fails Ajv validation → logs `guardrail.vega_retry` event with top-5 errors → invokes attempt(2) with REPAIR INSTRUCTIONS prepended. If retry throws → logs `guardrail.vega_retry_failed`. If second attempt's chartSpec still fails → logs `guardrail.vega_fallback` and swaps in `originalVegaSpec` (G2 final fallback).
- **telemetry**: `logEvent(name, payload?)` writes `{t: Date.now(), name, payload}` to localStorage under `summit.ai.trace.v1` key. Ring buffer capped at 100 events (FIFO eviction via `[...existing, new].slice(-100)`). Wrapped in try/catch with `console.warn` on failure — NEVER throws. `readEvents()` and `clearEvents()` exposed for future export menu.
- **Full Vitest suite**: 105 passing + 11 todo, 0 failures, 3.57s.

## Task Commits

Each task was committed atomically (using `--no-verify` per parallel-executor protocol):

1. **Task 1: compositionSchema.ts + composerSystem.ts + composerUser.ts** — `5b18163` (feat)
2. **Task 2: composer.ts + compositionRetry.ts + telemetry.ts** — `edbbfa6` (feat)

## Files Created/Modified

### Created
- `src/taskpane/services/compositionSchema.ts` (2196 bytes) — Zod CompositionPlanSchema + RegionSchema/DataFilterSchema/TableSpecSchema + 2 refine rules
- `src/taskpane/prompts/composerSystem.ts` (11667 bytes file, 11219-char prompt) — byte-stable COMPOSER_SYSTEM_PROMPT_V1 with six canonical sections
- `src/taskpane/prompts/composerUser.ts` — buildUserContent with MAX_ROWS_CHARS=12000 + MAX_COMMENTARY_CHARS=2000
- `src/taskpane/prompts/composerUser.test.ts` — 9 tests (5 buildUserContent + 4 COMPOSER_SYSTEM_PROMPT_V1)
- `src/taskpane/services/composer.ts` (4073 bytes) — Anthropic SDK forced-tool streaming composition
- `src/taskpane/services/composer.test.ts` — 5 tests (parameter wiring, onFinal/onPartialPlan/onError paths)
- `src/taskpane/services/compositionRetry.ts` (2425 bytes) — Ajv + G1/G2 guardrails with 1-retry-with-repair-hint
- `src/taskpane/services/telemetry.ts` (1462 bytes) — localStorage ring buffer
- `src/taskpane/services/telemetry.test.ts` — 3 tests (write-read, 100-event cap, error suppression)

### Modified
- `src/taskpane/services/compositionSchema.test.ts` — Plan 01 5 `it.todo` stubs replaced with 15 real tests
- `src/taskpane/services/compositionRetry.test.ts` — Plan 01 3 `it.todo` stubs replaced with 4 real tests

## CompositionPlanSchema Field Enumeration

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `layout` | enum | "chart-only", "split", "stacked", "sidebar", "multi-element" | Exactly 5 values |
| `regions` | array | min length 1, max length 6; each region has id (min:1)/kind/x/y/w/h | Refine: every region x+w <= 1 AND y+h <= 1 |
| `regions[].kind` | enum | "title", "subtitle", "commentary", "chart", "table", "callout" | 6 region kinds |
| `regions[].x/y/w/h` | number | each [0, 1] | Fractions of 16:9 canvas |
| `title` | string | min 1, max 120 chars | Required |
| `subtitle` | string | max 160 chars | Optional |
| `commentary` | string | min 1, max 1200 chars | Required |
| `chartSpec` | record(any) | optional | Refine: required if any region.kind === "chart" AND no tableSpec |
| `tableSpec` | TableSpecSchema | optional | Refine: required if any region.kind === "table" AND no chartSpec |
| `tableSpec.renderMode` | enum | "native-tablev2", "image" | D-13 heuristic enforced via prompt |
| `tableSpec.columns[]` | array | key/header/align(left\|right\|center)? | Required if tableSpec present |
| `tableSpec.showRowTotals/showColumnTotals/showPagination` | boolean? | optional | |
| `dataFilter.topN` | int, 1-50 | optional | |
| `dataFilter.includeOthersBucket` | boolean | optional | |
| `dataFilter.orderBy/orderDir` | string/asc\|desc | optional | |

**Refine rules:**
1. `chartSpec !== undefined OR tableSpec !== undefined OR no region has kind in {chart, table}` — prevents orphan chart/table regions.
2. `every region satisfies x+w <= 1 AND y+h <= 1` — canvas-bounds enforcement.

## COMPOSER_SYSTEM_PROMPT_V1 Section Markers

Byte-stable prompt length: **11219 chars** (well above 6200-char / 2048-token conservative threshold).

Section order (enforced by test): `<RESPONSIBILITIES>` → `<LAYOUT_RULES>` → `<COMMENTARY_RULES>` → `<CHART_MUTATION_RULES>` → `<TABLE_RENDER_RULES>` → `<FEW_SHOT_EXAMPLES>`.

No `${` interpolation markers present (cache-hygiene test enforces).

## composer.ts Parameter Wiring Confirmation

| Param | Value | Source |
|-------|-------|--------|
| `model` | `ANTHROPIC_MODEL` from `../config` | config.ts import |
| `max_tokens` | `4096` | Explicit cap (T-05-08 mitigation) |
| `temperature` | `0.4` | Per 05-AI-SPEC.md §3 |
| `system[0].text` | `COMPOSER_SYSTEM_PROMPT_V1` | Prompt module |
| `system[0].cache_control` | `{type:"ephemeral"}` | Cache hit on 5-min window |
| `system[1].text` | `Canvas: {W}x{H}px (16:9).` | Per-request, NOT cached |
| `tools[0]` | `compose_slide` with zodToJsonSchema(CompositionPlanSchema) | Module-load derivation |
| `tool_choice` | `{type:"tool", name:"compose_slide"}` | Forced (not "auto") |
| `messages[0].content` | `buildUserContent(input)` | Per-request assembler |
| Second arg | `input.signal ? {signal: input.signal} : {}` | AbortSignal threading |

Streaming handlers:
- `stream.on("inputJson", (_, snapshot) => cb.onPartialPlan(snapshot))` — emits partial CompositionPlan snapshots during streaming
- `stream.on("error", cb.onError)` — surfaces stream errors
- `await stream.finalMessage()` → find `tool_use` block → `CompositionPlanSchema.parse(toolUse.input)` → `cb.onFinal(plan)`
- Any throw (missing tool_use block, Zod parse failure, stream rejection) → `cb.onError(err)`

## compositionRetry.ts Retry Path Summary

```
attempt(1) → plan
  ├─ plan.chartSpec valid via Ajv? → cb.onFinal(plan), return plan  [no retry: 90% path]
  ├─ plan.chartSpec invalid via Ajv?
  │    ├─ logEvent("guardrail.vega_retry", {errors: top-5})
  │    ├─ attempt(2) with REPAIR INSTRUCTIONS prepended to userQuestion
  │    │    ├─ attempt(2) throws → logEvent("guardrail.vega_retry_failed"), proceed to fallback
  │    │    ├─ attempt(2) succeeds → overwrite plan variable, re-validate
  │    ├─ plan.chartSpec still invalid after attempt(2)?
  │    │    ├─ logEvent("guardrail.vega_fallback")
  │    │    ├─ plan = {...plan, chartSpec: (originalVegaSpec ?? plan.chartSpec)}
  │    └─ cb.onFinal(plan), return plan  [G2 fallback path]
  └─ attempt(1) throws → cb.onError(err), rethrow  [G1 surface: no retry on non-Ajv errors]
```

Retry is bounded to exactly ONE (never two or more). Final fallback swaps in `originalVegaSpec` (the Cube AI emitted spec) when present, otherwise leaves the invalid chartSpec in place but logs `guardrail.vega_fallback`.

## telemetry.ts Contract Summary

| Concern | Value |
|---------|-------|
| localStorage key | `summit.ai.trace.v1` |
| Max events | 100 (ring buffer, FIFO eviction via `.slice(-100)`) |
| Throw behaviour | NEVER throws (try/catch + console.warn on failure) |
| Event shape | `{ t: Date.now(), name: string, payload?: Record<string, unknown> }` |
| Public API | `logEvent(name, payload?)`, `readEvents()`, `clearEvents()` |

## Decisions Made

- **Module-load Anthropic singleton** (Pitfall 5). `dangerouslyAllowBrowser: true` throws at client construction for missing apiKey, not on first request. Failing fast at import surfaces config errors at app boot, before any user-visible UI flow.
- **Forced tool_choice (not auto).** Guarantees a single tool_use block. Eliminates free-text-then-tool-call ambiguity. Constrains model's next-token distribution to the JSON schema (harder to jailbreak via prompt injection — T-05-07 mitigation).
- **Ajv strict:false + allErrors:true.** Vega-Lite v6 schema uses the color-hex format which Ajv's strict mode would reject (warning "unknown format 'color-hex' ignored"). strict:false tolerates it; allErrors:true gives us the top-5 error batch for the repair hint string.
- **REPAIR INSTRUCTIONS prepended to userQuestion, NOT system prompt.** Preserves byte-stable system[0] so the ephemeral cache hit survives the retry (saves ~2048-token re-ingestion cost on the second call).
- **localStorage FIFO eviction via slice(-100).** Simpler than maintaining an explicit head pointer; O(n) on each write but n is bounded to 100 so irrelevant in practice.
- **Zod schema is non-strict on record(any) for chartSpec.** Zod cannot express Vega-Lite's depth; Ajv handles the chartSpec JSON-Schema validation in a second gate. Keeps the concerns separated (shape vs chart validity).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking] vega-lite-schema.json import path**
- **Found during:** Task 2 first test run
- **Issue:** The plan specified `import vegaLiteSchema from "vega-lite/build/vega-lite-schema.json"` but the vega-lite v6.4.2 package.json `exports` field only exposes `./vega-lite-schema.json` (mapped internally to `./build/vega-lite-schema.json`). Vite's node-resolution condition rejected the `./build/` path with `"./build/vega-lite-schema.json" is not exported under the conditions ["node", "development", "import"]`.
- **Fix:** Changed import to `import vegaLiteSchema from "vega-lite/vega-lite-schema.json"` — the package-exports-compatible path.
- **Files modified:** `src/taskpane/services/compositionRetry.ts`
- **Verification:** `import` resolves and `ajv.compile(vegaLiteSchema)` succeeds (with expected color-hex strict-mode warning on stderr).
- **Committed in:** `edbbfa6` (Task 2 commit — fix was made before the commit so it's part of the initial Task 2 implementation)

**2. [Rule 1 - Bug] compositionRetry.test.ts VALID_SPEC fixture missing `data` property**
- **Found during:** Task 2 first test run after the import-path fix
- **Issue:** The plan's test fixture `const VALID_SPEC = { $schema, mark: "bar", encoding: {...} }` failed Ajv validation against the actual vega-lite v6.4.2 schema — the v6 schema requires `data` as a top-level property for a single-view spec (it was implicitly tolerated under the v5 schema's union with data:{values:[]} defaults). As a consequence, the "no retry when first plan has valid chartSpec" test saw 2 calls to composeSlide (retry triggered) instead of 1.
- **Fix:** Added `data: { values: [{ a: "x", b: 1 }] }` inline to the VALID_SPEC fixture, with a comment explaining the v6 requirement.
- **Files modified:** `src/taskpane/services/compositionRetry.test.ts`
- **Verification:** All 4 composeWithRetry tests now pass. The "no retry" test correctly sees 1 call to composeSlide on valid input; the "retry exactly once" and "G2 fallback" tests still trigger the retry on the INVALID_SPEC fixture.
- **Committed in:** `edbbfa6` (Task 2 commit — fix was made before the commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking, 1 Rule 1 bug)
**Impact on plan:** Both fixes were localised to their respective files and do not change any public API or test contract. Both were necessary for the plan's stated verification to pass. No scope creep, no architectural change.

## Issues Encountered

- **Windows CRLF warnings** on all newly-created files during `git add`. Cosmetic; `git core.autocrlf` handles the conversion. Same pattern as Plan 01.
- **`.planning/` is gitignored** in the worktree (commit `12e4bed`). SUMMARY.md force-added with `git add -f` per executor protocol; orchestrator will untrack `.planning/` after merging back to master.
- **vega-lite color-hex format warnings** on stderr during test runs. Expected — Ajv's strict mode emits `unknown format "color-hex" ignored in schema at path "#/definitions/HexColor"` because the color-hex format is a Vega-Lite convention not recognised by ajv-formats. strict:false tolerates it; validation proceeds correctly.

## User Setup Required

No additional user setup for Plan 02. Plan 01's Anthropic API key requirement carries forward; live smoke tests (Phase 5 UAT) require `ANTHROPIC_API_KEY` but all Plan 02 automated tests mock the Anthropic client via `__setAnthropicClientForTesting`.

## Next Phase Readiness

- **Ready for Plan 03 (rendering):** `CompositionPlan` type is exported from `compositionSchema.ts`. Plan 03's `composedRenderer.ts` can import it and dispatch on `plan.regions[].kind` + `plan.layout`.
- **Ready for Plan 04 (live preview + UI wiring):** `composeWithRetry(input, cb, originalVegaSpec?)` is the single entry point. Plan 04's preview component subscribes to `cb.onPartialPlan` for streaming updates and `cb.onFinal` for the final plan.
- **Ready for evals harness (Plan 04b or follow-on):** telemetry ring buffer exposes `readEvents()` for the future export-to-JSON menu item.
- **Blocked on external prerequisites D-23/D-24:** Cube Cloud agent-to-deployment linkage and `dFdm_7Eleven` JWT still outstanding (unchanged from Plan 01). Composer doesn't depend on them directly but the end-to-end pipeline Plan 04 will.

## Threat Flags

No new threat surface introduced beyond the plan's `<threat_model>`. All identified threats (T-05-07 prompt injection, T-05-08 DoS via runaway tokens, T-05-09 invalid Vega-Lite spec, T-05-10 telemetry leak, T-05-11 test hook, T-05-12 hallucinated commentary) have their mitigations landed in this plan:
- T-05-07: forced tool_choice + tail-truncate commentary at 2000 chars + Zod parse gate
- T-05-08: max_tokens:4096 + AbortSignal threading through `{signal}`
- T-05-09: Ajv G2 validation + render-to-canvas-not-HTML (Plan 03)
- T-05-10: typed event payloads, no row data, localStorage-only (never remote)
- T-05-11: `__setAnthropicClientForTesting` accepted trade-off, clearly named
- T-05-12: length cap via prompt (80-word commentary rule), LLM-judge Dimension 4 deferred to eval harness

## Known Stubs

None. All files wire real logic to real external modules (Anthropic SDK, Ajv, Zod, vega-lite schema). Tests use mocked Anthropic client per plan; production code path is fully wired.

## TDD Gate Compliance

This plan uses `type: execute` (not `type: tdd` at plan level), but both tasks have `tdd="true"` task attribute. Per executor guidance, I replaced Plan 01's `it.todo` test stubs with real tests as part of the same commits that added the implementation — this follows the RED→GREEN pattern in spirit (the todo stubs were the RED gate from Plan 01's scaffolding commit; this plan's commits are the GREEN gate). Both task commits are `feat(...)` rather than `test(...)` + `feat(...)` because the tests were embedded in the same implementation commit, which is the accepted pattern when replacing stub-only scaffolds.

## Self-Check: PASSED

**Created files exist:**
- `src/taskpane/services/compositionSchema.ts` — FOUND
- `src/taskpane/prompts/composerSystem.ts` — FOUND
- `src/taskpane/prompts/composerUser.ts` — FOUND
- `src/taskpane/prompts/composerUser.test.ts` — FOUND
- `src/taskpane/services/composer.ts` — FOUND
- `src/taskpane/services/composer.test.ts` — FOUND
- `src/taskpane/services/compositionRetry.ts` — FOUND
- `src/taskpane/services/telemetry.ts` — FOUND
- `src/taskpane/services/telemetry.test.ts` — FOUND

**Commits exist:**
- `5b18163` (Task 1) — FOUND
- `edbbfa6` (Task 2) — FOUND

**Success criteria verified:**
- `npx vitest run`: 105 passed + 11 todo, 0 failures, 3.57s
- `grep -n "CompositionPlanSchema" src/taskpane/services/compositionSchema.ts`: 4 hits (≥ 1 required)
- `grep -n "COMPOSER_SYSTEM_PROMPT_V1" src/taskpane/prompts/composerSystem.ts`: 1 hit; file size 11667 bytes (> 6500 required)
- `grep -n "buildUserContent" src/taskpane/prompts/composerUser.ts`: 1 hit (≥ 1 required)
- `grep -c "tool_choice.*compose_slide\|cache_control.*ephemeral\|dangerouslyAllowBrowser: true" src/taskpane/services/composer.ts`: 3 hits (≥ 3 required)
- `grep -n "validateVegaLite\|REPAIR INSTRUCTIONS\|guardrail" src/taskpane/services/compositionRetry.ts`: 8 hits (≥ 3 required)
- `grep -n "summit.ai.trace.v1" src/taskpane/services/telemetry.ts`: 1 hit (≥ 1 required)

---
*Phase: 05-chart-table-interpretation-slide-composition*
*Completed: 2026-04-24*
