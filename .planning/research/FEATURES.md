# Feature Landscape

**Domain:** AI-powered PowerPoint Office Web Add-in (data insights to slides)
**Researched:** 2026-03-23
**Confidence:** MEDIUM (based on training data; web search unavailable for live verification)

## Competitive Landscape Context

The AI presentation space has three tiers of competition relevant to Summit VI:

1. **Native AI (Microsoft Copilot for PowerPoint):** Built into M365, generates slides from prompts, rewrites content, suggests designs. The 800-pound gorilla. Cannot query proprietary databases like Summit VI.
2. **Standalone AI presentation tools (Gamma, Tome, Beautiful.ai, SlidesAI):** Generate entire decks from prompts. Polished design, but generic data -- no live enterprise data integration.
3. **Data-to-presentation tools (ThoughtSpot, Tableau Pulse, Power BI + Copilot):** Pull real business data and create visualizations, but don't produce native PowerPoint slides users can edit.

Summit VI's unique position: it sits at the intersection of tiers 2 and 3 -- real enterprise data from Cube AI, rendered as native editable PowerPoint elements. This is the differentiator lens through which all features below are evaluated.

---

## Table Stakes

Features users expect from any AI-powered slide tool. Missing any of these means the product feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Natural language input | Every AI tool has a chat/prompt box. Users type a question and expect a result. | Low | Already in scope. Taskpane text input with submit. |
| Slide generation from AI response | The core promise. Ask question, get slide. | High | Core feature. Cube AI returns insight; add-in must parse and render. |
| Title + body text rendering | Every generated slide must have a clear title and readable body text. | Low | Straightforward Office.js text shape insertion. |
| Chart generation (bar, line, pie) | Data answers without charts feel incomplete. These three cover 80% of business data visualization. | Medium | Native PowerPoint charts via Office.js. Critical for credibility. |
| Loading/progress indication | AI calls take 3-15 seconds. No feedback = users think it's broken. | Low | Streaming NDJSON gives opportunity for progressive feedback. |
| Error handling with clear messages | API failures, malformed responses, rate limits must be communicated clearly. | Low | Non-negotiable for any API-dependent tool. |
| Slide inserted at current position | Users expect the new slide to appear where they are in the deck, not randomly. | Low | Office.js supports specifying slide insertion position. |
| Basic formatting/styling | Generated slides must look professional, not like raw text dumps. Consistent fonts, reasonable spacing, aligned elements. | Medium | Requires a thoughtful default layout system in the JSON schema. |
| Conversation context (multi-turn) | Users ask follow-ups: "Now break that down by region." Must remember prior context. | Medium | Cube AI supports chatId threading. Must persist across interactions. |

---

## Differentiators

