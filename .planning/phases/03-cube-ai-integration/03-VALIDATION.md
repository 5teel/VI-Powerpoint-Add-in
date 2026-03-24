---
phase: 3
slug: cube-ai-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual verification in PowerPoint taskpane |
| **Config file** | none — no automated test framework for Office.js add-in |
| **Quick run command** | `npm run dev-server` then test in PowerPoint |
| **Full suite command** | Manual: test all streaming, error, and progress scenarios |
| **Estimated runtime** | ~60 seconds per scenario |

---

## Sampling Rate

- **After every task commit:** Verify build succeeds with `npm run dev-server`
- **After every plan wave:** Full manual test in PowerPoint
- **Before `/gsd:verify-work`:** All scenarios tested in PowerPoint
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | CUBE-01 | manual | `npm run dev-server` (build check) | N/A | pending |
| 03-01-02 | 01 | 1 | CUBE-02 | manual | `npm run dev-server` (build check) | N/A | pending |
| 03-02-01 | 02 | 1 | TASK-02 | manual | `npm run dev-server` (build check) | N/A | pending |
| 03-02-02 | 02 | 1 | TASK-03 | manual | `npm run dev-server` (build check) | N/A | pending |

*Status: pending*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test framework additions needed — Phase 3 validation is manual testing in the PowerPoint taskpane.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Streaming NDJSON parsing | CUBE-01, CUBE-02 | Office.js add-in must run in PowerPoint WebView2 | Type a question, verify response streams and displays correctly |
| Progress indicator | TASK-02 | Visual UX requires human observation | Submit question, verify spinner appears with phase-based text changes |
| Error handling | TASK-03 | Network/API errors require simulating failure conditions | Test with invalid API key, network disconnect, malformed response |
| Chunked UI updates | CUBE-02 | Streaming smoothness is a visual quality judgment | Observe response appearing in ~200ms chunks, not all-at-once |

---

## Validation Sign-Off

- [ ] All tasks have manual verification steps defined
- [ ] Build succeeds after each task
- [ ] All manual scenarios tested in PowerPoint
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending