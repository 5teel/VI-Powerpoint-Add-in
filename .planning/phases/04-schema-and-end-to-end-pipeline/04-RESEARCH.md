# Phase 4: Schema and End-to-End Pipeline - Research

**Researched:** 2026-03-24
**Domain:** JSON schema design, LLM structured output prompting, response parsing, React UI extension
**Confidence:** HIGH

## Summary

Phase 4 bridges the existing Cube AI streaming client (`streamCubeAI()`) to the existing slide renderer (`insertSlide()`) by defining a JSON slide schema, wrapping user questions with a system prompt that instructs Cube AI to return conforming JSON, parsing the response with graceful fallback, and adding a "Create Slide" button to the chat UI.

The key technical challenges are: (1) designing a JSON schema that maps directly to the existing `SlideContent` discriminated union to minimize transformation code, (2) crafting a system prompt that reliably elicits structured JSON from Cube AI, (3) robustly extracting JSON from LLM responses that may contain markdown fences, commentary, or malformed output, and (4) implementing the text-only fallback when parsing fails so the user always gets a useful slide.

**Primary recommendation:** The JSON schema should mirror the existing TypeScript `SlideContent` types exactly (same field names, same discriminated union on `type`). This eliminates a mapping layer -- the parsed JSON IS the `SlideContent` object after validation. The system prompt should include a compact schema definition and one example per layout type.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Wrap the user's question with a system instruction that includes the SlideLayout JSON schema and asks Cube AI to return structured JSON. Single API call -- no two-step pipeline.
- **D-02:** Include the full schema definition in every request. Stateless -- no dependency on Cube AI conversation memory via chatId. Reliable even if sessions are lost.
- **D-03:** When Cube AI returns text without valid slide JSON, fall back to a text-only slide using the raw response as bullet points. The user always gets something useful on a slide -- never a blank failure.
- **D-04:** The parser should attempt to extract JSON from the response (e.g., find JSON block within markdown fences or mixed text), and if extraction fails, apply the text-only fallback.
- **D-05:** Response streams into the chat panel first. After completion, a "Create Slide" button appears below the response. User reviews the answer, then clicks to insert. No auto-creation.
- **D-06:** After slide creation, show confirmation in the chat (e.g., "Slide created" inline message).
- **D-07:** Cube AI determines the layout type in its JSON response -- picks text-only, chart-text, table-text, or full-combination based on the data it returns (LYOT-01). Our schema includes a `type` field matching the existing `SlideContent` discriminated union.
- **D-08:** If Cube AI returns an unrecognized layout type, fall back to text-only (same as D-03 resilience strategy).

### Claude's Discretion
- Exact JSON schema field names and structure (must map cleanly to existing `SlideContent` types)
- System prompt wording for instructing Cube AI to return JSON
- JSON extraction strategy (regex for code fences, try-parse, etc.)
- "Create Slide" button styling and placement in the chat flow
- Confirmation message format after slide insertion

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHM-01 | JSON slide schema defines supported layout types, content blocks, chart configs, and table structures | Schema mirrors existing `SlideContent` union types exactly; 4 layout types with documented fields |
| SCHM-02 | Cube AI is prompted to return structured JSON matching the slide schema alongside natural language insights | System prompt wrapping strategy with schema definition and few-shot examples |
| SCHM-03 | Schema parser validates Cube AI JSON output and handles malformed/partial responses gracefully | Multi-stage extraction (code fence strip, JSON find, parse, validate, fallback) |
| TASK-01 | User can type a natural language business question in the taskpane input | Already functional via ChatPanel.tsx -- Phase 4 wraps the question with system prompt before sending |
| LYOT-01 | Cube AI determines the appropriate layout type based on data (chart vs table vs bullets vs combination) | Schema `type` field in system prompt instructs Cube AI to choose layout; fallback to text-only for unknown types |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.4+ | Type-safe schema definitions and validation | Already in project; strict mode enabled |
| React 18 | 18.3.1 | Chat UI components | Already in project |
| Fluent UI v9 | 9.73.4 | Button, MessageBar components for "Create Slide" UX | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | - | - | All Phase 4 work uses existing dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual validation | Zod or Ajv | Schema validation libraries add dependency; manual validation sufficient for 4 layout types with simple fields |
| JSON schema spec | TypeScript type guards | TypeScript type guards are lighter weight and already the project pattern |

**No new packages needed.** Phase 4 is pure application code using existing dependencies.

## Architecture Patterns

