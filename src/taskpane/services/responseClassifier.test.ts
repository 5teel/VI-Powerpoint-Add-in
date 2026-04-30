/**
 * Phase 7 Wave 0 RED scaffold for responseClassifier.ts (Wave 1).
 *
 * Mirrors refinementClassifier.test.ts 1:1 with these swaps:
 *   - tool name "route_refinement" → "classify_response"
 *   - schema: 6-class enum {clarify,data,modify,variant,section,refuse}
 *   - fallback default: {class:"data", rationale:"classifier-fallback"}
 *   - telemetry event: "refinement_routed" → "response_classified"
 *
 * INTENTIONAL RED STATE: production module ./responseClassifier does not yet exist.
 * Wave 1 (07-02-PLAN.md Task 1) makes this file GREEN.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  classifyResponse,
  ResponseClassSchema,
  __setAnthropicClientForTesting,
} from "./responseClassifier";
import * as telemetry from "./telemetry";

function makeClientResponse(input: unknown) {
  return {
    content: [{ type: "tool_use", id: "x", name: "classify_response", input }],
  };
}

function makeStubClient(createMock: ReturnType<typeof vi.fn>): Anthropic {
  return { messages: { create: createMock } } as unknown as Anthropic;
}

const BASE_INPUT = {
  assistantText: "...",
  toolCallPresent: true,
  lastSlideTitle: "Sales by State",
  userQuestion: "filter to NSW",
  isFirstTurn: false,
};

describe("classifyResponse (Phase 7 R1, R5, R9)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    logSpy = vi.spyOn(telemetry, "logEvent").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it.each([
    ["clarify", { class: "clarify", rationale: "asks a question" }],
    ["data", { class: "data", rationale: "single fact response" }],
    ["modify", { class: "modify", rationale: "filter on existing slide" }],
    ["variant", { class: "variant", rationale: "chart type swap" }],
    ["section", { class: "section", rationale: "multi-dimension review" }],
    ["refuse", { class: "refuse", rationale: "out of data scope" }],
  ])(
    "R1: class=%s round-trips through Zod parse and is returned verbatim",
    async (_name, payload) => {
      const create = vi.fn().mockResolvedValue(makeClientResponse(payload));
      __setAnthropicClientForTesting(makeStubClient(create));

      const result = await classifyResponse(BASE_INPUT);

      expect(result.class).toBe(payload.class);
      expect(result.rationale).toBe(payload.rationale);
      expect(create).toHaveBeenCalledTimes(1);
    }
  );

  it("R9: SDK throws (network error) → {class:'data', rationale:'classifier-fallback'} + telemetry fallback:true", async () => {
    const create = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    __setAnthropicClientForTesting(makeStubClient(create));

    const result = await classifyResponse({
      assistantText: "x",
      toolCallPresent: false,
      userQuestion: "x",
      isFirstTurn: true,
    });

    expect(result).toEqual({
      class: "data",
      rationale: "classifier-fallback",
    });
    expect(logSpy).toHaveBeenCalledWith(
      "response_classified",
      expect.objectContaining({ class: "data", fallback: true })
    );
  });

  it("R9: missing tool_use block → returns fallback", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "I cannot classify this." }],
    });
    __setAnthropicClientForTesting(makeStubClient(create));

    const result = await classifyResponse(BASE_INPUT);

    expect(result.class).toBe("data");
    expect(result.rationale).toBe("classifier-fallback");
  });

  it("R9: Zod parse fails on unknown class → returns fallback", async () => {
    const create = vi
      .fn()
      .mockResolvedValue(makeClientResponse({ class: "unknown", rationale: "x" }));
    __setAnthropicClientForTesting(makeStubClient(create));

    const result = await classifyResponse(BASE_INPUT);
    expect(result.class).toBe("data");
    expect(result.rationale).toBe("classifier-fallback");
  });

  it("R9: Zod parse fails when rationale > 200 chars → returns fallback", async () => {
    const longRationale = "x".repeat(201);
    const create = vi
      .fn()
      .mockResolvedValue(
        makeClientResponse({ class: "data", rationale: longRationale })
      );
    __setAnthropicClientForTesting(makeStubClient(create));

    const result = await classifyResponse(BASE_INPUT);
    expect(result.rationale).toBe("classifier-fallback");
  });

  it("AbortSignal forwarded to SDK call (Pitfall 4 stage 1)", async () => {
    const createMock = vi
      .fn()
      .mockResolvedValue(
        makeClientResponse({ class: "data", rationale: "ok" })
      );
    __setAnthropicClientForTesting(makeStubClient(createMock));
    const ac = new AbortController();

    await classifyResponse(BASE_INPUT, ac.signal);

    const [, opts] = createMock.mock.calls[0];
    expect(opts.signal).toBe(ac.signal);
  });

  it("forces tool_choice classify_response and model claude-haiku-4-5", async () => {
    const createMock = vi
      .fn()
      .mockResolvedValue(
        makeClientResponse({ class: "data", rationale: "ok" })
      );
    __setAnthropicClientForTesting(makeStubClient(createMock));

    await classifyResponse(BASE_INPUT);

    const [params] = createMock.mock.calls[0];
    expect(params.model).toBe("claude-haiku-4-5");
    expect(params.tool_choice).toEqual({
      type: "tool",
      name: "classify_response",
    });
    expect(params.temperature).toBe(0);
    expect(params.max_tokens).toBe(256);
  });

  it("R5: first-turn modify input (no lastSlideTitle) → returns class with isFirstTurn=true threaded through", async () => {
    const createMock = vi
      .fn()
      .mockResolvedValue(
        makeClientResponse({ class: "modify", rationale: "first-turn modifier" })
      );
    __setAnthropicClientForTesting(makeStubClient(createMock));

    const result = await classifyResponse({
      assistantText: "Here's sales by state with NSW filter applied.",
      toolCallPresent: true,
      lastSlideTitle: undefined,
      userQuestion: "build sales by state but make it pie",
      isFirstTurn: true,
    });

    expect(result.class).toBe("modify");
    // First-turn signal must reach the user message so the prompt can apply D-04 hints.
    const [params] = createMock.mock.calls[0];
    const userContent = params.messages[0].content as string;
    expect(userContent).toMatch(/first turn/i);
  });

  it("ResponseClassSchema: rejects unknown class", () => {
    expect(() =>
      ResponseClassSchema.parse({ class: "other", rationale: "x" })
    ).toThrow();
  });

  it("ResponseClassSchema: accepts all 6 valid classes", () => {
    for (const c of [
      "clarify",
      "data",
      "modify",
      "variant",
      "section",
      "refuse",
    ]) {
      expect(() =>
        ResponseClassSchema.parse({ class: c, rationale: "x" })
      ).not.toThrow();
    }
  });

  it("R7: telemetry response_classified fires with class/rationale/latencyMs on success", async () => {
    const create = vi
      .fn()
      .mockResolvedValue(
        makeClientResponse({ class: "section", rationale: "multi-dim review" })
      );
    __setAnthropicClientForTesting(makeStubClient(create));

    await classifyResponse(BASE_INPUT);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [eventName, payload] = logSpy.mock.calls[0];
    expect(eventName).toBe("response_classified");
    expect(payload).toEqual(
      expect.objectContaining({
        class: "section",
        rationale: "multi-dim review",
        latencyMs: expect.any(Number),
      })
    );
  });

  it("R7: telemetry response_classified fires with fallback:true on error path", async () => {
    const create = vi.fn().mockRejectedValue(new Error("boom"));
    __setAnthropicClientForTesting(makeStubClient(create));

    await classifyResponse(BASE_INPUT);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [eventName, payload] = logSpy.mock.calls[0];
    expect(eventName).toBe("response_classified");
    expect(payload).toEqual(
      expect.objectContaining({
        class: "data",
        fallback: true,
        error: expect.stringContaining("boom"),
      })
    );
  });

  it("user message contains userQuestion + assistantText + toolCallPresent + lastSlideTitle interpolated literally", async () => {
    const createMock = vi
      .fn()
      .mockResolvedValue(
        makeClientResponse({ class: "data", rationale: "ok" })
      );
    __setAnthropicClientForTesting(makeStubClient(createMock));

    await classifyResponse({
      assistantText: "Q3 revenue was $4.2B, up 12% YoY.",
      toolCallPresent: true,
      lastSlideTitle: "Sales by store — Q3",
      userQuestion: "what was Q3 revenue",
      isFirstTurn: false,
    });

    const [params] = createMock.mock.calls[0];
    const userContent = params.messages[0].content as string;
    expect(userContent).toContain("what was Q3 revenue");
    expect(userContent).toContain("Q3 revenue was $4.2B, up 12% YoY.");
    expect(userContent).toContain("true"); // toolCallPresent
    expect(userContent).toContain("Sales by store — Q3");
  });

  it("first-turn input renders lastSlideTitle as '(none — first turn)' when undefined", async () => {
    const createMock = vi
      .fn()
      .mockResolvedValue(
        makeClientResponse({ class: "data", rationale: "ok" })
      );
    __setAnthropicClientForTesting(makeStubClient(createMock));

    await classifyResponse({
      assistantText: "x",
      toolCallPresent: false,
      lastSlideTitle: undefined,
      userQuestion: "y",
      isFirstTurn: true,
    });

    const [params] = createMock.mock.calls[0];
    const userContent = params.messages[0].content as string;
    expect(userContent).toContain("(none — first turn)");
  });
});
