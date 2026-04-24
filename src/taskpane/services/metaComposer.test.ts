import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  planSection,
  SectionPlanSchema,
  SectionStyleSchema,
  __setAnthropicClientForTesting,
  type MetaComposerInput,
  type SectionPlan,
} from "./metaComposer";
import * as telemetry from "./telemetry";

function makeStream(final: unknown, partials: unknown[] = []) {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    on: (name: string, cb: (...args: unknown[]) => void) => {
      handlers[name] = handlers[name] ?? [];
      handlers[name].push(cb);
    },
    finalMessage: async () => {
      for (const snap of partials) {
        (handlers["inputJson"] ?? []).forEach((h) => h("", snap));
      }
      return final;
    },
    _handlers: handlers,
  };
}

function makeToolUseFinal(input: unknown) {
  return {
    content: [{ type: "tool_use", id: "x", name: "plan_section", input }],
  };
}

function validSectionStyle() {
  return {
    palette: ["#0F1330", "#2563EB", "#6B7280", "#F3F4F6", "#E5E7EB"],
    accentColor: "#2563EB",
    typeScale: "standard" as const,
    layoutConventions: {
      preferChartSide: "left" as const,
      commentaryPosition: "right" as const,
    },
  };
}

function validSectionPlan(slideCount: number = 2): SectionPlan {
  const slides = Array.from({ length: slideCount }, (_, i) => ({
    intent: `slide ${i + 1} intent`,
    slideType: "chart" as const,
    titleHint: `Title ${i + 1}`,
  }));
  return {
    sectionTitle: "Quarterly review",
    slides,
    sectionStyle: validSectionStyle(),
  };
}

function validInput(): MetaComposerInput {
  return {
    userQuestion: "Quarterly review",
    cubeMeta: {
      queryTitle: "Sales by store Q3",
      description: "Q3 sales aggregated by store",
      commentary: "NSW leads with 33%",
      chartCategory: "bar",
    },
  };
}