### Recommended Project Structure
```
src/taskpane/
  services/
    cubeai.ts            # (existing) Add system prompt wrapping
    slideRenderer.ts     # (existing) No changes needed
    schemaParser.ts      # (NEW) JSON extraction + validation + fallback
    promptBuilder.ts     # (NEW) System prompt construction
  slide/
    types.ts             # (existing) SlideContent union -- THE schema target
  components/
    ChatPanel.tsx         # (existing) Add "Create Slide" button + confirmation
```

### Pattern 1: Schema-as-TypeScript-Types (Zero Mapping)
**What:** The JSON schema sent to Cube AI mirrors the existing `SlideContent` TypeScript types exactly. The parsed JSON output IS a `SlideContent` object after validation -- no transformation layer needed.
**When to use:** Always for this project. The types already exist and work with `insertSlide()`.
**Example:**
```typescript
// The schema sent to Cube AI in the system prompt is derived from these existing types:
// TextOnlyContent:     { type: "text-only", title, bullets[], insight }
// ChartTextContent:    { type: "chart-text", title, chartImageBase64?, summaryBullets[], insight }
// TableTextContent:    { type: "table-text", title, headers[], rows[][], summary }
// FullCombinationContent: { type: "full-combination", title, chartImageBase64?, headers[], rows[][], insight }
//
// After parsing and validation, the result feeds directly into insertSlide(content)
```

### Pattern 2: Multi-Stage JSON Extraction
**What:** Extract JSON from LLM responses through progressive parsing stages.
**When to use:** Always when parsing LLM output that may contain markdown, commentary, or malformed JSON.
**Example:**
```typescript
function extractSlideContent(raw: string): SlideContent | null {
  // Stage 1: Try direct JSON.parse (clean response)
  // Stage 2: Extract from markdown code fences (```json ... ```)
  // Stage 3: Find first { to last } and try parsing
  // Stage 4: Return null (caller applies text-only fallback)
}
```

### Pattern 3: System Prompt Wrapping (D-01, D-02)
**What:** The `streamCubeAI()` call wraps the user's question with a system instruction containing the schema definition. The system prompt is prepended to the user's question in the `input` field.
**When to use:** Every Cube AI request in Phase 4+.
**Why not a separate system message field:** The Cube AI Chat API `input` field is a single string. The system instruction and user question are concatenated.
**Example:**
```typescript
function buildPrompt(userQuestion: string): string {
  return `${SYSTEM_PROMPT}\n\nUser question: ${userQuestion}`;
}
```

### Pattern 4: Graceful Fallback to Text-Only (D-03, D-08)
**What:** When JSON extraction or validation fails, convert the raw AI response into a `TextOnlyContent` slide with the response text as bullet points.
**When to use:** Any time the parser returns null or the type field is unrecognized.
**Example:**
```typescript
function fallbackToTextOnly(rawContent: string, title?: string): TextOnlyContent {
  const lines = rawContent.split('\n').filter(l => l.trim().length > 0);
  return {
    type: "text-only",
    title: title || "AI Response",
    bullets: lines.slice(0, 6),  // Cap at reasonable bullet count
    insight: lines.length > 6 ? lines.slice(6).join(' ') : lines[lines.length - 1] || "",
  };
}
```

### Anti-Patterns to Avoid
- **Designing a new intermediate type:** The `SlideContent` union already exists and works with `insertSlide()`. Do not create a separate "schema" type that requires mapping.
- **Including position/coordinates in the schema:** Layout is handled by the existing template system (`constants.ts`). Cube AI should never specify pixel positions.
- **Requesting chartImageBase64 from Cube AI:** Chart rendering is Phase 5. The schema should document the field but the system prompt should tell Cube AI to omit it (or it will hallucinate base64).
- **Using chatId for schema context (D-02 violation):** Every request must include the full schema. No relying on conversation memory to "remember" the schema format.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slide rendering | Custom shape creation | Existing `insertSlide()` from `slideRenderer.ts` | Already handles all 4 layout types with proper batching |
| NDJSON streaming | Custom fetch+parse | Existing `streamCubeAI()` from `cubeai.ts` | Already handles buffering, throttling, error classification |
| Layout positioning | Dynamic layout calculator | Existing template constants from `constants.ts` | Pre-defined regions for all 4 templates |
| Complex JSON validation | Full JSON Schema validator (Ajv) | TypeScript type guards with manual checks | Only 4 layout types with simple fields; adding Ajv would be overkill |

**Key insight:** Phase 4 primarily creates two thin services (prompt builder, schema parser) and extends the existing ChatPanel component. The heavy lifting (streaming, rendering) is already done.

## Common Pitfalls

