// Cube AI streaming API client with callback-based delivery.
// Refactored from testCubeAIConnection() into production streaming client.
// Pattern source: C:\Development\Summit MCP Server - Claude\src\cubeai.ts

import { CUBEAI_CONFIG } from "../config";

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

export interface StreamCallbacks {
  onPhaseChange: (phase: StreamPhase) => void;
  onContent: (accumulatedContent: string) => void;
  onComplete: (result: CubeAIStreamResult) => void;
  onError: (error: CubeAIError) => void;
}

/**
 * Stream a question to Cube AI and deliver progressive content via callbacks.
 *
 * Returns an AbortController so the caller can cancel the request (e.g., on unmount).
 * The async work runs inside an IIFE so this function returns synchronously.
 */
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
              externalId: CUBEAI_CONFIG.externalId,
              ...(chatId ? { chatId } : {}),
            },
          }),
          signal: controller.signal,
        });
      } catch (err) {
        // Do not report errors if the caller intentionally aborted
        if (controller.signal.aborted) return;

        const errorMsg = String(err);
        console.error("Cube AI error:", err);

        if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
          callbacks.onError({
            message: "Unable to reach Cube AI. Please check your connection and try again.",
            type: "cors",
            retryable: false,
          });
          return;
        }
        if (errorMsg.includes("AbortError") || errorMsg.includes("aborted")) {
          callbacks.onError({
            message: "The request timed out. Cube AI may be busy -- please try again.",
            type: "timeout",
            retryable: true,
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
        console.error("Cube AI HTTP error:", response.status);

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep last incomplete line in buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const message = JSON.parse(line);

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
            // Skip unparseable lines
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
          // Skip unparseable remaining buffer
        }
      }

      // Always perform final un-throttled flush (Pitfall 4)
      callbacks.onContent(streamContent);
      callbacks.onPhaseChange("complete");
      callbacks.onComplete({ content: streamContent, chatId: responseChatId });
    } catch (err) {
      // Do not report errors if the caller intentionally aborted
      if (controller.signal.aborted) return;

      console.error("Cube AI error:", err);
      callbacks.onError({
        message: "Something went wrong. Please try again.",
        type: "unknown",
        retryable: false,
      });
    } finally {
      clearTimeout(timeout);
    }
  })();

  return controller;
}