describe("planSection (D-05)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    logSpy = vi.spyOn(telemetry, "logEvent").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("D-05: successful stream → onPartialPlan fires with snapshots, onFinal fires with validated plan", async () => {
    const plan = validSectionPlan(2);
    const streamMock = vi
      .fn()
      .mockReturnValue(
        makeStream(makeToolUseFinal(plan), [
          { sectionTitle: "Q" },
          { sectionTitle: "Quarterly review" },
        ])
      );
    __setAnthropicClientForTesting({
      messages: { stream: streamMock },
    } as unknown as Anthropic);

    const onPartialPlan = vi.fn();
    const onFinal = vi.fn();
    const onError = vi.fn();

    await planSection(validInput(), { onPartialPlan, onFinal, onError });

    expect(onPartialPlan).toHaveBeenCalledTimes(2);
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onFinal.mock.calls[0][0].sectionTitle).toBe("Quarterly review");
    expect(onFinal.mock.calls[0][0].slides.length).toBe(2);
  });

  it("D-06: SectionPlanSchema rejects slides.length === 0", () => {
    expect(() =>
      SectionPlanSchema.parse({
        sectionTitle: "x",
        slides: [],
        sectionStyle: validSectionStyle(),
      })
    ).toThrow();
  });

  it("D-06: SectionPlanSchema rejects slides.length === 7", () => {
    const plan = {
      sectionTitle: "x",
      slides: Array.from({ length: 7 }, (_, i) => ({
        intent: `i${i}`,
        slideType: "chart",
        titleHint: `T${i}`,
      })),
      sectionStyle: validSectionStyle(),
    };
    expect(() => SectionPlanSchema.parse(plan)).toThrow();
  });

  it("D-06: SectionPlanSchema accepts 1 slide (boundary)", () => {
    const plan = {
      sectionTitle: "x",
      slides: [{ intent: "i", slideType: "title", titleHint: "T" }],
      sectionStyle: validSectionStyle(),
    };
    expect(() => SectionPlanSchema.parse(plan)).not.toThrow();
  });

  it("D-06: SectionPlanSchema accepts 6 slides (boundary)", () => {
    const plan = {
      sectionTitle: "x",
      slides: Array.from({ length: 6 }, (_, i) => ({
        intent: `i${i}`,
        slideType: "chart",
        titleHint: `T${i}`,
      })),
      sectionStyle: validSectionStyle(),
    };
    expect(() => SectionPlanSchema.parse(plan)).not.toThrow();
  });

  it("D-08: SectionStyleSchema requires palette.length === 5", () => {
    const four = { ...validSectionStyle(), palette: ["#000000", "#111111", "#222222", "#333333"] };
    const six = {
      ...validSectionStyle(),
      palette: ["#000000", "#111111", "#222222", "#333333", "#444444", "#555555"],
    };
    expect(() => SectionStyleSchema.parse(four)).toThrow();
    expect(() => SectionStyleSchema.parse(six)).toThrow();
  });

  it("D-08: SectionStyleSchema typeScale rejects 'huge'", () => {
    const style = { ...validSectionStyle(), typeScale: "huge" };
    expect(() => SectionStyleSchema.parse(style)).toThrow();
  });

  it("D-08: SectionStyleSchema palette must be hex colors", () => {
    const style = {
      ...validSectionStyle(),
      palette: ["not-hex", "#2563EB", "#6B7280", "#F3F4F6", "#E5E7EB"],
    };
    expect(() => SectionStyleSchema.parse(style)).toThrow();
  });

  it("D-05: stream 'error' fires → cb.onError called once, cb.onFinal NEVER called", async () => {
    const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
    const stubStream = {
      on: (name: string, cb: (...args: unknown[]) => void) => {
        handlers[name] = handlers[name] ?? [];
        handlers[name].push(cb);
      },
      finalMessage: async () => {
        // Simulate stream error fired BEFORE finalMessage resolves — then reject.
        const err = new Error("stream error");
        (handlers["error"] ?? []).forEach((h) => h(err));
        throw err;
      },
    };
    __setAnthropicClientForTesting({
      messages: { stream: vi.fn().mockReturnValue(stubStream) },
    } as unknown as Anthropic);

    const onError = vi.fn();
    const onFinal = vi.fn();
    await planSection(validInput(), { onPartialPlan: vi.fn(), onFinal, onError });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("D-05: no tool_use block in finalMessage → cb.onError fires", async () => {
    const streamMock = vi
      .fn()
      .mockReturnValue(makeStream({ content: [{ type: "text", text: "no plan" }] }));
    __setAnthropicClientForTesting({
      messages: { stream: streamMock },
    } as unknown as Anthropic);

    const onError = vi.fn();
    const onFinal = vi.fn();
    await planSection(validInput(), { onPartialPlan: vi.fn(), onFinal, onError });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("D-05: AbortSignal passed to messages.stream as { signal }", async () => {
    const plan = validSectionPlan();
    const streamMock = vi.fn().mockReturnValue(makeStream(makeToolUseFinal(plan)));
    __setAnthropicClientForTesting({
      messages: { stream: streamMock },
    } as unknown as Anthropic);

    const ac = new AbortController();
    await planSection(
      { ...validInput(), signal: ac.signal },
      { onPartialPlan: vi.fn(), onFinal: vi.fn(), onError: vi.fn() }
    );

    const [, opts] = streamMock.mock.calls[0];
    expect(opts.signal).toBe(ac.signal);
  });

  it("D-05: system prompt has ephemeral cache_control, max_tokens 2048, temperature 0.3-0.5", async () => {
    const plan = validSectionPlan();
    const streamMock = vi.fn().mockReturnValue(makeStream(makeToolUseFinal(plan)));
    __setAnthropicClientForTesting({
      messages: { stream: streamMock },
    } as unknown as Anthropic);

    await planSection(validInput(), {
      onPartialPlan: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
    });

    const [params] = streamMock.mock.calls[0];
    expect(params.max_tokens).toBe(2048);
    expect(params.temperature).toBeGreaterThanOrEqual(0.3);
    expect(params.temperature).toBeLessThanOrEqual(0.5);
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("D-05: forced tool_choice { type: 'tool', name: 'plan_section' }", async () => {
    const plan = validSectionPlan();
    const streamMock = vi.fn().mockReturnValue(makeStream(makeToolUseFinal(plan)));
    __setAnthropicClientForTesting({
      messages: { stream: streamMock },
    } as unknown as Anthropic);

    await planSection(validInput(), {
      onPartialPlan: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
    });

    const [params] = streamMock.mock.calls[0];
    expect(params.tool_choice).toEqual({ type: "tool", name: "plan_section" });
    expect(params.tools[0].name).toBe("plan_section");
  });

  it("D-05: double-settle guard — stream error AND try/catch for same err → onError once", async () => {
    const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
    const err = new Error("double");
    const stubStream = {
      on: (name: string, cb: (...args: unknown[]) => void) => {
        handlers[name] = handlers[name] ?? [];
        handlers[name].push(cb);
      },
      finalMessage: async () => {
        (handlers["error"] ?? []).forEach((h) => h(err));
        throw err; // try/catch path also sees the same err
      },
    };
    __setAnthropicClientForTesting({
      messages: { stream: vi.fn().mockReturnValue(stubStream) },
    } as unknown as Anthropic);

    const onError = vi.fn();
    await planSection(validInput(), {
      onPartialPlan: vi.fn(),
      onFinal: vi.fn(),
      onError,
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("D-05: telemetry 'meta_composer_completed' fires with {slideCount, elapsedMs} on success", async () => {
    const plan = validSectionPlan(3);
    const streamMock = vi.fn().mockReturnValue(makeStream(makeToolUseFinal(plan)));
    __setAnthropicClientForTesting({
      messages: { stream: streamMock },
    } as unknown as Anthropic);

    await planSection(validInput(), {
      onPartialPlan: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
    });

    expect(logSpy).toHaveBeenCalledWith(
      "meta_composer_completed",
      expect.objectContaining({
        slideCount: 3,
        elapsedMs: expect.any(Number),
      })
    );
  });
});

describe("META_COMPOSER_SYSTEM_PROMPT_V1 (cache activation)", () => {
  it("is at least 2048 characters (Sonnet cache threshold)", async () => {
    const mod = await import("../prompts/metaComposerSystem");
    expect(mod.META_COMPOSER_SYSTEM_PROMPT_V1.length).toBeGreaterThanOrEqual(2048);
  });

  it("contains DO NOT TEMPLATE banner", async () => {
    const fs = await import("fs");
    const contents = fs.readFileSync(
      "src/taskpane/prompts/metaComposerSystem.ts",
      "utf8"
    );
    expect(contents).toMatch(/DO NOT TEMPLATE/);
  });
});
