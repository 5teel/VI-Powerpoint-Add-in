import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  classifyRefinement,
  RoutingSchema,
  __setAnthropicClientForTesting,
} from "./refinementClassifier";
import * as telemetry from "./telemetry";

function makeClientResponse(input: unknown) {
  return {
    content: [{ type: "tool_use", id: "x", name: "route_refinement", input }],
  };
}

function makeStubClient(createMock: ReturnType<typeof vi.fn>): Anthropic {
  return { messages: { create: createMock } } as unknown as Anthropic;
}

describe("classifyRefinement (D-03)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    logSpy = vi.spyOn(telemetry, "logEvent").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("D-03: valid 'composer-only' tool_use response → returns {path, rationale}", async () => {
    const createMock = vi.fn().mockResolvedValue(
      makeClientResponse({ path: "composer-only", rationale: "chart type swap" })
    );
    __setAnthropicClientForTesting(makeStubClient(createMock));

    const result = await classifyRefinement("change to pie chart", "Sales by state");

    expect(result).toEqual({
      path: "composer-only",
      rationale: "chart type swap",
    });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("D-03: valid 'cube-ai+composer' response → returns {path, rationale}", async () => {
    const createMock = vi.fn().mockResolvedValue(
      makeClientResponse({
        path: "cube-ai+composer",
        rationale: "new time range requested",
      })
    );
    __setAnthropicClientForTesting(makeStubClient(createMock));

    const result = await classifyRefinement("add Q3 numbers", "Sales by state");

    expect(result.path).toBe("cube-ai+composer");
    expect(result.rationale).toBe("new time range requested");
  });

  it("D-03: SDK throws (network error) → returns fallback rationale", async () => {
    const createMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    __setAnthropicClientForTesting(makeStubClient(createMock));

    const result = await classifyRefinement("anything", "Prior slide");

    expect(result).toEqual({
      path: "cube-ai+composer",
      rationale: "classifier-fallback",
    });
  });

  it("D-03: missing tool_use block → returns fallback", async () => {
    const createMock = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "I cannot classify this." }],
    });
    __setAnthropicClientForTesting(makeStubClient(createMock));

    const result = await classifyRefinement("make it shiny", "A slide");

    expect(result.path).toBe("cube-ai+composer");
    expect(result.rationale).toBe("classifier-fallback");
  });

  it("D-03: Zod parse fails on unknown path → returns fallback", async () => {
    const createMock = vi.fn().mockResolvedValue(
      makeClientResponse({ path: "unknown-route", rationale: "ok" })
    );
    __setAnthropicClientForTesting(makeStubClient(createMock));

    const result = await classifyRefinement("x", "y");
    expect(result.path).toBe("cube-ai+composer");
    expect(result.rationale).toBe("classifier-fallback");
  });

  it("D-03: Zod parse fails when rationale > 200 chars → returns fallback", async () => {
    const longRationale = "x".repeat(201);
    const createMock = vi.fn().mockResolvedValue(
      makeClientResponse({ path: "composer-only", rationale: longRationale })
    );
    __setAnthropicClientForTesting(makeStubClient(createMock));

    const result = await classifyRefinement("x", "y");
    expect(result.rationale).toBe("classifier-fallback");
  });

  it("D-03: AbortSignal forwarded to SDK call", async () => {
    const createMock = vi.fn().mockResolvedValue(
      makeClientResponse({ path: "composer-only", rationale: "ok" })
    );
    __setAnthropicClientForTesting(makeStubClient(createMock));
    const ac = new AbortController();

    await classifyRefinement("x", "y", ac.signal);

    const [, opts] = createMock.mock.calls[0];
    expect(opts.signal).toBe(ac.signal);
  });

  it("D-03: prior slide title interpolated into user message", async () => {
    const createMock = vi.fn().mockResolvedValue(
      makeClientResponse({ path: "composer-only", rationale: "ok" })
    );
    __setAnthropicClientForTesting(makeStubClient(createMock));

    await classifyRefinement(
      "change to pie chart",
      "Sales by store — Q3"
    );

    const [params] = createMock.mock.calls[0];
    const userContent = params.messages[0].content as string;
    expect(userContent).toContain("Sales by store — Q3");
    expect(userContent).toContain("change to pie chart");
  });

  it("D-03: telemetry 'refinement_routed' fires with path/rationale/latencyMs on success", async () => {
    const createMock = vi.fn().mockResolvedValue(
      makeClientResponse({ path: "composer-only", rationale: "chart swap" })
    );
    __setAnthropicClientForTesting(makeStubClient(createMock));

    await classifyRefinement("change to bar", "Any slide");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [eventName, payload] = logSpy.mock.calls[0];
    expect(eventName).toBe("refinement_routed");
    expect(payload).toEqual(
      expect.objectContaining({
        path: "composer-only",
        rationale: "chart swap",
        latencyMs: expect.any(Number),
      })
    );
  });

  it("D-03: telemetry 'refinement_routed' fires with fallback:true on error path", async () => {
    const createMock = vi.fn().mockRejectedValue(new Error("boom"));
    __setAnthropicClientForTesting(makeStubClient(createMock));

    await classifyRefinement("x", "y");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [eventName, payload] = logSpy.mock.calls[0];
    expect(eventName).toBe("refinement_routed");
    expect(payload).toEqual(
      expect.objectContaining({
        path: "cube-ai+composer",
        fallback: true,
        error: expect.stringContaining("boom"),
      })
    );
  });

  it("D-03: forces tool_choice route_refinement and model claude-haiku-4-5", async () => {
    const createMock = vi.fn().mockResolvedValue(
      makeClientResponse({ path: "composer-only", rationale: "ok" })
    );
    __setAnthropicClientForTesting(makeStubClient(createMock));

    await classifyRefinement("x", "y");

    const [params] = createMock.mock.calls[0];
    expect(params.model).toBe("claude-haiku-4-5");
    expect(params.tool_choice).toEqual({ type: "tool", name: "route_refinement" });
    expect(params.temperature).toBe(0);
    expect(params.max_tokens).toBe(256);
  });

  it("RoutingSchema: rejects unknown path", () => {
    expect(() =>
      RoutingSchema.parse({ path: "other", rationale: "x" })
    ).toThrow();
  });

  it("RoutingSchema: accepts both valid paths", () => {
    expect(() =>
      RoutingSchema.parse({ path: "composer-only", rationale: "x" })
    ).not.toThrow();
    expect(() =>
      RoutingSchema.parse({ path: "cube-ai+composer", rationale: "y" })
    ).not.toThrow();
  });
});
