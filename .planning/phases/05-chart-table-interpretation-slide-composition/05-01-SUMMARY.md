---
phase: 05-chart-table-interpretation-slide-composition
plan: 01
subsystem: data-layer, test-infra, build-config
tags: [phase-5, wave-0, cube-rest, sql-translator, anthropic-sdk, vega-lite, zod, ajv, tsx, define-plugin]

# Dependency graph
requires:
  - phase: 03-cube-ai-integration
    provides: "streamCubeAI callback-based NDJSON client (extended here with onToolCall)"
  - phase: 04-schema-and-end-to-end-pipeline
    provides: "extractSlideContent narrative fallback path (preserved; routed via D-02)"
  - phase: 04.2-deployment
    provides: "DefinePlugin env var triad pattern (extended here with 4 new Phase 5 vars)"
provides:
  - "Seven runtime deps installed (@anthropic-ai/sdk, vega, vega-lite, zod, zod-to-json-schema, ajv, ajv-formats)"
  - "Four new DefinePlugin env vars wired across config.ts / webpack.config.js / vitest.config.ts / .env.example"
  - "REQUIREMENTS.md extended with seven new Phase 5 IDs (CMPS-01..03, TABL-NATV-01, DATA-01, SQL-01, PREV-01)"
  - "cubeai.ts extended with CubeSqlApiToolCall interface and optional onToolCall StreamCallback"
  - "cubeDataClient.ts — Cube REST /load with Continue-wait polling (1s interval, 60s timeout), AbortSignal threading, Bearer JWT"
  - "sqlTranslator.ts — Cube AI SQL → Cube REST query translation with full operator vocabulary and UnsupportedSqlError guards"
  - "Five Wave 0 test-file stubs with it.todo entries (vegaRenderer, compositionSchema, compositionRetry, composedRenderer, tableRenderer)"
  - "tests/fixtures/composition/ directory marker + scripts/evals/runLlmJudge.ts entry point + npm evals:judge script"
affects: [phase-5-plan-02, phase-5-plan-03, phase-5-plan-04]

# Tech tracking
tech-stack:
  added:
    - "@anthropic-ai/sdk@0.91.0 (browser mode, streaming + prompt caching)"
    - "vega@6.2.0 + vega-lite@6.4.2 (Vega-Lite spec compile + canvas render)"
    - "zod@3.25.76 + zod-to-json-schema@3.25.2 (CompositionPlanSchema definition)"
    - "ajv@8.18.0 + ajv-formats@3.0.1 (Vega-Lite spec validation gate)"
    - "tsx@4.21.0 (devDep — runs scripts/evals/runLlmJudge.ts entry point)"
  patterns:
    - "DefinePlugin triad extended: config.ts declare-const + webpack.config.js JSON.stringify + vitest.config.ts test stubs"
    - "Optional StreamCallbacks widening (onToolCall?) — backward-compatible with existing ChatPanel/WizardPanel callers"
    - "Continue-wait polling loop: Cube REST returns HTTP 200 + {error:'Continue wait'} during compute — must parse body before success decision (Pitfall 2)"
    - "Strict SQL allow-listing: regex-based translator throws on non-listed clauses rather than silently mis-translate"

key-files:
  created:
    - "src/taskpane/services/cubeDataClient.ts — Cube REST /load client with Continue-wait polling"
    - "src/taskpane/services/cubeDataClient.test.ts — 6 tests (polling, timeout, abort, error body, 401 auth, Bearer+body)"
    - "src/taskpane/services/sqlTranslator.ts — Cube AI SQL → Cube REST translator"
    - "src/taskpane/services/sqlTranslator.test.ts — 17 tests (MEASURE, operators, BETWEEN, DATE_TRUNC, forbidden shapes)"
    - "src/taskpane/services/vegaRenderer.test.ts — 4 it.todo stubs (CHRT-01..04)"
    - "src/taskpane/services/compositionSchema.test.ts — 5 it.todo stubs (CMPS-01, CMPS-02)"
    - "src/taskpane/services/compositionRetry.test.ts — 3 it.todo stubs (G1, G2 retry gates)"
    - "src/taskpane/slide/composedRenderer.test.ts — 3 it.todo stubs (fractionToPoints, overlap, dispatch)"
    - "src/taskpane/slide/tableRenderer.test.ts — 4 it.todo stubs (TABL-NATV-01)"
    - "tests/fixtures/composition/README.md — reference dataset directory marker (good/ + bad-*/)"
    - "scripts/evals/runLlmJudge.ts — LLM judge entry-point stub (imports @anthropic-ai/sdk)"
  modified:
    - "package.json — 7 runtime deps + tsx devDep + evals:judge script entry"
    - "package-lock.json — lockfile regenerated"
    - "src/taskpane/config.ts — added ANTHROPIC_API_KEY / ANTHROPIC_MODEL / CUBE_DATA_CONFIG exports"
    - "webpack.config.js — 4 new DefinePlugin entries"
    - "vitest.config.ts — 4 new test-env stubs"
    - ".env.example — Anthropic + Cube REST sections"
    - "src/taskpane/services/cubeai.ts — CubeSqlApiToolCall interface + optional onToolCall callback + NDJSON parser branch"
    - "src/taskpane/services/cubeai.test.ts — createMockCallbacks returns Required<StreamCallbacks>; 3 new onToolCall tests"
    - ".planning/REQUIREMENTS.md — 7 new IDs (CMPS-01..03, TABL-NATV-01, DATA-01, SQL-01, PREV-01) + traceability rows + coverage updated to 34"

