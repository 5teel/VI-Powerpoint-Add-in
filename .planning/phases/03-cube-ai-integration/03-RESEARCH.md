# Phase 3: Cube AI Integration - Research

**Researched:** 2026-03-24
**Domain:** NDJSON streaming API client, React streaming UI, error handling
**Confidence:** HIGH

## Summary

Phase 3 evolves the existing `testCubeAIConnection()` function in `src/taskpane/services/cubeai.ts` into a production streaming client that delivers chunked content updates to the React ChatPanel UI. The existing code already contains correct NDJSON line buffering, chatId extraction, delta vs final message handling, and error classification. The primary work is: (1) refactoring the monolithic test function into a callback-based streaming client that emits partial content as it arrives, (2) updating ChatPanel to display streaming text with phase-based progress indication, and (3) rendering errors as inline chat messages with retry capability.

No new libraries are needed. The existing stack (native `fetch` + `ReadableStream` + Fluent UI v9 `Spinner`) covers all requirements. The NDJSON parsing pattern from the MCP server reference implementation (`C:\Development\Summit MCP Server - Claude\src\cubeai.ts`) is already replicated in the add-in's `cubeai.ts` and is correct.

**Primary recommendation:** Refactor `cubeai.ts` to accept an `onChunk` callback (or similar) that fires every ~200ms with accumulated delta content, enabling ChatPanel to render progressive text updates and phase-based spinner labels.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** CORS works -- direct fetch to `ai.gcp-us-central1.cubecloud.dev` from WebView2 succeeds. No proxy needed.
- **D-02:** Continue using hardcoded API key in `config.ts`. No auth changes.
- **D-03:** Chunked updates -- buffer NDJSON deltas and flush to React UI every ~200ms. Smoother rendering than per-token updates.
- **D-04:** Evolve existing `testCubeAIConnection()` into production streaming client with callbacks. Test function can be removed or kept separately.
- **D-05:** Errors appear as inline chat messages in conversation flow -- styled distinctly with retry button. Not toasts or separate panels.
- **D-06:** User-friendly error messages only -- no HTTP status codes or technical error types in UI. Technical details logged to console.
- **D-07:** Fluent UI spinner with text label shown in chat area during Cube AI response.
- **D-08:** Phase-based spinner text that updates based on actual stream events -- "Connecting..." on request start, "Connected" when first bytes arrive, "Generating response..." when delta content starts.

### Claude's Discretion
- Exact callback/event pattern for streaming delivery (callbacks, async iterators, or EventTarget)
- Retry behavior on transient errors (auto-retry vs manual retry button only)
- Chunked update interval tuning (200ms target, adjustable)
- Spinner component placement within chat flow

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CUBE-01 | Add-in connects directly to Cube AI Chat API via HTTPS with API key authentication | Existing `cubeai.ts` already implements this correctly. Refactor to production service preserving auth pattern. |
| CUBE-02 | Add-in parses streaming NDJSON responses with correct line buffering across chunk boundaries | Existing line buffering pattern is correct (split on \n, keep incomplete line in buffer, flush on stream end). Needs refactoring to emit partial content via callbacks instead of accumulating silently. |
| TASK-02 | User sees loading/progress indication while Cube AI processes (3-15s) | Fluent UI `Spinner` component with phase-based label text updated from stream events. |
| TASK-03 | User sees clear error messages when API calls fail or responses are malformed | Existing error classification (cors/auth/network/server/unknown) maps to user-friendly messages. Render as inline chat messages with retry button. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native Fetch API | built-in | HTTPS requests to Cube AI | Already in use; WebView2 supports ReadableStream for NDJSON streaming |
| React 18 | 18.3.1 | UI framework | Already installed; state management for streaming updates via useState/useCallback |
| @fluentui/react-components | 9.73.4 | Spinner, MessageBar, Button | Already installed; provides Spinner with label prop for phase-based progress text |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fluentui/react-icons | ^2.0.258 | Error/retry icons | Already installed; use for retry button icon and error indicators |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Callback-based streaming | AsyncIterator/AsyncGenerator | AsyncIterators are cleaner but require `for await...of` which adds complexity with the 200ms throttle; callbacks are simpler for throttled flushing |
| Callback-based streaming | EventTarget/CustomEvent | More decoupled but over-engineered for a single consumer (ChatPanel) |
| Manual NDJSON parser | ndjson-readablestream npm | Adds dependency for ~15 lines of code that already work correctly |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/taskpane/
  services/
    cubeai.ts          # Streaming client (refactored from test function)
  components/
    ChatPanel.tsx      # Updated to consume streaming callbacks
  config.ts            # Unchanged -- API configuration
