/**
 * Prompt builder for Cube AI slide generation.
 * Wraps user questions with a system prompt containing the slide JSON schema.
 */

const SLIDE_SCHEMA = `You are a data analyst. Answer the user's question and return ONLY JSON matching one of these layouts. No markdown fences, no explanation.

Layouts:

1. text-only: { "type": "text-only", "title": "...", "bullets": ["..."], "insight": "..." }
2. chart-text: { "type": "chart-text", "title": "...", "summaryBullets": ["..."], "insight": "..." }
3. table-text: { "type": "table-text", "title": "...", "headers": ["..."], "rows": [["...", 123]], "summary": "..." }
4. full-combination: { "type": "full-combination", "title": "...", "headers": ["..."], "rows": [["...", 123]], "insight": "..." }

Rules:
- Choose the best layout for the data
- Return ONLY JSON, nothing else
- Title: concise (under 60 chars)
- Bullets/summaryBullets: 3-6 items
- Insight/summary: one sentence
- Row values can be strings or numbers
- Do NOT include chartImageBase64`;

/**
 * Build a complete prompt that wraps the user's question with schema instructions.
 * The full schema is included in every request (stateless, no chatId dependency).
 */
export function buildSlidePrompt(userQuestion: string): string {
  return `${SLIDE_SCHEMA}\n\nUser question: ${userQuestion}`;
}
