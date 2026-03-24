# Phase 3: Cube AI Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 03-cube-ai-integration
**Areas discussed:** CORS status, Streaming delivery, Error presentation, Progress indication

---

## CORS Status

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, it worked | Direct fetch to Cube AI succeeded from Office WebView2 context — no proxy needed | ✓ |
| No, CORS blocked | Got CORS error — need proxy server fallback (D-06) | |
| Haven't tested yet | Phase 1 built but not tested in PowerPoint yet | |

**User's choice:** Yes, it worked
**Notes:** CORS confirmed working. Proxy fallback (Phase 1 D-06) not needed. Direct API calls proceed.

---

## Streaming Delivery

| Option | Description | Selected |
|--------|-------------|----------|
| Real-time text | Each NDJSON delta immediately appends to chat message — word-by-word like ChatGPT | |
| Chunked updates | Buffer deltas and update UI every ~200ms — smoother rendering, less React re-render pressure | ✓ |
| Wait for complete | Show loading state, display full response at once — simpler but less engaging | |

**User's choice:** Chunked updates
**Notes:** ~200ms batching for smooth streaming feel without per-token re-renders.

---

## Error Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Inline chat message | Error as styled message in chat flow with retry button | ✓ |
| Toast notification | Temporary notification above chat | |
| Error panel | Dedicated error section at top of taskpane | |

**User's choice:** Inline chat message

### Error Detail Level

| Option | Description | Selected |
|--------|-------------|----------|
| User-friendly only | Simple messages, technical details in console | ✓ |
| Expandable details | User-friendly with 'Show details' toggle | |
| Full technical | HTTP status codes and error types inline | |

**User's choice:** User-friendly only
**Notes:** Clean demo experience. Technical details logged to browser console for debugging.

---

## Progress Indication

### Loading Indicator Type

| Option | Description | Selected |
|--------|-------------|----------|
| Typing dots | Animated '...' dots like iMessage/Teams | |
| Spinner with text | Fluent UI spinner with descriptive text | ✓ |
| Skeleton text | Gray placeholder lines that fill in | |
| You decide | Claude picks best approach | |

**User's choice:** Spinner with text

### Spinner Text Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Static text | Single message throughout | |
| Phase-based text | Text changes based on actual stream events | ✓ |
| You decide | Claude picks based on NDJSON stream events | |

**User's choice:** Phase-based text
**Notes:** Text updates based on actual stream events — "Connecting..." → "Connected" → "Generating response..."

---

## Claude's Discretion

- Exact callback/event pattern for streaming delivery
- Retry behavior on transient errors
- Chunked update interval tuning
- Spinner component placement

## Deferred Ideas

None — discussion stayed within phase scope