key-decisions:
  - "BETWEEN detection in WHERE clause splitter — built custom splitTopLevelAnd() that tracks BETWEEN...AND pairs, paren depth, and quoted strings (naive split(/\\s+AND\\s+/i) broke on BETWEEN bounds)"
  - "Date literal detection via ISO regex — BETWEEN on /^\\d{4}-\\d{2}-\\d{2}/ columns routes to timeDimensions.dateRange; numeric BETWEEN routes to gte+lte filter pair"
  - "onToolCall is optional on StreamCallbacks — existing ChatPanel/WizardPanel callers compile unchanged (backward compat D-02)"
  - "Assistant content + toolCall emit independently in same stream — CMPS-03 grounding test proves onContent and onToolCall both fire before onComplete"

patterns-established:
  - "Pattern: Optional callback widening — add new SteamCallbacks.onX as optional field for backward compat with old callers (bypass TypeScript breakage)"
  - "Pattern: Cube REST polling loop — parse body BEFORE checking ok/status; HTTP 200 + {error:'Continue wait'} is the compute-in-progress signal"
  - "Pattern: SQL allow-list translator — forbidden shapes throw typed UnsupportedSqlError rather than best-effort silent translation"

requirements-completed: [DATA-01, SQL-01]

# Metrics
duration: 10min
completed: 2026-04-24
---

# Phase 5 Plan 01: Scaffolding & Data Layer Summary

**Wave 0 infrastructure landed: 7 Phase 5 runtime deps installed, DefinePlugin env triad extended to 4 new vars, cubeai.ts surfaces cubeSqlApi toolCalls via new onToolCall hook, Cube REST client with Continue-wait polling + SQL translator both pass their full test suites.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-24T01:34:09Z
- **Completed:** 2026-04-24T01:44:31Z
- **Tasks:** 3
- **Files modified:** 18 (11 created, 7 modified)

## Accomplishments

- Seven new runtime deps installed cleanly with `--ignore-scripts` (Phase 4.2 precedent): @anthropic-ai/sdk 0.91.0, vega 6.2.0, vega-lite 6.4.2, zod 3.25.76, zod-to-json-schema 3.25.2, ajv 8.18.0, ajv-formats 3.0.1 — plus tsx 4.21.0 as devDep for the evals:judge script
- DefinePlugin env triad extended with 4 new Phase 5 vars (ANTHROPIC_API_KEY, ANTHROPIC_MODEL, CUBE_DATA_BASE_URL, CUBE_DATA_JWT) wired across config.ts + webpack.config.js + vitest.config.ts + .env.example
- REQUIREMENTS.md extended with 7 new Phase 5 requirement IDs (CMPS-01..03, TABL-NATV-01, DATA-01, SQL-01, PREV-01) + traceability rows + coverage count updated to 34
- cubeai.ts ships a new exported CubeSqlApiToolCall interface and an optional onToolCall StreamCallback; NDJSON parser branch surfaces finalised cubeSqlApi toolCalls while preserving onContent/onComplete delivery of adjacent assistant lines (CMPS-03 grounding anchor)
- cubeDataClient.loadCubeData() — Cube REST /load POST with Bearer JWT, 1s polling loop on `{error:"Continue wait"}`, 60s timeout, AbortSignal threading, 401/403 → auth-failed error mapping
- sqlTranslator.translateSql() — covers MEASURE() stripping, all comparison operators (=, !=, <>, >, <, >=, <=), IN, LIKE (contains), IS NULL/NOT NULL (set/notSet), BETWEEN (timeDimensions.dateRange for ISO dates, gte+lte for numeric), DATE_TRUNC with 8 granularities, ORDER BY, LIMIT, and throws UnsupportedSqlError on JOIN, CTE, subquery, HAVING, UNION, INTERSECT, EXCEPT, window function, nested MEASURE
- Five Wave 0 test-file stubs with `it.todo` entries compile cleanly under Vitest (vegaRenderer, compositionSchema, compositionRetry, composedRenderer, tableRenderer); tests/fixtures/composition/ directory marker created; scripts/evals/runLlmJudge.ts entry point imports @anthropic-ai/sdk successfully
- Full Vitest suite: 69 passing + 19 todo, 0 failures, duration 1.1s

