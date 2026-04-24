/**
 * Phase 6 D-05 meta-composer — Sonnet 4.6 forced-tool streaming section planner.
 *
 * SECURITY: dangerouslyAllowBrowser:true — same internal-sideload-only trade-off
 * as composer.ts (Phase 5 D-04). DO NOT SHIP TO APPSOURCE — dangerouslyAllowBrowser
 * exposes ANTHROPIC_API_KEY in the client bundle.
 *
 * Mirrors composer.ts architecture byte-for-byte except: SectionPlanSchema in
 * place of CompositionPlanSchema, 'plan_section' tool name, and the ≥2048-char
 * system prompt from metaComposerSystem.ts is cache-controlled.
 *
 * The orchestrator (sectionOrchestrator.ts, wave 3) consumes onPartialPlan
 * snapshots to mount slides[0] SlidePreview as soon as partial.slides?.[0]
 * arrives — shaving the 3-5s time-to-first-preview.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } from "../config";
import { META_COMPOSER_SYSTEM_PROMPT_V1 } from "../prompts/metaComposerSystem";
import { logEvent } from "./telemetry";

// D-08 SectionStyle: shared visual anchors for every slide in the section.
export const SectionStyleSchema = z
  .object({
    palette: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).length(5),
    accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    typeScale: z.enum(["compact", "standard", "generous"]),
    layoutConventions: z
      .object({
        preferChartSide: z.enum(["left", "right"]),
        commentaryPosition: z.enum(["right", "below"]),
      })
      .strict(),
  })
  .strict();
export type SectionStyle = z.infer<typeof SectionStyleSchema>;

// D-05 / D-06: 1-6 slides, each with an intent + slideType + optional dataSubset + titleHint.
const SectionSlideSchema = z
  .object({
    intent: z.string().min(1).max(120),
    slideType: z.enum(["title", "chart", "table", "summary", "comparison"]),
    dataSubset: z.string().max(200).optional(),
    titleHint: z.string().min(1).max(80),
  })
  .strict();

export const SectionPlanSchema = z
  .object({
    sectionTitle: z.string().min(1).max(80),
    slides: z.array(SectionSlideSchema).min(1).max(6),
    sectionStyle: SectionStyleSchema,
  })
  .strict();
export type SectionPlan = z.infer<typeof SectionPlanSchema>;

export interface MetaComposerInput {
  userQuestion: string;
  cubeMeta: {
    queryTitle: string;
    description: string;
    commentary: string;
    chartCategory?: string;
  };
  signal?: AbortSignal;
}

export interface MetaComposerCallbacks {
  onPartialPlan: (partial: Partial<SectionPlan>) => void;
  onFinal: (plan: SectionPlan) => void;
  onError: (err: Error) => void;
}

// Singleton client at module load — same fail-fast posture as composer.ts.
let client: Anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

/** Test-only override — allows unit tests to inject a stubbed client. */
export function __setAnthropicClientForTesting(stub: Anthropic): void {
  client = stub;
}

const PLAN_TOOL_SCHEMA = zodToJsonSchema(SectionPlanSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

const PLAN_TOOL: Tool = {
  name: "plan_section",
  description:
    "Emit the multi-slide section plan. Call EXACTLY ONCE. " +
    "Slides array MUST be length 1-6 (hard cap). Every slide receives sectionStyle as locked context.",
  input_schema: PLAN_TOOL_SCHEMA as Tool["input_schema"],
};

export async function planSection(
  input: MetaComposerInput,
  cb: MetaComposerCallbacks
): Promise<void> {
  const start = performance.now();
  // Guard against double error dispatch: stream.on("error") + try/catch around
  // await stream.finalMessage() can both fire for the same underlying failure.
  let errorReported = false;
  const reportError = (err: Error): void => {
    if (errorReported) return;
    errorReported = true;
    cb.onError(err);
  };

  try {
    const stream = client.messages.stream(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        temperature: 0.4,
        system: [
          {
            type: "text",
            text: META_COMPOSER_SYSTEM_PROMPT_V1,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: [PLAN_TOOL],
        // Forced tool_choice: guarantees a single tool_use block with JSON matching the schema.
        tool_choice: { type: "tool", name: "plan_section" },
        messages: [
          {
            role: "user",
            content:
              `User question: ${input.userQuestion}\n\n` +
              `Cube AI response:\n` +
              `- queryTitle: ${input.cubeMeta.queryTitle}\n` +
              `- description: ${input.cubeMeta.description}\n` +
              `- chartCategory: ${input.cubeMeta.chartCategory ?? "(none)"}\n` +
              `- commentary: ${input.cubeMeta.commentary}\n\n` +
              `Plan the section.`,
          },
        ],
      },
      input.signal ? { signal: input.signal } : {}
    );

    stream.on("inputJson", (_delta: string, snapshot: unknown) => {
      cb.onPartialPlan(snapshot as Partial<SectionPlan>);
    });
    stream.on("error", (err: Error) => reportError(err));

    const final = await stream.finalMessage();
    const toolUse = final.content.find(
      (b): b is ToolUseBlock => b.type === "tool_use"
    );
    if (!toolUse) throw new Error("No tool_use block in meta-composer response");
    const parsed = SectionPlanSchema.parse(toolUse.input);
    logEvent("meta_composer_completed", {
      slideCount: parsed.slides.length,
      elapsedMs: Math.round(performance.now() - start),
    });
    cb.onFinal(parsed);
  } catch (err) {
    reportError(err as Error);
  }
}