### Pitfall 1: LLM Returns JSON Inside Markdown Fences
**What goes wrong:** Cube AI wraps its JSON response in ` ```json ... ``` ` markdown fences. Direct `JSON.parse()` fails because of the fence markers.
**Why it happens:** LLMs are trained on conversations where code blocks use markdown fences. Even when instructed to return raw JSON, they frequently add fences.
**How to avoid:** The parser must strip markdown code fences before attempting JSON.parse(). Regex: `/```(?:json)?\s*([\s\S]*?)```/`
**Warning signs:** Parse failures in testing despite Cube AI visibly returning valid JSON in the chat panel.

### Pitfall 2: LLM Adds Commentary Before/After JSON
**What goes wrong:** Cube AI returns "Here's the slide data:\n```json\n{...}\n```\nI chose a table layout because..." The JSON is valid but embedded in natural language text.
**Why it happens:** LLMs default to conversational output. Even with strong system prompts, they may add explanatory text.
**How to avoid:** Multi-stage extraction: try direct parse, then extract from fences, then find `{...}` boundaries. The system prompt should explicitly say "Return ONLY the JSON object, no explanation."
**Warning signs:** Intermittent parse failures depending on question complexity.

### Pitfall 3: chartImageBase64 Hallucination
**What goes wrong:** If the schema includes `chartImageBase64` as a field, Cube AI may generate a fake base64 string that is not a valid image.
**Why it happens:** LLMs cannot generate real image data. If the field is in the schema, they may fill it with garbage.
**How to avoid:** The system prompt should explicitly instruct Cube AI to omit `chartImageBase64` (or set it to null). The parser should always discard any `chartImageBase64` value from Cube AI -- chart images are only generated client-side in Phase 5.
**Warning signs:** Slides with broken/empty chart areas.

### Pitfall 4: Schema Too Complex for Reliable LLM Compliance
**What goes wrong:** A large, deeply nested schema with many optional fields results in low compliance rates from the LLM. Responses are frequently malformed.
**Why it happens:** More fields = more opportunities for the LLM to make mistakes. Complex conditional logic (e.g., "include headers and rows only if type is table-text") is hard for LLMs to follow consistently.
**How to avoid:** Keep the schema definition in the system prompt minimal. Show the 4 types with their required fields. Include one compact example per type. The system prompt schema definition should be under 40 lines.
**Warning signs:** Parse success rate below 80% during manual testing.

### Pitfall 5: System Prompt Wrapping Breaks Streaming Display
**What goes wrong:** When the user's question is wrapped with a system prompt, the streaming chat panel shows the raw system prompt text to the user before Cube AI starts responding.
**Why it happens:** The `input` field sent to Cube AI contains both system prompt and user question. If the UI displays the sent input, it shows the full wrapped prompt.
**How to avoid:** The ChatPanel should display only the original user question, not the wrapped prompt. The wrapping happens in the service layer, transparent to the UI. Store the display question separately from the API question.
**Warning signs:** Users see the system prompt instructions in their chat history.

### Pitfall 6: "Create Slide" Button State Management
**What goes wrong:** The "Create Slide" button remains clickable while a slide is being created, leading to duplicate slide insertion. Or the button disappears after the component re-renders.
**Why it happens:** `insertSlide()` is async and takes 1-2 seconds. Without proper state management, double-clicks create duplicate slides.
**How to avoid:** Track per-message slide creation state (idle/creating/created). Disable the button during creation. Replace it with a confirmation message after success. Use a ref or state keyed to the message index.
**Warning signs:** Duplicate slides in the presentation.

## Code Examples

