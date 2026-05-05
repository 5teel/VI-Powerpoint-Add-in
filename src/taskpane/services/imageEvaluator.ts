import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_API_KEY } from "../config";

export interface ImageEvalResult {
  needed: boolean;
  prompt?: string;
}

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, dangerouslyAllowBrowser: true });

export async function evaluateImageNeed(
  userQuestion: string,
  commentary: string,
  queryTitle: string,
  signal?: AbortSignal
): Promise<ImageEvalResult> {
  const msg = await client.messages.create(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      messages: [
        {
          role: "user",
          content: `Slide designer decision: would a photographic background or supporting image meaningfully strengthen this executive slide?

YES only if the topic has a clear real-world visual hook (geography, industry setting, product category, market scene).
NO for purely numeric/financial insights with no compelling visual.
If YES: write a concise image generation prompt (≤15 words, photorealistic, no text/labels in image).

Respond with exactly one line: YES: <prompt>  or  NO

Question: ${userQuestion}
Query: ${queryTitle}
Insight: ${commentary.slice(0, 400)}`,
        },
      ],
    },
    signal ? { signal } : {}
  );

  const text = (msg.content[0] as { type: "text"; text: string }).text.trim();
  if (text.startsWith("YES:")) {
    const prompt = text.slice(4).trim();
    if (prompt) return { needed: true, prompt };
  }
  return { needed: false };
}
