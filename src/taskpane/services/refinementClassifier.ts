/**
 * Phase 6 D-03 refinement classifier — Haiku 4.5 one-shot forced-tool call.
 *
 * SECURITY: dangerouslyAllowBrowser:true — same internal-sideload-only trade-off
 * as composer.ts (Phase 5 D-04). DO NOT SHIP TO APPSOURCE — dangerouslyAllowBrowser
 * exposes ANTHROPIC_API_KEY in the client bundle.
 *
 * Mirrors composer.ts architecture: singleton client, __setAnthropicClientForTesting,
 * forced tool_choice, Zod post-parse. Differs: messages.create (not stream);
 * heuristic fallback returns {path: 'cube-ai+composer', rationale: 'classifier-fallback'}
 * on ANY error so the UI never blocks on classifier failure.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ANTHROPIC_API_KEY } from "../config";
import { REFINEMENT_CLASSIFIER_SYSTEM_PROMPT } from "../prompts/refinementClassifierSystem";
import { logEvent } from "./telemetry";

export const RoutingSchema = z
  .object({
    path: z.enum(["composer-only", "cube-ai+composer"]),
    rationale: z.string().max(200),
  })
  .strict();
export type RefinementRouting = z.infer<typeof RoutingSchema>;

const ROUTE_TOOL: Tool = {
  name: "route_refinement",
  description:
    "Classify the refinement instruction: 'composer-only' for visual/presentation edits " +
    "(chart type, colors, commentary wording, callouts, emphasis) where the existing data rows are reused; " +
    "'cube-ai+composer' for data-shape changes (new dimensions, filters, time ranges, groupings) " +
    "where new SQL must be generated.",
  input_schema: zodToJsonSchema(RoutingSchema, {
    target: "openApi3",
    $refStrategy: "none",
  }) as Tool["input_schema"],
};

// Singleton client at module load — same fail-fast posture as composer.ts.
// Testable via __setAnthropicClientForTesting below.
let client: Anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

/** Test-only override — allows unit tests to inject a stubbed client. */
export function __setAnthropicClientForTesting(stub: Anthropic): void {
  client = stub;
}

/**
 * Classify a refinement instruction into one of two routing paths.
 * On ANY error (network, Zod fail, missing tool_use, abort), returns the safe
 * fallback {path: "cube-ai+composer", rationale: "classifier-fallback"} — the
 * UI never blocks on classifier failure.
 */
export async function classifyRefinement(
  instruction: string,
  lastSlideTitle: string,
  signal?: AbortSignal
): Promise<RefinementRouting> {
  const start = performance.now();
  try {
    const res = await client.messages.create(
      {
        model: "claude-haiku-4-5",
        max_tokens: 256,
        temperature: 0,
        system: REFINEMENT_CLASSIFIER_SYSTEM_PROMPT,
        tools: [ROUTE_TOOL],
        tool_choice: { type: "tool", name: "route_refinement" },
        messages: [
          {
            role: "user",
            content:
              `Prior slide title: "${lastSlideTitle}"\n\n` +
              `User refinement: "${instruction}"\n\n` +
              `Classify the route.`,
          },
        ],
      },
      signal ? { signal } : {}
    );
    const block = res.content.find(
      (b): b is ToolUseBlock => b.type === "tool_use"
    );
    if (!block) throw new Error("Classifier emitted no tool_use block");
    const parsed = RoutingSchema.parse(block.input);
    logEvent("refinement_routed", {
      path: parsed.path,
      rationale: parsed.rationale,
      latencyMs: Math.round(performance.now() - start),
    });
    return parsed;
  } catch (err) {
    logEvent("refinement_routed", {
      path: "cube-ai+composer",
      fallback: true,
      error: String(err),
    });
    return { path: "cube-ai+composer", rationale: "classifier-fallback" };
  }
}