### Schema Parser Service
```typescript
// src/taskpane/services/schemaParser.ts
import { SlideContent, TextOnlyContent } from "../slide/types";

const VALID_TYPES = ["text-only", "chart-text", "table-text", "full-combination"] as const;

/**
 * Attempt to extract a valid SlideContent object from raw LLM response text.
 * Returns null if no valid JSON can be extracted.
 */
export function extractSlideContent(raw: string): SlideContent | null {
  const jsonStr = extractJsonString(raw);
  if (!jsonStr) return null;

  try {
    const parsed = JSON.parse(jsonStr);
    return validateSlideContent(parsed);
  } catch {
    return null;
  }
}

/**
 * Extract a JSON string from LLM output.
 * Handles: raw JSON, markdown-fenced JSON, JSON embedded in text.
 */
function extractJsonString(raw: string): string | null {
  const trimmed = raw.trim();

  // Stage 1: Direct parse attempt
  if (trimmed.startsWith("{")) {
    try { JSON.parse(trimmed); return trimmed; } catch { /* continue */ }
  }

  // Stage 2: Extract from markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { JSON.parse(fenceMatch[1].trim()); return fenceMatch[1].trim(); } catch { /* continue */ }
  }

  // Stage 3: Find outermost { ... }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.substring(firstBrace, lastBrace + 1);
    try { JSON.parse(candidate); return candidate; } catch { /* continue */ }
  }

  return null;
}

/**
 * Validate parsed JSON conforms to SlideContent discriminated union.
 * Strips chartImageBase64 (Phase 5 only). Applies sensible defaults.
 */
function validateSlideContent(obj: unknown): SlideContent | null {
  if (!obj || typeof obj !== "object") return null;
  const data = obj as Record<string, unknown>;

  if (!VALID_TYPES.includes(data.type as typeof VALID_TYPES[number])) return null;
  if (typeof data.title !== "string" || !data.title.trim()) return null;

  // Always strip chartImageBase64 -- Phase 5 generates this client-side
  delete data.chartImageBase64;

  switch (data.type) {
    case "text-only":
      if (!Array.isArray(data.bullets)) return null;
      if (typeof data.insight !== "string") return null;
      return data as unknown as TextOnlyContent;

    case "chart-text":
      if (!Array.isArray(data.summaryBullets)) return null;
      if (typeof data.insight !== "string") return null;
      return data as unknown as SlideContent;

    case "table-text":
      if (!Array.isArray(data.headers)) return null;
      if (!Array.isArray(data.rows)) return null;
      if (typeof data.summary !== "string") return null;
      return data as unknown as SlideContent;

    case "full-combination":
      if (!Array.isArray(data.headers)) return null;
      if (!Array.isArray(data.rows)) return null;
      if (typeof data.insight !== "string") return null;
      return data as unknown as SlideContent;

    default:
      return null;
  }
}

/**
 * Fallback: convert raw text to a text-only slide (D-03, D-08).
 */
export function fallbackToTextOnly(rawContent: string): TextOnlyContent {
  const lines = rawContent
    .split("\n")
    .map(l => l.replace(/^[-*]\s*/, "").trim())
    .filter(l => l.length > 0);

  const maxBullets = 6;
  const bullets = lines.slice(0, maxBullets);
  const remaining = lines.slice(maxBullets);

  return {
    type: "text-only",
    title: "AI Insights",
    bullets: bullets.length > 0 ? bullets : ["No structured data available"],
    insight: remaining.length > 0 ? remaining.join(" ") : bullets[bullets.length - 1] || "",
  };
}
```

### Prompt Builder Service
```typescript
// src/taskpane/services/promptBuilder.ts

const SLIDE_SCHEMA = `You are a data analyst. Return a JSON object matching one of these slide layouts:

1. text-only: { "type": "text-only", "title": "...", "bullets": ["..."], "insight": "..." }
2. chart-text: { "type": "chart-text", "title": "...", "summaryBullets": ["..."], "insight": "..." }
3. table-text: { "type": "table-text", "title": "...", "headers": ["..."], "rows": [["..."]], "summary": "..." }
4. full-combination: { "type": "full-combination", "title": "...", "headers": ["..."], "rows": [["..."]], "insight": "..." }

Rules:
- Choose the layout type that best fits the data
- Use "table-text" or "full-combination" when the answer has structured/numeric data
- Use "text-only" when the answer is narrative or qualitative
- Use "chart-text" when a visual chart would help (do NOT include chartImageBase64)
- Return ONLY the JSON object, no explanation or markdown fences
- "title" should be a concise slide title (not the question)
- "bullets"/"summaryBullets" should be 3-6 clear bullet points
- "insight" should be one sentence highlighting the key takeaway
- "rows" values can be strings or numbers`;

/**
 * Wrap user question with system prompt for structured JSON output.
 * Per D-01: single API call with schema in every request.
 * Per D-02: stateless, no chatId dependency for schema context.
 */
export function buildSlidePrompt(userQuestion: string): string {
  return `${SLIDE_SCHEMA}\n\nUser question: ${userQuestion}`;
}
```

