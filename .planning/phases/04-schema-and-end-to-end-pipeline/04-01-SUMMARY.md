---
phase: 04-schema-and-end-to-end-pipeline
plan: 01
subsystem: services
tags: [json-parser, prompt-engineering, cube-ai, schema-validation, vitest]

requires:
  - phase: 02-slide-renderer
    provides: SlideContent discriminated union types
provides:
  - extractSlideContent: multi-stage JSON extraction from LLM output
  - fallbackToTextOnly: graceful text-only fallback for unparseable responses
  - buildSlidePrompt: schema-embedded system prompt for Cube AI
affects: [04-02-chat-panel-integration, 04-03-end-to-end-pipeline]

tech-stack:
  added: []
  patterns: [multi-stage-json-extraction, tdd-red-green, pure-function-services]

key-files:
  created:
    - src/taskpane/services/schemaParser.ts
    - src/taskpane/services/schemaParser.test.ts
    - src/taskpane/services/promptBuilder.ts
    - src/taskpane/services/promptBuilder.test.ts
  modified: []

key-decisions:
  - "3-stage JSON extraction: direct parse, markdown fence regex, brace substring"
  - "Always delete chartImageBase64 from parsed output to prevent hallucinated base64 data"
  - "Fallback caps at 6 bullets with overflow in insight field"
  - "Full schema embedded in every prompt (stateless, no chatId dependency for schema context)"

patterns-established:
  - "Multi-stage extraction: try clean parse first, then progressively looser extraction"
  - "Validation rejects unknown types to force fallback rather than silent corruption"

requirements-completed: [SCHM-01, SCHM-02, SCHM-03, LYOT-01]

duration: 3min
completed: 2026-03-24
---

# Phase 4 Plan 01: Schema Parser and Prompt Builder Summary

**Multi-stage JSON schema parser with 3 extraction strategies, 4-type validation, chartImageBase64 stripping, and schema-embedded prompt builder for Cube AI**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T05:05:08Z
- **Completed:** 2026-03-24T05:07:51Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Schema parser extracts valid SlideContent from clean JSON, markdown-fenced JSON, and embedded JSON
- Validation rejects unrecognized types and missing required fields, returning null for fallback
- chartImageBase64 always stripped from parsed output to prevent hallucinated base64
- Prompt builder wraps user questions with complete slide JSON schema under 2000 chars
- 20 unit tests all passing (14 parser + 6 prompt builder)

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema parser (RED)** - `c8508ab` (test)
2. **Task 1: Schema parser (GREEN)** - `4dee2bc` (feat)
3. **Task 2: Prompt builder (RED)** - `249e550` (test)
4. **Task 2: Prompt builder (GREEN)** - `7ce8f49` (feat)

_TDD tasks have separate test and implementation commits_

## Files Created/Modified
- `src/taskpane/services/schemaParser.ts` - JSON extraction, validation, and text-only fallback
- `src/taskpane/services/schemaParser.test.ts` - 14 test cases for all extraction and fallback paths
- `src/taskpane/services/promptBuilder.ts` - System prompt construction with all 4 layout type schemas
- `src/taskpane/services/promptBuilder.test.ts` - 6 test cases for prompt builder

## Decisions Made
- 3-stage JSON extraction (direct parse, markdown fence regex, brace substring) covers all observed LLM output formats
- Always delete chartImageBase64 from parsed output (Pitfall 3: Cube AI may hallucinate base64 data)
- Fallback caps at 6 bullets with overflow going to insight field for cleaner slide layout
- Full schema embedded in every prompt request (stateless approach per D-02)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- schemaParser.ts and promptBuilder.ts ready for ChatPanel integration in Plan 02
- Both services are pure functions with no side effects, easy to wire into streaming pipeline

## Self-Check: PASSED

- All 4 created files verified on disk
- All 4 commit hashes verified in git log
