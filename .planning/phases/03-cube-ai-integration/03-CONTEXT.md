# Phase 3: Cube AI Integration - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the production Cube AI streaming pipeline — evolve the existing test client (`cubeai.ts`) into a reliable, streaming-capable service with chunked UI updates, phase-based progress indication, and user-friendly error handling. CORS is confirmed working; no proxy needed.

</domain>

<decisions>
## Implementation Decisions

### CORS & Connectivity
- **D-01:** CORS works — direct fetch to `ai.gcp-us-central1.cubecloud.dev` from the Office WebView2 context succeeds. No proxy server needed. The CORS fallback (Phase 1 D-06) is not required.
- **D-02:** Continue using the hardcoded API key in `config.ts` (Phase 1 D-04). No auth changes for Phase 3.

### Streaming Delivery
- **D-03:** Chunked updates — buffer NDJSON deltas and flush to the React UI every ~200ms. Smoother rendering than per-token updates, less React re-render pressure.
- **D-04:** Evolve the existing `testCubeAIConnection()` into a production streaming client that emits partial content via callbacks or similar pattern. The test function can be removed or kept as a separate utility.

### Error Presentation
- **D-05:** Errors appear as inline chat messages in the conversation flow — styled distinctly (warning/error styling) with a retry button. Errors stay in context, not toasts or separate panels.
- **D-06:** User-friendly error messages only — no HTTP status codes or technical error types shown in the UI. Technical details logged to browser console for debugging.

### Progress Indication
- **D-07:** Fluent UI spinner with text label shown in the chat area while waiting for Cube AI response.
- **D-08:** Phase-based spinner text that updates based on actual stream events — e.g., "Connecting..." on request start, "Connected" when first bytes arrive, "Generating response..." when delta content starts streaming.

### Claude's Discretion
- Exact callback/event pattern for streaming delivery (callbacks, async iterators, or EventTarget — whatever fits the React component architecture best)
- Retry behavior on transient errors (auto-retry vs manual retry button only)
- Chunked update interval tuning (200ms is the target, can adjust based on UX feel)
- Spinner component placement within the chat flow

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Cube AI Client (evolve this)
- `src/taskpane/services/cubeai.ts` — Working streaming NDJSON client with line buffering, chatId extraction, error classification. This is the starting point for Phase 3.
- `src/taskpane/config.ts` — Hardcoded API config (baseUrl, apiKey, externalId, timeoutMs)

### Cube AI API Reference
- `.planning/research/PITFALLS.md` — NDJSON buffering pitfalls, streaming edge cases
- `.planning/research/ARCHITECTURE.md` — Component boundaries, data flow patterns
- `.planning/research/STACK.md` — Technology stack and API surface

### Existing MCP Server (reference implementation)
- `C:\Development\Summit MCP Server - Claude\src\cubeai.ts` — Original Cube AI streaming client with full NDJSON parsing, chatId management, and error handling

### UI Components (integrate with)
- `src/taskpane/components/ChatPanel.tsx` — Chat panel where streaming responses and errors will appear
- `src/taskpane/components/App.tsx` — Main app component

### Project Context
- `.planning/PROJECT.md` — Project vision, constraints
- `.planning/REQUIREMENTS.md` — CUBE-01, CUBE-02, TASK-02, TASK-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **cubeai.ts `testCubeAIConnection()`**: Already handles fetch with AbortController timeout, NDJSON line buffering (split on \n, keep incomplete line in buffer), chatId extraction from state messages, delta vs final message handling, and error classification (cors/auth/network/server/unknown). This is the foundation to evolve.
- **ChatPanel.tsx**: Existing chat UI component — streaming responses and error messages will render here.
- **config.ts**: API configuration already set up with baseUrl, apiKey, externalId, timeoutMs.

### Established Patterns
- React 18 + Fluent UI v9 components
- Services in `src/taskpane/services/`
- TypeScript strict mode
- AbortController for request cancellation

### Integration Points
- Phase 3 streaming client feeds into Phase 4's schema parser — the streaming output must be capturable as complete JSON for schema parsing
- ChatPanel needs to accept streaming partial content and display it progressively
- Error and loading states need to render within the existing chat message flow

</code_context>

<specifics>
## Specific Ideas

- Spinner text should feel natural and informative — "Connecting..." → "Analyzing your question..." → "Generating response..." based on actual stream events, not fake timers
- Error retry button should re-send the same question without the user retyping it

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-cube-ai-integration*
*Context gathered: 2026-03-24*
