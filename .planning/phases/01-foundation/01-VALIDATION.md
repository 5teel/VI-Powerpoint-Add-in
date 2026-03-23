---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (installed via yo office scaffold) |
| **Config file** | jest.config.js (created during scaffold) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test -- --coverage` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test -- --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | BRND-01 | manual | Sideload and visually verify taskpane opens with Summit VI branding | N/A | ⬜ pending |
| 01-02-01 | 02 | 1 | TASK-02 | integration | `npm test -- --grep "CubeAI"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/cubeai.test.ts` — stubs for CORS test and API connectivity
- [ ] Jest configured in scaffold output

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Taskpane opens in PowerPoint with Summit VI branding | BRND-01 | Requires PowerPoint desktop app with sideloaded add-in | 1. Run `npm start` 2. Open PowerPoint 3. Verify taskpane shows Summit VI logo and branding |
| CORS test from WebView2 context | TASK-02 | Requires running inside Office WebView2, not standard browser | 1. Load add-in in PowerPoint 2. Click test button 3. Verify Cube AI response appears (or CORS error is caught and displayed) |
| Add-in loads via sideload manifest | BRND-01 | Requires PowerPoint sideload process | 1. Follow sideload instructions 2. Verify add-in appears in PowerPoint ribbon/taskpane |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