## Task Commits

Each task was committed atomically (using `--no-verify` per parallel-executor protocol):

1. **Task 1: Scaffold deps, env triad, requirement IDs, Wave 0 test stubs** — `ec993a8` (feat)
2. **Task 2: cubeai.ts onToolCall extension + cubeDataClient with Continue-wait polling** — `e2354c5` (feat)
3. **Task 3: sqlTranslator full operator + MEASURE + timeDimensions coverage** — `775c124` (feat)

## Files Created/Modified

### Created
- `src/taskpane/services/cubeDataClient.ts` — Cube REST /load client (~80 lines) with polling + 60s timeout + abort
- `src/taskpane/services/cubeDataClient.test.ts` — 6 tests (polling, timeout, abort, error body, 401, Bearer+body shape)
- `src/taskpane/services/sqlTranslator.ts` — Cube AI SQL → Cube REST translator (~225 lines) with splitTopLevelAnd() keyword tracker
- `src/taskpane/services/sqlTranslator.test.ts` — 17 tests (all operators + 6 forbidden shapes)
- `src/taskpane/services/vegaRenderer.test.ts` — 4 it.todo stubs (CHRT-01..04)
- `src/taskpane/services/compositionSchema.test.ts` — 5 it.todo stubs (CMPS-01, CMPS-02)
- `src/taskpane/services/compositionRetry.test.ts` — 3 it.todo stubs (G1, G2 retry gates)
- `src/taskpane/slide/composedRenderer.test.ts` — 3 it.todo stubs (fractionToPoints, overlap, dispatch)
- `src/taskpane/slide/tableRenderer.test.ts` — 4 it.todo stubs (TABL-NATV-01)
- `tests/fixtures/composition/README.md` — reference dataset directory marker
- `scripts/evals/runLlmJudge.ts` — LLM judge entry-point stub

### Modified
- `package.json` — 7 runtime deps + tsx devDep + evals:judge script
- `package-lock.json` — regenerated
- `src/taskpane/config.ts` — added Phase 5 declare-consts and scalar/grouped exports (ANTHROPIC_API_KEY, ANTHROPIC_MODEL, CUBE_DATA_CONFIG)
- `webpack.config.js` — 4 new DefinePlugin entries inside existing block
- `vitest.config.ts` — 4 new define stubs
- `.env.example` — Anthropic Composer Configuration + Cube REST Data API Configuration sections
- `src/taskpane/services/cubeai.ts` — added CubeSqlApiToolCall interface + onToolCall?: widening + NDJSON parser branch
- `src/taskpane/services/cubeai.test.ts` — createMockCallbacks returns Required<StreamCallbacks> + 3 new onToolCall tests
- `.planning/REQUIREMENTS.md` — 7 new Phase 5 requirement rows + traceability rows + coverage count (34)

## Decisions Made

