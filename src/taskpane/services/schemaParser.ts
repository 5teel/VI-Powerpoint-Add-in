/**
 * Schema parser for Cube AI responses.
 * Extracts and validates JSON slide content from LLM output with graceful fallback.
 */

import type { SlideContent, TextOnlyContent } from "../slide/types";

const VALID_TYPES = ["text-only", "chart-text", "table-text", "full-combination"] as const;

/**
 * Validate that a parsed object matches one of the SlideContent types.
 * Returns the validated object or null if invalid.
 */
function validateSlideContent(obj: Record<string, unknown>): SlideContent | null {
  // Check type is valid
  const type = obj.type;
  if (typeof type !== "string" || !(VALID_TYPES as readonly string[]).includes(type)) {
    return null;
  }

  // Check title is non-empty string
  if (typeof obj.title !== "string" || obj.title.trim() === "") {
    return null;
  }

  // Type-specific validation
  switch (type) {
    case "text-only":
      if (!Array.isArray(obj.bullets) || typeof obj.insight !== "string") return null;
      break;
    case "chart-text":
      if (!Array.isArray(obj.summaryBullets) || typeof obj.insight !== "string") return null;
      break;
    case "table-text":
      if (!Array.isArray(obj.headers) || !Array.isArray(obj.rows) || typeof obj.summary !== "string") return null;
      break;
    case "full-combination":
      if (!Array.isArray(obj.headers) || !Array.isArray(obj.rows) || typeof obj.insight !== "string") return null;
      break;
    default:
      return null;
  }

  // Always strip chartImageBase64 (Pitfall 3 — Cube AI may hallucinate base64)
  delete obj.chartImageBase64;

  return obj as unknown as SlideContent;
}

/**
 * Try to parse a string as JSON and return the object, or null on failure.
 */
function tryParse(str: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Multi-stage extraction of SlideContent from raw LLM output.
 *
 * Stage 1: Try JSON.parse on trimmed input (clean JSON responses)
 * Stage 2: Regex extract from markdown code fences
 * Stage 3: Find first { to last } and try parsing
 * Stage 4: Return null (caller uses fallbackToTextOnly)
 */
export function extractSlideContent(raw: string): SlideContent | null {
  if (!raw || typeof raw !== "string") return null;

  const trimmed = raw.trim();

  // Stage 1: Direct JSON parse
  const direct = tryParse(trimmed);
  if (direct) return validateSlideContent(direct);

  // Stage 2: Extract from markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    const fenced = tryParse(fenceMatch[1].trim());
    if (fenced) return validateSlideContent(fenced);
  }

  // Stage 3: Find first { to last } substring
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const substring = trimmed.substring(firstBrace, lastBrace + 1);
    const extracted = tryParse(substring);
    if (extracted) return validateSlideContent(extracted);
  }

  // Stage 4: No valid JSON found
  return null;
}

/**
 * Convert raw text into a TextOnlyContent object as a fallback
 * when JSON extraction fails.
 */
export function fallbackToTextOnly(rawContent: string): TextOnlyContent {
  if (!rawContent || rawContent.trim() === "") {
    return {
      type: "text-only",
      title: "AI Insights",
      bullets: ["No structured data available"],
      insight: "",
    };
  }

  const lines = rawContent
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      type: "text-only",
      title: "AI Insights",
      bullets: ["No structured data available"],
      insight: "",
    };
  }

  const MAX_BULLETS = 6;
  const bullets = lines.slice(0, MAX_BULLETS);
  const overflow = lines.slice(MAX_BULLETS);
  const insight = overflow.length > 0 ? overflow.join(" ") : "";

  return {
    type: "text-only",
    title: "AI Insights",
    bullets,
    insight,
  };
}