```

### Pattern 1: Callback-Based Streaming with Throttled Flush
**What:** The streaming client accepts an `onUpdate` callback that receives accumulated content at ~200ms intervals, plus an `onPhaseChange` callback for spinner text updates.
**When to use:** For this phase -- single consumer (ChatPanel), throttled delivery, simple integration.
**Example:**
```typescript
// Source: Adapted from existing cubeai.ts + MCP server pattern

export interface StreamCallbacks {
  onPhaseChange: (phase: StreamPhase) => void;
  onContent: (accumulatedContent: string) => void;
  onComplete: (result: CubeAIStreamResult) => void;
  onError: (error: CubeAIError) => void;
}

export type StreamPhase = "connecting" | "connected" | "streaming" | "complete";

export interface CubeAIStreamResult {
  content: string;
  chatId: string | null;
}

export interface CubeAIError {
  message: string;        // User-friendly message
  type: "cors" | "auth" | "network" | "server" | "timeout" | "empty" | "unknown";
  retryable: boolean;
}

export function streamCubeAI(
  question: string,
  chatId: string | null,
  callbacks: StreamCallbacks
): AbortController {
  const controller = new AbortController();
  // ... implementation runs async, calls callbacks
  // Returns controller so caller can cancel
  return controller;
}
```

### Pattern 2: Throttled Content Flush (~200ms)
**What:** Buffer delta content from NDJSON lines and flush to the UI callback at a throttled interval to reduce React re-renders.
**When to use:** Always during streaming -- per-token updates cause excessive re-renders.
**Example:**
```typescript
// Inside the stream reading loop:
let lastFlush = 0;
const FLUSH_INTERVAL = 200; // ms

// After accumulating delta content:
const now = performance.now();
if (now - lastFlush >= FLUSH_INTERVAL) {
  callbacks.onContent(streamContent);
  lastFlush = now;
}

// Always flush on stream complete:
callbacks.onContent(streamContent);
callbacks.onComplete({ content: streamContent, chatId });
```

### Pattern 3: Phase-Based Progress from Stream Events
**What:** Map actual stream events to user-facing progress labels rather than using timers.
**When to use:** For the spinner text during API calls.
**Example:**
```typescript
// Phase transitions triggered by real events:
callbacks.onPhaseChange("connecting");  // Immediately on function call

// After fetch() resolves (HTTP response received):
callbacks.onPhaseChange("connected");

// After first delta content line parsed:
callbacks.onPhaseChange("streaming");

// After stream ends:
callbacks.onPhaseChange("complete");
```

### Pattern 4: Inline Error Messages with Retry
**What:** Errors render as styled chat messages within the conversation flow, with a retry button that re-sends the same question.
**When to use:** For all API errors during this phase.
**Example:**
```typescript
// ChatPanel stores the last question for retry:
const [lastQuestion, setLastQuestion] = useState<string>("");

const handleRetry = () => {
  if (lastQuestion) {
    handleSubmit(lastQuestion);
  }
};

