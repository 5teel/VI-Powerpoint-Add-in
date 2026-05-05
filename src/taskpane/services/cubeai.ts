// Cube AI streaming API client with callback-based delivery.
// Refactored from testCubeAIConnection() into production streaming client.
// Pattern source: C:\Development\Summit MCP Server - Claude\src\cubeai.ts

import { CUBEAI_CONFIG } from "../config";
import { logEvent } from "./telemetry";

export type StreamPhase = "connecting" | "connected" | "streaming" | "complete";

export interface CubeAIStreamResult {
  content: string;
  chatId: string | null;
}

export interface CubeAIError {
  message: string;
  type: "cors" | "auth" | "network" | "server" | "timeout" | "empty" | "unknown";
  retryable: boolean;
}

/** cubeSqlApi toolCall surfaced from Cube AI's NDJSON stream (Phase 5, D-02 router). */
export interface CubeSqlApiToolCall {
  name: "cubeSqlApi";
  isInProcess: false;
  input: {
    sqlQuery: string;
    queryTitle: string;
    description: string;
    chartCategory: "vega" | "table";
    vegaSpec?: object;
    tableChartSpec?: {
      showRowNumbers?: boolean;
      showColumnTotals?: boolean;
      showRowTotals?: boolean;
      showPagination?: boolean;
      columns?: string[];
      pivot?: boolean;
    };
    memoryId?: string;
    userRequest?: string;
  };
}

export interface StreamCallbacks {
  onPhaseChange: (phase: StreamPhase) => void;
  onContent: (accumulatedContent: string) => void;
  onComplete: (result: CubeAIStreamResult) => void;
  onError: (error: CubeAIError) => void;
  onToolCall?: (toolCall: CubeSqlApiToolCall) => void; // NEW — Phase 5 D-02 router hook
}

/**
 * Stream a question to Cube AI and deliver progressive content via callbacks.
 *
 * Returns an AbortController so the caller can cancel the request (e.g., on unmount).
 * The async work runs inside an IIFE so this function returns synchronously.
 */
// How long with no new bytes before we consider the stream stalled mid-response.
const STREAM_STALL_MS = 30_000;

