import { describe, it, expect, vi, beforeEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  composeSlide,
  __setAnthropicClientForTesting,
  type ComposerInput,
} from "./composer";

function makeStream(final: unknown, partials: unknown[] = []) {
  const handlers: Record<string, Array<(...args: any[]) => void>> = {};
  return {
    on: (name: string, cb: (...args: any[]) => void) => {
      handlers[name] = handlers[name] ?? [];
      handlers[name].push(cb);
    },
    finalMessage: async () => {
      // Emit partials first, then final
      for (const snap of partials) {
        (handlers["inputJson"] ?? []).forEach((h) => h("", snap));
      }
      return final;
    },
  };
}

function makeToolUseFinal(input: unknown) {
  return {
    content: [
      { type: "tool_use", id: "x", name: "compose_slide", input },
    ],
  };
}

function validInput(): ComposerInput {
  return {
    userQuestion: "Which states lead?",
    cubeMeta: { queryTitle: "t", description: "d", commentary: "c" },
    rows: [{ state: "NSW", sales: 1 }],
    canvas: { widthPx: 960, heightPx: 540 },
  };
}

function validPlan() {
  return {
    layout: "chart-only",
    regions: [{ id: "r1", kind: "chart", x: 0, y: 0, w: 1, h: 1 }],
    title: "NSW leads",
    commentary: "NSW is ahead.",
    chartSpec: { mark: "bar" },
  };
}

describe("composeSlide", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("passes model, max_tokens=4096, temperature=0.4, forced tool_choice, and signal to messages.stream", async () => {
    const streamMock = vi.fn().mockReturnValue(makeStream(makeToolUseFinal(validPlan())));
    const clientStub = { messages: { stream: streamMock } } as unknown as Anthropic;
    __setAnthropicClientForTesting(clientStub);

    const ac = new AbortController();
    await composeSlide({ ...validInput(), signal: ac.signal }, {
      onPartialPlan: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
    });

    const [params, opts] = streamMock.mock.calls[0];
    expect(params.model).toBe("claude-sonnet-4-6");
    expect(params.max_tokens).toBe(4096);
    expect(params.temperature).toBe(0.4);
    expect(params.tool_choice).toEqual({ type: "tool", name: "compose_slide" });
    expect(params.tools[0].name).toBe("compose_slide");
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.system[1].text).toMatch(/Canvas: 960x540px/);
    expect(opts.signal).toBe(ac.signal);
  });

  it("CMPS-01: invokes onFinal with Zod-parsed plan", async () => {
    const streamMock = vi.fn().mockReturnValue(makeStream(makeToolUseFinal(validPlan())));
    __setAnthropicClientForTesting({ messages: { stream: streamMock } } as unknown as Anthropic);
    const onFinal = vi.fn();
    await composeSlide(validInput(), { onPartialPlan: vi.fn(), onFinal, onError: vi.fn() });
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal.mock.calls[0][0].title).toBe("NSW leads");
  });

  it("fires onPartialPlan for each inputJson snapshot", async () => {
    const streamMock = vi
      .fn()
      .mockReturnValue(makeStream(makeToolUseFinal(validPlan()), [{ title: "N" }, { title: "NSW" }]));
    __setAnthropicClientForTesting({ messages: { stream: streamMock } } as unknown as Anthropic);
    const onPartialPlan = vi.fn();
    await composeSlide(validInput(), { onPartialPlan, onFinal: vi.fn(), onError: vi.fn() });
    expect(onPartialPlan).toHaveBeenCalledTimes(2);
    expect(onPartialPlan.mock.calls[1][0]).toEqual({ title: "NSW" });
  });

  it("CMPS-01: invokes onError when the response contains no tool_use block", async () => {
    const streamMock = vi.fn().mockReturnValue(makeStream({ content: [{ type: "text", text: "nope" }] }));
    __setAnthropicClientForTesting({ messages: { stream: streamMock } } as unknown as Anthropic);
    const onError = vi.fn();
    const onFinal = vi.fn();
    await composeSlide(validInput(), { onPartialPlan: vi.fn(), onFinal, onError });
    expect(onError).toHaveBeenCalled();
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("CMPS-01: invokes onError when Zod.parse fails on tool_use input", async () => {
    const streamMock = vi.fn().mockReturnValue(makeStream(makeToolUseFinal({ not: "a valid plan" })));
    __setAnthropicClientForTesting({ messages: { stream: streamMock } } as unknown as Anthropic);
    const onError = vi.fn();
    await composeSlide(validInput(), { onPartialPlan: vi.fn(), onFinal: vi.fn(), onError });
    expect(onError).toHaveBeenCalled();
  });
});
