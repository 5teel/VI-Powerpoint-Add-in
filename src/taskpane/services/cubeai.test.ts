import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamCubeAI, StreamCallbacks, StreamPhase, CubeAIStreamResult, CubeAIError } from "./cubeai";
import { CUBEAI_CONFIG } from "../config";

// Helper: create a mock ReadableStream from string chunks
function createMockStream(chunks: string[]): {
  body: ReadableStream<Uint8Array>;
  ok: boolean;
  status: number;
  headers: Headers;
} {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
  return { body: stream, ok: true, status: 200, headers: new Headers() };
}

// Helper: create mock callbacks
function createMockCallbacks(): StreamCallbacks {
  return {
    onPhaseChange: vi.fn(),
    onContent: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
  };
}

// Helper: wait for stream to complete (onComplete or onError called)
function waitForStream(callbacks: StreamCallbacks, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Stream timed out")), timeoutMs);
    const checkInterval = setInterval(() => {
      const completeFn = callbacks.onComplete as ReturnType<typeof vi.fn>;
      const errorFn = callbacks.onError as ReturnType<typeof vi.fn>;
      if (completeFn.mock.calls.length > 0 || errorFn.mock.calls.length > 0) {
        clearTimeout(timer);
        clearInterval(checkInterval);
        resolve();
      }
    }, 10);
  });
}