export function streamCubeAI(
  question: string,
  chatId: string | null,
  callbacks: StreamCallbacks
): AbortController {
  const controller = new AbortController();

  // Track WHY we aborted so catch blocks can surface the right message.
  // User/unmount abort leaves both false → silent exit.
  let timedOut = false;
  let stallTimedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CUBEAI_CONFIG.timeoutMs);

  // Hoisted so finally can always clear it, even if connect never reached.
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  callbacks.onPhaseChange("connecting");

  (async () => {
    try {
      let response: Response;
      try {
        response = await fetch(CUBEAI_CONFIG.baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Api-Key ${CUBEAI_CONFIG.apiKey}`,
          },
          body: JSON.stringify({
            input: question,
            sessionSettings: {
              internalId: CUBEAI_CONFIG.externalId,
              ...(chatId ? { chatId } : {}),
            },
          }),
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          // Distinguish timeout/stall from user-initiated stop (silent).
          if (timedOut || stallTimedOut) {
            callbacks.onError({
              message: "Cube AI took too long to respond. Please try again.",
              type: "timeout",
              retryable: true,
            });
          }
          return;
        }

        const errorMsg = String(err);

        if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
          callbacks.onError({
            message: "Unable to reach Cube AI. Please check your connection and try again.",
            type: "cors",
            retryable: false,
          });
          return;
        }
        callbacks.onError({
          message: "Connection failed. Please check your network and try again.",
          type: "network",
          retryable: true,
        });
        return;
      }

      // HTTP error handling
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          callbacks.onError({
            message: "Authentication failed. The API key may be invalid.",
            type: "auth",
            retryable: false,
          });
          return;
        }
        if (response.status === 429) {
          callbacks.onError({
            message: "Cube AI is busy. Please wait a moment and try again.",
            type: "server",
            retryable: true,
          });
          return;
        }
        if (response.status >= 500) {
          callbacks.onError({
            message: "Cube AI encountered an error. Please try again.",
            type: "server",
            retryable: true,
          });
          return;
        }
        callbacks.onError({
          message: "Something went wrong. Please try again.",
          type: "unknown",
          retryable: false,
        });
        return;
      }

      // Empty body check
      if (!response.body) {
        callbacks.onError({
          message: "Cube AI returned an empty response. Please try again.",
          type: "empty",
          retryable: true,
        });
        return;
      }

      callbacks.onPhaseChange("connected");

      // NDJSON streaming loop
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamContent = "";
      let responseChatId: string | null = null;
      let lastFlush = 0;
      let firstDelta = true;
      // Count JSON.parse failures across the NDJSON stream. We intentionally
      // don't surface individual failures to callbacks (spamming would bury
      // real errors), but a summary at stream-end lets telemetry detect when
      // Cube AI starts emitting a different line format or when malformed
      // toolCall payloads arrive consistently.
      let parseFailures = 0;

      // Rolling stall timer — reset on every chunk. If no bytes arrive for
      // STREAM_STALL_MS the stream is considered hung and we abort.
      const resetStall = (): void => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          stallTimedOut = true;
          controller.abort();
        }, STREAM_STALL_MS);
      };
      resetStall();

      while (true) {
        const { done, value } = await reader.read();
        resetStall(); // got bytes (or done) — reset stall window
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep last incomplete line in buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const message = JSON.parse(line);

            // Check for JSON-RPC error (Cube AI returns 200 OK with error body)
            if (message.error?.message) {
              callbacks.onError({
                message: message.error.message,
                type: "server",
                retryable: true,
              });
              return;
            }

            // Phase 5 D-02: surface finalised cubeSqlApi toolCalls to the router hook.
            if (
              message.role === "tool" &&
              message.toolCall?.name === "cubeSqlApi" &&
              message.toolCall?.isInProcess === false
            ) {
              callbacks.onToolCall?.(message.toolCall as CubeSqlApiToolCall);
            }

            // Capture chat ID from state message
            if (message.state?.chatId) {
              responseChatId = message.state.chatId;
            }

            // Accumulate assistant content
            if (message.role === "assistant" && message.content) {
              if (message.isDelta) {
                streamContent += message.content;
                if (firstDelta) {
                  callbacks.onPhaseChange("streaming");
                  firstDelta = false;
                }
              } else if (!message.isInProcess) {
                // Final non-delta message contains the complete response
                streamContent = message.content;
              }
            }
          } catch {
            // Skip unparseable lines (counted for end-of-stream telemetry)
            parseFailures++;
          }
        }

        // Throttled flush (~200ms intervals)
        const now = performance.now();
        if (now - lastFlush >= 200) {
          callbacks.onContent(streamContent);
          lastFlush = now;
        }
      }

      // Process remaining buffer content (Pitfall 3)
      if (buffer.trim()) {
        try {
          const message = JSON.parse(buffer);
          // Mirror the streaming-loop check: a single-line JSON-RPC error with
          // no trailing newline (e.g. "Agent does not have a deployment
          // associated") would otherwise be swallowed and surface as the
          // generic "(No response received)" placeholder.
          if (message.error?.message) {
            callbacks.onError({
              message: message.error.message,
              type: "server",
              retryable: true,
            });
            return;
          }
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
        } catch {
          // Skip unparseable remaining buffer (counted for end-of-stream telemetry)
          parseFailures++;
        }
      }

      // Surface cumulative NDJSON parse failures once per stream. Zero-count
      // streams emit nothing, so the normal happy path stays quiet.
      if (parseFailures > 0) {
        logEvent("cubeai.parse_failures", { count: parseFailures });
      }

      // Always perform final un-throttled flush (Pitfall 4)
      callbacks.onContent(streamContent);
      callbacks.onPhaseChange("complete");
      callbacks.onComplete({ content: streamContent, chatId: responseChatId });
    } catch (err) {
      if (controller.signal.aborted) {
        if (timedOut || stallTimedOut) {
          callbacks.onError({
            message: "Cube AI took too long to respond. Please try again.",
            type: "timeout",
            retryable: true,
          });
        }
        // else: user-initiated stop or component unmount — exit silently
        return;
      }
      callbacks.onError({
        message: "Something went wrong. Please try again.",
        type: "unknown",
        retryable: false,
      });
    } finally {
      clearTimeout(timeout);
      if (stallTimer) clearTimeout(stallTimer);
    }
  })();

  return controller;
}