### ChatPanel "Create Slide" Integration
```typescript
// Key additions to ChatPanel.tsx:

// New state for per-message slide creation tracking
interface ChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
  error?: CubeAIError;
  slideState?: "idle" | "creating" | "created" | "failed";
}

// Handler for "Create Slide" button click
const handleCreateSlide = useCallback(async (messageIndex: number) => {
  const msg = messages[messageIndex];
  if (!msg || msg.role !== "assistant") return;

  // Mark as creating (disables button)
  setMessages(prev => prev.map((m, i) =>
    i === messageIndex ? { ...m, slideState: "creating" } : m
  ));

  try {
    const content = extractSlideContent(msg.content) ?? fallbackToTextOnly(msg.content);
    await insertSlide(content);

    // Mark as created (shows confirmation)
    setMessages(prev => prev.map((m, i) =>
      i === messageIndex ? { ...m, slideState: "created" } : m
    ));
  } catch (err) {
    setMessages(prev => prev.map((m, i) =>
      i === messageIndex ? { ...m, slideState: "failed" } : m
    ));
  }
}, [messages]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LLM function calling / tool use for structured output | System prompt with schema + extraction parsing | Ongoing | Cube AI Chat API does not expose OpenAI-style function calling; system prompt wrapping is the available pattern |
| Separate "analyze then format" two-step pipeline | Single API call with schema in prompt (D-01) | User decision | Reduces latency and complexity |
| Schema validation via JSON Schema spec + Ajv | TypeScript type guards | Project decision | Lighter weight for 4 simple types |

**Note on Cube AI capabilities:** The Cube AI Chat API (`/chat/stream-chat-state`) accepts a single `input` string and `sessionSettings`. There is no separate system message field or function calling mechanism. The system prompt must be embedded in the `input` field. This has been verified from the existing `cubeai.ts` implementation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1+ |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHM-01 | Schema types define 4 layout types with correct fields | unit | `npx vitest run src/taskpane/services/schemaParser.test.ts -t "valid"` | Wave 0 |
| SCHM-02 | Prompt builder wraps question with schema instruction | unit | `npx vitest run src/taskpane/services/promptBuilder.test.ts` | Wave 0 |
| SCHM-03 | Parser handles malformed JSON, fenced JSON, missing fields, unknown types | unit | `npx vitest run src/taskpane/services/schemaParser.test.ts -t "fallback\|malformed\|fence"` | Wave 0 |
| TASK-01 | User types question and it is submitted to Cube AI | manual-only | N/A (requires Office.js + PowerPoint host) | N/A |
| LYOT-01 | Cube AI determines layout type; unrecognized types fall back to text-only | unit | `npx vitest run src/taskpane/services/schemaParser.test.ts -t "unrecognized"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/taskpane/services/schemaParser.test.ts` -- covers SCHM-01, SCHM-03, LYOT-01
- [ ] `src/taskpane/services/promptBuilder.test.ts` -- covers SCHM-02

## Open Questions

1. **Cube AI response format with system prompt wrapping**
   - What we know: Cube AI returns NDJSON with `content` field containing assistant text. The existing client accumulates this into a single string.
   - What's unclear: How Cube AI behaves when given a system prompt embedded in the `input` field -- does it follow JSON schema instructions reliably? Does it use markdown fences? What compliance rate can we expect?
   - Recommendation: Build the parser to handle all extraction stages (direct, fenced, embedded). First manual test with the actual API will reveal typical response format and inform system prompt tuning.

2. **System prompt token budget**
   - What we know: The schema definition with rules is approximately 250-350 tokens. Cube AI has a context window (size unknown for this specific deployment).
   - What's unclear: Whether the combined system prompt + user question + Cube AI context exceeds any token limits.
   - Recommendation: Keep system prompt under 400 tokens. If token limits become an issue, compress the schema definition further.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/taskpane/slide/types.ts` -- `SlideContent` discriminated union (4 types, verified)
- Existing codebase: `src/taskpane/services/cubeai.ts` -- streaming client with `input` field API contract
- Existing codebase: `src/taskpane/services/slideRenderer.ts` -- `insertSlide(content: SlideContent)` entry point
- Existing codebase: `src/taskpane/components/ChatPanel.tsx` -- current chat UI structure
- `.planning/research/PITFALLS.md` -- Pitfall 8 (AI schema compliance)
- `.planning/research/ARCHITECTURE.md` -- Component boundaries and data flow

### Secondary (MEDIUM confidence)
- LLM structured output patterns -- well-established in industry; multi-stage JSON extraction is standard practice

### Tertiary (LOW confidence)
- Cube AI response behavior with system prompt wrapping -- requires empirical validation with actual API

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing code verified by reading source
- Architecture: HIGH -- direct mapping from existing types to schema, thin service layer
- Pitfalls: HIGH -- based on well-known LLM structured output challenges + existing project pitfalls research
- System prompt effectiveness: LOW -- requires empirical testing with actual Cube AI API

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable; core patterns are well-established)
