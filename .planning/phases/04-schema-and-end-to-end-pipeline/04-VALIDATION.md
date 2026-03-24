---
phase: 4
slug: schema-and-end-to-end-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit tests) + manual PowerPoint verification |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run src/taskpane/services/schemaParser.test.ts` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Full vitest suite + webpack build check
- **Before `/gsd:verify-work`:** Full suite + manual PowerPoint test
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | SCHM-01 | unit | `npx vitest run schemaParser.test.ts` | N/A W0 | pending |
| 04-01-02 | 01 | 1 | SCHM-02, SCHM-03 | unit | `npx vitest run schemaParser.test.ts` | N/A W0 | pending |
| 04-02-01 | 02 | 2 | TASK-01, LYOT-01 | manual | `npx webpack --mode production` | N/A | pending |

*Status: pending*

---

## Wave 0 Requirements

- [ ] `src/taskpane/services/schemaParser.test.ts` — test stubs for JSON extraction, validation, fallback
- Vitest already installed from Phase 3

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end question → slide | TASK-01 | Requires live Cube AI + PowerPoint | Type question, click Create Slide, verify slide appears |
| Cube AI layout selection | LYOT-01 | Requires live AI response | Ask data-heavy question, verify table/chart layout chosen |
| Malformed JSON fallback | SCHM-03 | Requires Cube AI to return non-JSON | Ask ambiguous question, verify text-only slide created |

---

## Validation Sign-Off

- [ ] All tasks have automated or manual verification
- [ ] Unit tests cover parser extraction, validation, and fallback
- [ ] Build succeeds after each task
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending