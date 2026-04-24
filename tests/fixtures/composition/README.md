# Composition Reference Dataset

Reference fixtures for Phase 5 offline LLM-judge evaluation (per 05-AI-SPEC.md §5b).

Layout:
- `good/` — "acceptable to exec" gold standard compositions
- `bad-chart-type-drift/` — failure mode #1 triggers
- `bad-insight-free-commentary/` — failure mode #2 triggers
- `bad-commentary-drift/` — failure mode #3 triggers

Each fixture is a JSON file with `{fixtureId, userQuestion, cubeAiToolCall, cubeAiCommentary, cubeRestRows, canvas, expectedSlideTraits}` per 05-AI-SPEC.md §5 "Reference Dataset".

Target count: 25 fixtures at v1 (expanding to 40 by phase close).