// Error message renders inline:
// <MessageBar intent="warning">
//   <MessageBarBody>{error.message}</MessageBarBody>
//   <MessageBarActions>
//     <Button onClick={handleRetry}>Try again</Button>
//   </MessageBarActions>
// </MessageBar>
```

### Anti-Patterns to Avoid
- **Blocking on full response before showing anything:** The existing `testCubeAIConnection` does this. Must be refactored to emit partial content during streaming.
- **Per-token React re-renders:** Each NDJSON delta line could trigger a re-render. Use the ~200ms throttle to batch updates.
- **Showing HTTP status codes in UI:** Per D-06, only show user-friendly messages. Log technical details to `console.error()`.
- **Using `setInterval` for fake progress:** Per D-08, spinner text must reflect actual stream events, not timers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NDJSON line buffering | New parser from scratch | Refactor existing cubeai.ts buffer pattern | Already tested and working correctly |
| Spinner/progress UI | Custom animated spinner | Fluent UI `<Spinner size="small" label={phaseText} />` | Matches Office UI, already imported |
| Error display | Custom error panel | Fluent UI `<MessageBar intent="error/warning">` | Already used in ChatPanel, matches Office conventions |
| Request cancellation | Manual cleanup | `AbortController` | Already used in existing code, browser-native |

**Key insight:** The existing `cubeai.ts` already solves the hard problems (NDJSON buffering, error classification, abort handling). This phase is primarily a refactoring exercise to add streaming callbacks and UI integration, not a greenfield implementation.

## Common Pitfalls

### Pitfall 1: TextDecoder stream: true Flag
**What goes wrong:** Omitting `{ stream: true }` from `decoder.decode(value, { stream: true })` causes multi-byte UTF-8 characters to be split across chunks, producing garbled text.
**Why it happens:** NDJSON content may contain Unicode characters. Without `stream: true`, the decoder treats each chunk as a complete unit and replaces trailing partial characters with the replacement character.
**How to avoid:** Always pass `{ stream: true }` to `TextDecoder.decode()` when processing stream chunks. The existing code already does this correctly.
**Warning signs:** Garbled characters appearing intermittently in responses, especially with non-ASCII content.

### Pitfall 2: Race Condition on Unmount During Streaming
**What goes wrong:** User navigates away from ChatPanel (switches tab) while a stream is in progress. The streaming callback tries to call `setState` on an unmounted component, causing a React warning and potential memory leak.
**Why it happens:** The `streamCubeAI` function runs asynchronously and holds references to callbacks that close over component state.
**How to avoid:** Return the `AbortController` from `streamCubeAI` and call `controller.abort()` in a `useEffect` cleanup function. This cancels the fetch and stops all callbacks.
**Warning signs:** React warnings about updating state on unmounted components.

### Pitfall 3: Lost Final Content When Stream Ends with Buffered Data
**What goes wrong:** The NDJSON stream ends with a final line that has no trailing newline. The line stays in the buffer and is never processed.
**Why it happens:** The `lines.pop()` pattern correctly retains incomplete lines, but the final chunk may be a complete JSON line without a trailing `\n`.
**How to avoid:** After the `while(true)` read loop exits (done === true), process any remaining content in the buffer. The existing code already handles this with the "Process remaining buffer" block.
**Warning signs:** Final response content appears truncated; chatId from the last message is missing.

### Pitfall 4: Throttle Eating the Last Update
**What goes wrong:** The throttled flush fires at T=200ms, then the stream completes at T=250ms with additional content. If only the throttle-based flush runs, the last 50ms of content is lost.
**How to avoid:** Always perform a final un-throttled flush when the stream completes, regardless of when the last throttled flush occurred.
**Warning signs:** Streaming text in the UI appears to stop a few words short of the complete response.

### Pitfall 5: AbortController Timeout Clearing
**What goes wrong:** The timeout fires `controller.abort()` after 180s, but the timeout is not cleared on successful completion. If the component re-uses the same abort controller reference, the stale timeout can abort a subsequent request.
**Why it happens:** `clearTimeout` is called in the wrong place or skipped on certain code paths.
**How to avoid:** Use a `try/finally` pattern (as the MCP server does) to always clear the timeout. The existing test function clears timeout on multiple paths but the MCP server's `try/finally` pattern is cleaner.
**Warning signs:** Second request after a successful first request gets unexpectedly aborted.

## Code Examples

### Cube AI NDJSON Message Types (from existing code analysis)

The Cube AI API sends these NDJSON message types:

```typescript
// Source: Observed from existing cubeai.ts and MCP server implementation