describe("streamCubeAI", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("sends correct auth headers and request body format", async () => {
    let capturedRequest: { url: string; init: RequestInit } | null = null;

    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      capturedRequest = { url: url as string, init: init! };
      return createMockStream([
        '{"role":"assistant","content":"hello","isDelta":false,"isInProcess":false}\n',
      ]);
    });

    const callbacks = createMockCallbacks();
    streamCubeAI("test question", null, callbacks);
    await waitForStream(callbacks);

    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.init.method).toBe("POST");
    expect(capturedRequest!.url).toBe(CUBEAI_CONFIG.baseUrl);
    expect((capturedRequest!.init.headers as Record<string, string>)["Authorization"]).toBe(
      `Api-Key ${CUBEAI_CONFIG.apiKey}`
    );
    expect((capturedRequest!.init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );

    const body = JSON.parse(capturedRequest!.init.body as string);
    expect(body.input).toBe("test question");
    if (CUBEAI_CONFIG.internalId) {
      expect(body.sessionSettings.internalId).toBe(CUBEAI_CONFIG.internalId);
    } else {
      expect(body.sessionSettings.externalId).toBe(CUBEAI_CONFIG.externalId);
    }
    expect(body.sessionSettings.chatId).toBeUndefined();
  });

  it("includes chatId in request body when provided", async () => {
    let capturedBody: string = "";

    vi.stubGlobal("fetch", async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return createMockStream([
        '{"role":"assistant","content":"ok","isDelta":false,"isInProcess":false}\n',
      ]);
    });

    const callbacks = createMockCallbacks();
    streamCubeAI("question", "abc123", callbacks);
    await waitForStream(callbacks);

    const body = JSON.parse(capturedBody);
    expect(body.sessionSettings.chatId).toBe("abc123");
  });

  it("handles NDJSON split across chunk boundaries", async () => {
    // Split a JSON line across two chunks at an awkward boundary
    const fullLine = '{"role":"assistant","content":"hello","isDelta":true,"isInProcess":true}\n';
    const splitAt = Math.floor(fullLine.length / 2);
    const chunk1 = fullLine.substring(0, splitAt);
    const chunk2 = fullLine.substring(splitAt);
    const finalLine = '{"role":"assistant","content":"hello world","isDelta":false,"isInProcess":false}\n';

    vi.stubGlobal("fetch", async () => {
      return createMockStream([chunk1, chunk2, finalLine]);
    });

    const callbacks = createMockCallbacks();
    streamCubeAI("test", null, callbacks);
    await waitForStream(callbacks);

    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    const result: CubeAIStreamResult = (callbacks.onComplete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(result.content).toBe("hello world");
  });

  it("fires phase transitions in correct order", async () => {
    vi.stubGlobal("fetch", async () => {
      return createMockStream([
        '{"role":"assistant","content":"hi","isDelta":true,"isInProcess":true}\n',
        '{"role":"assistant","content":"hi there","isDelta":false,"isInProcess":false}\n',
      ]);
    });

    const phases: StreamPhase[] = [];
    const callbacks = createMockCallbacks();
    (callbacks.onPhaseChange as ReturnType<typeof vi.fn>).mockImplementation((phase: StreamPhase) => {
      phases.push(phase);
    });

    streamCubeAI("test", null, callbacks);
    await waitForStream(callbacks);

    expect(phases).toEqual(["connecting", "connected", "streaming", "complete"]);
  });

  it("extracts chatId from state messages", async () => {
    vi.stubGlobal("fetch", async () => {
      return createMockStream([
        '{"state":{"chatId":"chat-xyz"}}\n',
        '{"role":"assistant","content":"response","isDelta":false,"isInProcess":false}\n',
      ]);
    });

    const callbacks = createMockCallbacks();
    streamCubeAI("test", null, callbacks);
    await waitForStream(callbacks);

    const result: CubeAIStreamResult = (callbacks.onComplete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(result.chatId).toBe("chat-xyz");
  });

  it("final non-delta message replaces accumulated delta content", async () => {
    vi.stubGlobal("fetch", async () => {
      return createMockStream([
        '{"role":"assistant","content":"part1","isDelta":true,"isInProcess":true}\n',
        '{"role":"assistant","content":"part2","isDelta":true,"isInProcess":true}\n',
        '{"role":"assistant","content":"complete response","isDelta":false,"isInProcess":false}\n',
      ]);
    });

    const callbacks = createMockCallbacks();
    streamCubeAI("test", null, callbacks);
    await waitForStream(callbacks);

    const result: CubeAIStreamResult = (callbacks.onComplete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(result.content).toBe("complete response");
  });

  it("classifies CORS/network error (TypeError Failed to fetch)", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });

    const callbacks = createMockCallbacks();
    streamCubeAI("test", null, callbacks);
    await waitForStream(callbacks);

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    const error: CubeAIError = (callbacks.onError as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(error.type).toBe("cors");
    expect(error.retryable).toBe(false);
  });

  it("classifies auth error (401)", async () => {
    vi.stubGlobal("fetch", async () => {
      return { ok: false, status: 401, headers: new Headers(), text: async () => "Unauthorized" };
    });

    const callbacks = createMockCallbacks();
    streamCubeAI("test", null, callbacks);
    await waitForStream(callbacks);

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    const error: CubeAIError = (callbacks.onError as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(error.type).toBe("auth");
    expect(error.retryable).toBe(false);
  });

  it("classifies server error (500) as retryable", async () => {
    vi.stubGlobal("fetch", async () => {
      return { ok: false, status: 500, headers: new Headers(), text: async () => "Internal Server Error" };
    });

    const callbacks = createMockCallbacks();
    streamCubeAI("test", null, callbacks);
    await waitForStream(callbacks);

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    const error: CubeAIError = (callbacks.onError as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(error.type).toBe("server");
    expect(error.retryable).toBe(true);
  });

  it("classifies rate limit error (429) as retryable server error", async () => {
    vi.stubGlobal("fetch", async () => {
      return { ok: false, status: 429, headers: new Headers(), text: async () => "Too Many Requests" };
    });

    const callbacks = createMockCallbacks();
    streamCubeAI("test", null, callbacks);
    await waitForStream(callbacks);

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    const error: CubeAIError = (callbacks.onError as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(error.type).toBe("server");
    expect(error.retryable).toBe(true);
  });

  it("classifies empty response body as empty error", async () => {
    vi.stubGlobal("fetch", async () => {
      return { ok: true, status: 200, body: null, headers: new Headers() };
    });

    const callbacks = createMockCallbacks();
    streamCubeAI("test", null, callbacks);
    await waitForStream(callbacks);

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    const error: CubeAIError = (callbacks.onError as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(error.type).toBe("empty");
  });
});