Features that set Summit VI apart. Not expected (competitors don't have them), but high value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Live enterprise data on slides | Copilot and Gamma can't query Summit VI's database. This is THE differentiator. Every slide has real, current business data. | Low (Cube AI handles it) | The data pipeline already exists. The add-in is the delivery mechanism. |
| Native editable chart elements | Unlike screenshot/image-based tools, charts are real PowerPoint chart objects users can edit, re-style, and update. | Medium | Office.js chart APIs. Fallback to images for complex visuals is smart. |
| Data table rendering | Business users often want the numbers, not just the chart. Tables on slides let analysts verify and present. | Medium | Office.js table APIs exist but have formatting quirks. |
| Streaming response display | Show AI thinking/partial results in the taskpane while Cube AI processes. Feels fast and interactive. | Medium | NDJSON streaming from Cube AI maps well to progressive UI updates. |
| Slide layout intelligence | AI decides whether the answer needs a chart, a table, a bullet list, or a combination -- and lays out accordingly. | High | The JSON slide schema must support multiple layout types. Cube AI prompt engineering is key. |
| Follow-up refinement | "Make that a pie chart instead" or "Add the Q3 numbers" without starting over. | Medium | Depends on Cube AI's ability to understand modification requests and return updated JSON. |
| Multi-slide generation | Some questions need more than one slide (e.g., "Give me a quarterly review"). Generate a coherent set. | High | Requires the JSON schema to support slide arrays and Cube AI to produce them. Defer to v2 unless easy. |
| Key insight callouts | Auto-generated "key finding" or "so what" text boxes that highlight the most important takeaway from the data. | Low | Cube AI likely includes this in its natural language response. Just render it prominently. |
| Source attribution on slides | Small footnote showing data source, query date, and confidence. Builds trust in the numbers. | Low | Simple text element. High trust value for analysts presenting to leadership. |

---

## Anti-Features

Features to explicitly NOT build. Each would waste effort or undermine the product.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full deck generation from a single prompt | Massive complexity, unreliable quality, and Gamma/Tome already do this well with generic content. Summit VI's strength is per-question data slides. | Support multi-slide for complex answers, but don't try to generate 20-slide strategy decks. |
| Design template library | Huge design effort, not the core value. Users already have company templates in PowerPoint. | Respect the active presentation's theme/styles. Insert slides that inherit existing design. |
| Image generation (DALL-E style) | Scope creep. Cube AI returns data insights, not creative imagery. Adding image gen dilutes the data story. | If decorative images are needed, that's a v3 concern at best. |
| Slide-by-slide narration/speaker notes AI | Nice-to-have that adds significant complexity. Not what analysts need for an internal demo. | Defer entirely. If Cube AI returns a natural language summary, optionally put it in speaker notes as a freebie. |
| Real-time collaboration features | Office already handles co-authoring. Building collab features in the add-in is redundant. | Lean on PowerPoint's native collaboration. |
| User authentication system | v1 is internal demo with API key auth. Building a full auth system is premature. | API key in add-in config. Revisit for external client release. |
| Offline caching of insights | Stale data is worse than no data for a tool whose value is live business data. | Always fetch fresh from Cube AI. Show clear "no connection" state. |
| PowerPoint animation/transition control | Complex, low value, and users can add their own. | Insert static, well-formatted slides. Let users animate if they want. |
| Export to other formats (PDF, Google Slides) | You're already in PowerPoint. PowerPoint handles export natively. | Do nothing. PowerPoint's own export works fine. |

---

## Feature Dependencies

```
Natural language input --> Cube AI API integration --> JSON response parsing --> Slide rendering
                                                                                    |
                                                                          +---------+---------+
                                                                          |         |         |
                                                                       Text     Charts    Tables
                                                                       rendering rendering rendering

Conversation context (chatId) --> Follow-up refinement
Slide layout intelligence --> Multi-slide generation (layout must work for single before tackling multi)
Streaming response --> Loading/progress indication (streaming enables better progress UX)
```

**Critical path:** Input --> API call --> Parse JSON --> Render slide. Everything else layers on top of this.

**Dependency notes:**
- Chart rendering depends on the JSON schema supporting chart data structures
- Follow-up refinement depends on conversation context working reliably
- Multi-slide generation depends on single-slide layout being solid first
- Source attribution is independent and can be added at any time
- Streaming display is independent of slide rendering (taskpane UX only)

---

## MVP Recommendation

### Must ship (Phase 1 -- without these it's not a demo):
1. **Natural language input** in taskpane
2. **Cube AI API integration** with streaming NDJSON
3. **JSON slide schema** parsing
4. **Text rendering** (title, bullets, key findings)
5. **Chart generation** (bar, line, pie -- native PowerPoint)
6. **Loading state** during API calls
7. **Error handling** for API failures

### Should ship (Phase 2 -- makes the demo compelling):
1. **Data table rendering** on slides
2. **Conversation context** (multi-turn via chatId)
3. **Key insight callouts** (prominent "so what" text)
4. **Source attribution** footnotes
5. **Slide layout intelligence** (AI picks layout type)

### Defer (Phase 3+ -- nice to have but not demo-critical):
1. **Follow-up refinement** ("change to pie chart")
2. **Multi-slide generation** for complex queries
3. **Streaming response display** in taskpane (progressive rendering)
4. **Image fallback** for complex visualizations Cube AI can't express as chart data

### Rationale:
Phase 1 proves the core loop works: ask a question, get a data slide. Phase 2 makes it feel like a real tool (tables, context, trust signals). Phase 3 adds polish that matters for repeated use but isn't needed to demonstrate the concept.

---

## Sources

- Training data knowledge of Microsoft Copilot for PowerPoint, Gamma.app, Tome, Beautiful.ai, SlidesAI.io, ThoughtSpot, and Office.js add-in capabilities (MEDIUM confidence -- web search unavailable for live verification)
- Project context from `.planning/PROJECT.md` (HIGH confidence -- direct source)

**Confidence note:** Feature categorization is based on broad knowledge of the AI presentation tool market as of early 2025. The fast-moving nature of this space means some competitors may have added or changed features since then. The table stakes / differentiator classification is specific to Summit VI's positioning as a data-insight tool, not a general presentation generator.
