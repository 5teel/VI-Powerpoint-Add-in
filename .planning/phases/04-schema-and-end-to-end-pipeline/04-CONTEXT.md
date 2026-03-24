# Phase 4: Schema and End-to-End Pipeline - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the Cube AI streaming response to the existing slide renderer. Define a JSON slide schema, prompt Cube AI to return structured JSON matching it, parse the response with graceful fallback, and create slides in PowerPoint via a "Create Slide" button in the chat UI. This is the first end-to-end question-to-slide experience.

</domain>

<decisions>
## Implementation Decisions

### Schema Prompting Strategy
- **D-01:** Wrap the user's question with a system instruction that includes the SlideLayout JSON schema and asks Cube AI to return structured JSON. Single API call — no two-step pipeline.
- **D-02:** Include the full schema definition in every request. Stateless — no dependency on Cube AI conversation memory via chatId. Reliable even if sessions are lost.

### Parser Resilience
- **D-03:** When Cube AI returns text without valid slide JSON, fall back to a text-only slide using the raw response as bullet points. The user always gets something useful on a slide — never a blank failure.
- **D-04:** The parser should attempt to extract JSON from the response (e.g., find JSON block within markdown fences or mixed text), and if extraction fails, apply the text-only fallback.

### Slide Trigger UX
- **D-05:** Response streams into the chat panel first. After completion, a "Create Slide" button appears below the response. User reviews the answer, then clicks to insert. No auto-creation.
- **D-06:** After slide creation, show confirmation in the chat (e.g., "Slide created" inline message).

### Layout Selection
- **D-07:** Cube AI determines the layout type in its JSON response — picks text-only, chart-text, table-text, or full-combination based on the data it returns (LYOT-01). Our schema includes a `type` field matching the existing `SlideContent` discriminated union.
- **D-08:** If Cube AI returns an unrecognized layout type, fall back to text-only (same as D-03 resilience strategy).

### Claude's Discretion
- Exact JSON schema field names and structure (must map cleanly to existing `SlideContent` types)
- System prompt wording for instructing Cube AI to return JSON
- JSON extraction strategy (regex for code fences, try-parse, etc.)
- "Create Slide" button styling and placement in the chat flow
- Confirmation message format after slide insertion

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Slide Renderer (wire to)
- `src/taskpane/services/slideRenderer.ts` — `insertSlide(content: SlideContent)` orchestrator, handles all 4 layout types
- `src/taskpane/slide/types.ts` — `SlideContent` discriminated union (TextOnlyContent, ChartTextContent, TableTextContent, FullCombinationContent)
- `src/taskpane/slide/constants.ts` — Layout region constants for all templates
- `src/taskpane/slide/textRenderer.ts` — Title, body, callout box rendering
- `src/taskpane/slide/tableRenderer.ts` — Table rendering with formatted cells
- `src/taskpane/slide/placeholderRenderer.ts` — Chart placeholder image insertion

### Existing Streaming Client (consume from)
- `src/taskpane/services/cubeai.ts` — `streamCubeAI()` with callback interface, returns `CubeAIStreamResult { content, chatId }`
- `src/taskpane/config.ts` — API config with `internalId` auth

### Chat UI (extend)
- `src/taskpane/components/ChatPanel.tsx` — Chat panel where "Create Slide" button will be added

### Cube AI API
- `.planning/research/PITFALLS.md` — Streaming and parsing pitfalls
- `.planning/research/ARCHITECTURE.md` — Component boundaries

### Project Context
- `.planning/PROJECT.md` — Project vision, constraints
- `.planning/REQUIREMENTS.md` — SCHM-01, SCHM-02, SCHM-03, TASK-01, LYOT-01

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **slideRenderer.ts `insertSlide()`**: Ready to consume `SlideContent` — Phase 4 creates the bridge from Cube AI JSON → `SlideContent` → `insertSlide()`
- **types.ts `SlideContent`**: The target type — the JSON schema must map to this union. Fields: `type`, `title`, `bullets`/`summaryBullets`, `insight`/`summary`, `headers`, `rows`, `chartImageBase64`
- **cubeai.ts `streamCubeAI()`**: Returns `CubeAIStreamResult.content` as a string — Phase 4 parses this string for JSON
- **ChatPanel.tsx**: Currently renders streaming text and error messages — needs "Create Slide" button added to completed assistant messages

### Established Patterns
- React 18 + Fluent UI v9 components
- Services in `src/taskpane/services/`
- Slide rendering types in `src/taskpane/slide/`
- TypeScript strict mode
- Callback-based streaming delivery

### Integration Points
- New schema parser service bridges `CubeAIStreamResult.content` → `SlideContent`
- ChatPanel needs to call `insertSlide()` when user clicks "Create Slide"
- System prompt wrapping happens in `cubeai.ts` or a new prompt builder service

</code_context>

<specifics>
## Specific Ideas

- The JSON schema should mirror the existing `SlideContent` TypeScript types as closely as possible to minimize mapping code
- Chart data is not rendered in Phase 4 (that's Phase 5) — chart-text and full-combination layouts will use placeholder images
- The system prompt should be concise to minimize token usage on every request

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-schema-and-end-to-end-pipeline*
*Context gathered: 2026-03-24*
