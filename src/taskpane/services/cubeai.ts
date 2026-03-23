// Cube AI streaming API client adapted for browser context.
// Pattern source: C:\Development\Summit MCP Server - Claude\src\cubeai.ts

import { CUBEAI_CONFIG } from "../config";

export interface CubeAITestResult {
  success: boolean;
  responseTimeMs: number;
  content?: string; // First 500 chars of response content
  chatId?: string | null;
  error?: string;
  errorType?: "cors" | "auth" | "network" | "server" | "unknown";
}

/**
 * Test connectivity to the Cube AI Chat API.
 * Makes a real streaming request, parses NDJSON, and reports the result.
 * Used by the ChatPanel to validate CORS and auth before investing in UI work.
 */
export async function testCubeAIConnection(question: string): Promise<CubeAITestResult> {
  const startTime = performance.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CUBEAI_CONFIG.timeoutMs);

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
          },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      const elapsed = Math.round(performance.now() - startTime);
      // TypeError: Failed to fetch is the hallmark of CORS failure
      const errorMsg = String(err);
      if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
        return {
          success: false,
          responseTimeMs: elapsed,
          error:
            "Connection failed: The Cube AI server blocked this request. A proxy server is needed. See decision D-06 in CONTEXT.md.",
          errorType: "cors",
        };
      }
      if (errorMsg.includes("AbortError") || errorMsg.includes("aborted")) {
        return {
          success: false,
          responseTimeMs: elapsed,
          error: `Request timed out after ${CUBEAI_CONFIG.timeoutMs / 1000}s. The Cube AI server did not respond.`,
          errorType: "network",
        };
      }
      return {
        success: false,
        responseTimeMs: elapsed,
        error: `Connection failed: Could not reach the Cube AI server. Check your network connection and try again. (${errorMsg})`,
        errorType: "network",
      };
    }

    if (!response.ok) {
      clearTimeout(timeout);
      const elapsed = Math.round(performance.now() - startTime);
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          responseTimeMs: elapsed,
          error: "Authentication failed: The API key was rejected. Verify the key in your configuration.",
          errorType: "auth",
        };
      }
      return {
        success: false,
        responseTimeMs: elapsed,
        error: `Cube AI returned HTTP ${response.status}: ${await response.text().catch(() => "no body")}`,
        errorType: response.status >= 500 ? "server" : "unknown",
      };
    }

    // Parse NDJSON streaming response (adapted from MCP server pattern)
    if (!response.body) {
      clearTimeout(timeout);
      return {
        success: false,
        responseTimeMs: Math.round(performance.now() - startTime),
        error: "Cube AI returned no response body.",
        errorType: "unknown",
      };
    }

    let chatId: string | null = null;
    let streamContent = "";
    let buffer = "";

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

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
            chatId = message.state.chatId;
          }

          // Accumulate assistant content
          if (message.role === "assistant" && message.content) {
            if (message.isDelta) {
              streamContent += message.content;
            } else if (!message.isInProcess) {
              // Final non-delta message contains the complete response
              streamContent = message.content;
            }
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const message = JSON.parse(buffer);
        if (message.role === "assistant" && message.content && !message.isInProcess) {
          streamContent = message.content;
        }
      } catch {
        // Skip
      }
    }

    clearTimeout(timeout);
    const elapsed = Math.round(performance.now() - startTime);

    return {
      success: true,
      responseTimeMs: elapsed,
      content: streamContent.substring(0, 500),
      chatId,
    };
  } catch (err) {
    return {
      success: false,
      responseTimeMs: Math.round(performance.now() - startTime),
      error: `Something went wrong: ${String(err)}. Try again or check the browser console for details.`,
      errorType: "unknown",
    };
  }
}
