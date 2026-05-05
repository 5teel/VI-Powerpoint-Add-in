/**
 * Phase 5 composer — single-turn forced-tool streaming composition call to Anthropic.
 *
 * SECURITY: This module imports ANTHROPIC_API_KEY into the browser bundle via
 * DefinePlugin and passes dangerouslyAllowBrowser:true. This is an accepted
 * trade-off for internal sideload distribution only (D-04). NEVER ship this
 * pattern to AppSource or any external-tenant distribution without a
 * server-side proxy.
 *
 * See 05-AI-SPEC.md §3 for the canonical pattern and 05-RESEARCH.md Pattern 1
 * for the cross-verified implementation.
 *
 * DO NOT SHIP TO APPSOURCE — dangerouslyAllowBrowser exposes ANTHROPIC_API_KEY
 * in the client bundle (D-04 internal-only trade-off).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } from "../config";
import { COMPOSER_SYSTEM_PROMPT_V2 } from "../prompts/composerSystem";
import { buildUserContent } from "../prompts/composerUser";
import {
  CompositionPlanSchema,
  type CompositionPlan,
} from "./compositionSchema";

export interface ComposerInput {
  userQuestion: string;
  cubeMeta: {
    queryTitle: string;
    description: string;
    vegaSpec?: unknown;
    tableChartSpec?: unknown;
    commentary: string;
  };
  rows: unknown[];
  canvas: { widthPx: number; heightPx: number };
  generatedImageBase64?: string;
  signal?: AbortSignal;
}

export interface ComposerCallbacks {
  onPartialPlan: (partial: Partial<CompositionPlan>) => void;
  onFinal: (plan: CompositionPlan) => void;
  onError: (err: Error) => void;
  /** Phase 6 D-13: fires between 429 retry attempts. delayMs = wait before next attempt. */
  onRateLimitRetry?: (attempt: number, delayMs: number) => void;
}

// Singleton client at module load — surfaces construction errors (Pitfall 5) fail-fast.
// Testable via __setAnthropicClientForTesting below.
let client: Anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

/** Test-only override — allows unit tests to inject a stubbed client. */
export function __setAnthropicClientForTesting(stub: Anthropic): void {
  client = stub;
}

const COMPOSE_TOOL_SCHEMA = zodToJsonSchema(CompositionPlanSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

const COMPOSE_TOOL: Tool = {
  name: "compose_slide",
  description:
    "Emit the final slide composition plan. Call EXACTLY ONCE. " +
    "Do not emit any text blocks. All coordinates are fractions of the 16:9 canvas (0..1). " +
    "Regions must not overlap or extend beyond [0, 1].",
  input_schema: COMPOSE_TOOL_SCHEMA as Tool["input_schema"],
};

export async function composeSlide(
  input: ComposerInput,
  cb: ComposerCallbacks
): Promise<void> {
  // Guard against double error dispatch: the SDK's stream.on("error") and the
  // try/catch around await stream.finalMessage() can both fire for the same
  // underlying failure. Only the first call propagates.
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
        max_tokens: 4096,
        temperature: 0.4,
        system: [
          {
            type: "text",
            text: COMPOSER_SYSTEM_PROMPT_V2,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: `Canvas: ${input.canvas.widthPx}x${input.canvas.heightPx}px (16:9).`,
          },
        ],
        tools: [COMPOSE_TOOL],
        // Forced tool_choice: guarantees a single tool_use block with JSON matching the schema.
        // Extended thinking is NOT enabled (incompatible with forced tool_choice per Pitfall 4).
        tool_choice: { type: "tool", name: "compose_slide" },
        messages: [{ role: "user", content: buildUserContent(input) }],
      },
      input.signal ? { signal: input.signal } : {}
    );

    stream.on("inputJson", (_delta: string, snapshot: unknown) => {
      cb.onPartialPlan(snapshot as Partial<CompositionPlan>);
    });
    stream.on("error", (err: Error) => reportError(err));

    const final = await stream.finalMessage();
    const toolUse = final.content.find(
      (b): b is ToolUseBlock => b.type === "tool_use"
    );
    if (!toolUse) throw new Error("No tool_use block in Anthropic response");
    const parsed = CompositionPlanSchema.parse(toolUse.input);
    cb.onFinal(parsed);
  } catch (err) {
    reportError(err as Error);
  }
}