- **Optional onToolCall on StreamCallbacks (not required).** Keeps existing ChatPanel/WizardPanel callers unchanged — backward-compatible widening per D-02. Required<StreamCallbacks> in tests gives internal type safety.
- **splitTopLevelAnd() in sqlTranslator.** Naive `split(/\s+AND\s+/i)` broke on BETWEEN...AND bounds. Built a char-by-char walker that tracks paren depth + single/double quotes + BETWEEN pairs. See Deviations §1.
- **Date literal detection via ISO regex.** `isDateLiteral(/^\d{4}-\d{2}-\d{2}(T...)?$/)` routes BETWEEN on date columns to `timeDimensions.dateRange` (preferred Cube API path for time-range queries); numeric BETWEEN falls through to gte+lte filter pair.
- **DefinePlugin triad updates use `--ignore-scripts` on npm install.** Phase 4.2 precedent (sharp native module build failures on some platforms). All 7 deps resolved cleanly this way.
- **tsx as the evals:judge runner** — lightweight TypeScript executor, consistent with Node 18+, avoids ts-node config overhead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] sqlTranslator WHERE splitter broke on BETWEEN...AND**
- **Found during:** Task 3 (sqlTranslator test suite run)
- **Issue:** The plan specified `whereMatch[1].split(/\s+AND\s+/i)` which naively split `revenue BETWEEN 100 AND 200` into two fragments (`"revenue BETWEEN 100"` and `"200"`), causing parseCondition to throw UnsupportedSqlError. Both BETWEEN tests failed.
- **Fix:** Replaced the naive split with a new `splitTopLevelAnd()` helper that walks char-by-char, tracks paren depth and single/double-quote state, detects BETWEEN keyword at word boundaries, and swallows the matching AND as part of the BETWEEN pair (not a top-level splitter).
- **Files modified:** src/taskpane/services/sqlTranslator.ts
- **Verification:** All 17 sqlTranslator tests pass — including both BETWEEN tests and the existing compound AND test (`state = 'NSW' AND year > 2023`).
- **Committed in:** 775c124 (Task 3 commit — fix was made before the commit, so it's part of the initial Task 3 implementation)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug)
**Impact on plan:** The fix was a localised internal helper addition — no API changes, no test-contract changes. Was necessary for the plan's own behavior criteria ("BETWEEN on date column → timeDimensions dateRange"). No scope creep.

## Issues Encountered

- `.planning/` is gitignored in the worktree (commit `12e4bed` removed it from tracking for GitHub push safety). REQUIREMENTS.md updates were written to the main repo's `.planning/REQUIREMENTS.md` directly; the worktree-local git commit does not include them. This is expected behavior — the orchestrator owns `.planning/` artifacts across worktrees.
- Windows CRLF line-ending warnings on all newly-created files during `git add`. This is cosmetic; git core.autocrlf handles the conversion.

## User Setup Required

**External services require manual configuration before Phase 5 plans 02-04 can run smoke tests:**

| Service | Env var | Why | Source |
|---------|---------|-----|--------|
| Anthropic | `ANTHROPIC_API_KEY` | Composition AI (D-04) | Anthropic Console → Settings → API Keys |
| Anthropic | `ANTHROPIC_MODEL` | Defaults to `claude-sonnet-4-6` if unset | — |
| Cube REST | `CUBE_DATA_BASE_URL` | Data rows for chart/table rendering (D-17) | Cube Cloud deployment URL for `dFdm_7Eleven` (blocked on external D-24) |
| Cube REST | `CUBE_DATA_JWT` | Cube REST auth (D-17) | Cube Cloud deployment-specific JWT for `dFdm_7Eleven` (blocked on external D-24) |

Wave 0 tests do NOT require these env vars — test stubs use vitest.config.ts defines.

## Next Phase Readiness

- **Ready for Plan 02 (composition AI + preview):** cubeai.ts onToolCall hook, cubeDataClient, and sqlTranslator are all wired and tested. Downstream plans can import `loadCubeData()`, `translateSql()`, and destructure the `CubeSqlApiToolCall` interface.
- **Ready for Plan 03 (rendering):** Five Wave 0 test stubs exist (vegaRenderer, compositionSchema, compositionRetry, composedRenderer, tableRenderer) — Plan 03 can extend them without infrastructure work.
- **Ready for Plan 04 (eval harness):** tests/fixtures/composition/ directory + scripts/evals/runLlmJudge.ts entry point exist. Plan 04 fills in judge logic + fixtures.
- **Blocked on external prerequisites D-23/D-24:** Cube Cloud agent-to-deployment linkage and `dFdm_7Eleven` deployment-specific JWT must be resolved before Phase 5 UAT smoke tests. This is an external prerequisite, not a code blocker.

## Self-Check: PASSED

**Created files exist:**
- `src/taskpane/services/cubeDataClient.ts` — FOUND
- `src/taskpane/services/cubeDataClient.test.ts` — FOUND
- `src/taskpane/services/sqlTranslator.ts` — FOUND
- `src/taskpane/services/sqlTranslator.test.ts` — FOUND
- `src/taskpane/services/vegaRenderer.test.ts` — FOUND
- `src/taskpane/services/compositionSchema.test.ts` — FOUND
- `src/taskpane/services/compositionRetry.test.ts` — FOUND
- `src/taskpane/slide/composedRenderer.test.ts` — FOUND
- `src/taskpane/slide/tableRenderer.test.ts` — FOUND
- `tests/fixtures/composition/README.md` — FOUND
- `scripts/evals/runLlmJudge.ts` — FOUND

**Commits exist:**
- `ec993a8` (Task 1) — FOUND
- `e2354c5` (Task 2) — FOUND
- `775c124` (Task 3) — FOUND

**Success criteria verified:**
- `npm ls @anthropic-ai/sdk vega vega-lite zod zod-to-json-schema ajv ajv-formats` — all 7 resolve cleanly
- Triad coverage: config.ts (8 hits) + webpack.config.js (4) + vitest.config.ts (4) = 16 (≥ 12 required)
- REQUIREMENTS.md: 15 mentions of the 7 new IDs (≥ 14 required)
- cubeai.ts: 3 hits for onToolCall/CubeSqlApiToolCall (≥ 3 required)
- cubeDataClient.ts: 4 hits for "Continue wait" | "Bearer" (≥ 2 required)
- sqlTranslator.ts: 18 hits for UnsupportedSqlError | MEASURE | DATE_TRUNC (≥ 3 required)
- `npx vitest run`: 69 passed + 19 todo, 0 failures, 1.1s duration

---
*Phase: 05-chart-table-interpretation-slide-composition*
*Completed: 2026-04-24*
