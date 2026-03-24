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

/**
 * Build a guided prompt that incorporates brand name and analysis purpose.
 * Reuses the same SLIDE_SCHEMA as buildSlidePrompt for consistent JSON output.
 * The product image is NOT sent to Cube AI — it is inserted directly on the slide.
 */
export function buildGuidedPrompt(brandName: string, purpose: string): string {
  return `${SLIDE_SCHEMA}

Focus: Provide analysis specifically about the brand "${brandName}".
Analysis purpose: ${purpose}
Include product-specific insights and metrics relevant to this brand.

User question: Provide a ${purpose} for ${brandName}`;
}