// 1. State message -- contains chatId for conversation threading
{ "state": { "chatId": "abc123" } }

// 2. Delta message -- partial assistant content (streaming)
{ "role": "assistant", "content": "partial text...", "isDelta": true, "isInProcess": true }

// 3. Final message -- complete assistant response
{ "role": "assistant", "content": "full response text", "isDelta": false, "isInProcess": false }

// Messages may also contain "thinking" fields (observed in MCP server comments)
// The pattern: accumulate isDelta content, but if a non-delta, non-isInProcess message
// arrives, it contains the COMPLETE response and replaces accumulated deltas.
```

### Streaming Client Refactoring (recommended structure)

```typescript
// Source: Refactored from existing cubeai.ts + MCP server pattern

export function streamCubeAI(
  question: string,
  chatId: string | null,
  callbacks: StreamCallbacks
): AbortController {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CUBEAI_CONFIG.timeoutMs);

  callbacks.onPhaseChange("connecting");

  (async () => {
    try {
      const response = await fetch(CUBEAI_CONFIG.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Api-Key ${CUBEAI_CONFIG.apiKey}`,
        },
        body: JSON.stringify({
          input: question,
          sessionSettings: {
            externalId: CUBEAI_CONFIG.externalId,
            ...(chatId ? { chatId } : {}),
          },
        }),
        signal: controller.signal,
      });

      // ... error handling (reuse existing classification) ...

      callbacks.onPhaseChange("connected");

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamContent = "";
      let responseChatId: string | null = null;
      let lastFlush = 0;
      let firstDelta = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const message = JSON.parse(line);
            if (message.state?.chatId) {
              responseChatId = message.state.chatId;
            }
            if (message.role === "assistant" && message.content) {
              if (message.isDelta) {
                streamContent += message.content;
                if (firstDelta) {
                  callbacks.onPhaseChange("streaming");
                  firstDelta = false;
                }
              } else if (!message.isInProcess) {
                streamContent = message.content;
              }
            }
          } catch { /* skip unparseable */ }
        }

        // Throttled flush
        const now = performance.now();
        if (now - lastFlush >= 200) {
          callbacks.onContent(streamContent);
          lastFlush = now;
        }
      }

      // Final buffer processing + final flush
      // ... (same remaining-buffer pattern as existing code) ...
      callbacks.onContent(streamContent);
      callbacks.onComplete({ content: streamContent, chatId: responseChatId });
    } catch (err) {
      // Classify error and call callbacks.onError(...)
    } finally {
      clearTimeout(timeout);
    }
  })();

  return controller;
}
```

### ChatPanel Integration (recommended state structure)

```typescript
// Source: Adapted from existing ChatPanel.tsx

type StreamPhase = "connecting" | "connected" | "streaming" | "complete";

interface ChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
  error?: CubeAIError;
}

// State in ChatPanel:
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [streamingContent, setStreamingContent] = useState<string>("");
const [phase, setPhase] = useState<StreamPhase | null>(null);
const [lastQuestion, setLastQuestion] = useState<string>("");
const controllerRef = useRef<AbortController | null>(null);

// Cleanup on unmount:
useEffect(() => {
  return () => {
    controllerRef.current?.abort();
  };
}, []);
```

### Phase-Based Spinner Labels

```typescript
// Source: Decision D-08 from CONTEXT.md

const PHASE_LABELS: Record<StreamPhase, string> = {
  connecting: "Connecting to Cube AI...",
  connected: "Analyzing your question...",
  streaming: "Generating response...",
  complete: "",
};

// In JSX:
{phase && phase !== "complete" && (
  <Spinner size="small" label={PHASE_LABELS[phase]} />
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| EventSource (SSE) | fetch + ReadableStream | Stable since 2020 | fetch with ReadableStream is the standard for NDJSON; EventSource only supports text/event-stream format |
| axios for HTTP | Native fetch | Built-in to WebView2 | No dependency needed; fetch handles streaming natively |
| Polling for progress | Stream-event-based phases | N/A | Phase labels driven by actual stream events, not timers |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None currently installed |
| Config file | none -- see Wave 0 |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CUBE-01 | Fetch with correct headers, auth, body format | unit | `npx vitest run tests/cubeai.test.ts -t "auth"` | No -- Wave 0 |
| CUBE-02 | NDJSON line buffering across chunk boundaries | unit | `npx vitest run tests/cubeai.test.ts -t "buffer"` | No -- Wave 0 |
| TASK-02 | Phase callbacks fire in correct order during stream | unit | `npx vitest run tests/cubeai.test.ts -t "phase"` | No -- Wave 0 |
| TASK-03 | Error classification produces user-friendly messages | unit | `npx vitest run tests/cubeai.test.ts -t "error"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Install vitest: `npm install -D vitest`
- [ ] `tests/cubeai.test.ts` -- unit tests for streaming client (CUBE-01, CUBE-02, TASK-02, TASK-03)
- [ ] Mock `fetch` and `ReadableStream` for isolated testing of NDJSON buffer logic
- [ ] No `vitest.config.ts` needed if defaults work (vitest auto-detects tsconfig)

Note: ChatPanel UI rendering (spinner phases, error display, retry button) is best validated manually in PowerPoint since it requires the Office add-in context. Unit tests should focus on the `cubeai.ts` service layer which is framework-agnostic.

## Open Questions

1. **Does the final NDJSON message always have `isDelta: false` and `isInProcess: false`?**
   - What we know: Both the MCP server and existing test client treat `!isDelta && !isInProcess` as the "final complete response" signal. The final message replaces accumulated delta content.
   - What's unclear: Whether this is documented API behavior or empirical observation.
   - Recommendation: Keep the existing pattern. If the final message never arrives, the accumulated delta content is a valid fallback. Add a fallback that uses accumulated deltas if no final message appears.

2. **Should the old `testCubeAIConnection` function be preserved?**
   - What we know: D-04 says it "can be removed or kept as a separate utility."
   - Recommendation: Remove it. The new streaming client serves the same purpose and more. The test panel (`SlideTestPanel`) is unrelated to Cube AI testing. If needed for debugging, the streaming client with console logging is sufficient.

3. **Retry behavior: auto-retry or manual only?**
   - What we know: This is Claude's discretion per CONTEXT.md. Error types have a `retryable` flag in the proposed interface.
   - Recommendation: Manual retry button only for v1. Auto-retry adds complexity (exponential backoff, max retries, duplicate request risk) that is unnecessary for an internal demo. The retry button re-sends the exact same question.

## Sources

### Primary (HIGH confidence)
- `src/taskpane/services/cubeai.ts` -- Existing working NDJSON streaming client with line buffering
- `C:\Development\Summit MCP Server - Claude\src\cubeai.ts` -- Reference implementation with identical patterns
- `src/taskpane/components/ChatPanel.tsx` -- Current UI component to be evolved
- `src/taskpane/config.ts` -- API configuration (baseUrl, apiKey, externalId, timeoutMs)

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` -- Pitfall 3 (NDJSON buffering) directly applicable
- `.planning/research/ARCHITECTURE.md` -- Pattern 3 (Streaming UI Updates) directly applicable
- `.planning/research/STACK.md` -- Confirms native fetch + no NDJSON library as standard

### Tertiary (LOW confidence)
- Cube AI NDJSON message format (state/delta/final patterns) -- inferred from code, not from API documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, existing stack covers all needs
- Architecture: HIGH -- refactoring existing working code, patterns well-understood
- Pitfalls: HIGH -- NDJSON streaming is well-documented; existing code already avoids most pitfalls
- UI patterns: HIGH -- Fluent UI Spinner/MessageBar are straightforward components

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain, no rapidly changing dependencies)
