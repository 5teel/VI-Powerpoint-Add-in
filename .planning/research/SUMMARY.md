# Project Research Summary

**Project:** Summit VI for PowerPoint
**Domain:** AI-powered PowerPoint Office Web Add-in (enterprise data insights to native slides)
**Researched:** 2026-03-23
**Confidence:** HIGH (stack and architecture verified against official Microsoft docs; features MEDIUM due to fast-moving AI market)

## Executive Summary

Summit VI is an Office Web Add-in that gives users a taskpane chat interface inside PowerPoint, sends natural language questions to the Cube AI Chat API, and renders the answers as native PowerPoint slides. The recommended approach is to scaffold the project with the `yo office` generator (TypeScript + React + Webpack), target the PowerPointApi 1.8 requirement set, and build a strict pipeline: user input → NDJSON streaming fetch → Slide Schema Parser → Slide Renderer using Office.js. The add-in's unique value proposition is live enterprise data from Cube AI rendered as editable PowerPoint elements -- something Microsoft Copilot and standalone tools like Gamma cannot deliver.

The single most critical architectural discovery is that the PowerPoint JavaScript API has **no native chart creation capability** (unlike Excel). All charts must be rendered client-side (Chart.js to canvas, exported as base64 PNG), then inserted via `ShapeFill.setImage()` on a geometric shape (GA in 1.8) or the preview-only `shapes.addPicture()` method. Text boxes and tables are natively supported and should use the Office.js API directly. The `insertSlidesFromBase64()` approach with PptxGenJS can produce editable native charts but forces insertion at the slide level rather than within existing slides -- treat this as a secondary strategy for chart-heavy slides.

The primary risks are: (1) CORS blocking direct Cube AI API calls from the add-in's WebView2 sandbox -- this must be validated on day one before any other work begins; (2) AI schema compliance failures where Cube AI returns malformed or non-conforming JSON -- mitigated by designing the schema bottom-up from what Office.js can actually render and adding a validation/sanitization layer; and (3) building on `addPicture()` preview API without a `ShapeFill.setImage()` fallback. An internal demo scoping is appropriate -- defer auth systems, design templates, multi-slide generation, and collaboration features entirely.

## Key Findings

### Recommended Stack

The project uses a Microsoft-endorsed web add-in stack scaffolded by the Yeoman Office generator. Office.js is loaded via CDN (never bundled), and the taskpane is a React 18 SPA using Fluent UI v9 components for Office-native visual design. Webpack 5 handles bundling and the required local HTTPS dev server. PptxGenJS is the standard library for generating .pptx blobs with charts when native editable charts are needed; Chart.js provides the client-side canvas rendering pipeline for chart-as-image insertion.

**Core technologies:**
- **Office.js (PowerPointApi 1.8+):** Slide/shape/table manipulation -- the only mechanism for programmatically creating native PowerPoint elements from a web add-in
- **TypeScript ~5.4:** Type safety and Office.js typings -- Microsoft-first, catches API misuse at compile time
- **React 18.x:** Taskpane UI framework -- Fluent UI v9 is React-only; do NOT use React 19 (Fluent UI v9 not validated against it)
- **@fluentui/react-components ~9.46:** Office-native UI components -- use v9, not v8 (maintenance mode)
- **Webpack 5 + webpack-dev-server 4.x:** Bundling and HTTPS dev server -- Vite is not supported by Office add-in tooling
- **PptxGenJS ~3.12:** Generate .pptx blobs containing native PowerPoint charts for insertion via `insertSlidesFromBase64()`
- **Chart.js ~4.4:** Client-side chart rendering to canvas/base64 for image-based chart insertion (GA fallback path)
- **Native Fetch API:** NDJSON streaming from Cube AI -- no HTTP library needed

**Critical version constraint:** Do not use React 19. `addPicture()` is Preview-only; use `ShapeFill.setImage()` (GA 1.8) as the stable image insertion path. Target PowerPointApi 1.8 minimum; runtime-check for Preview features.

### Expected Features

The critical path is: natural language input → Cube AI API call → JSON parse → slide render. Everything else layers on top. Multi-turn context via `chatId` is a core v1 feature (not a stretch goal) because it is already exposed by Cube AI with minimal add-in effort.

**Must have (Phase 1 -- without these it is not a demo):**
- Natural language input in taskpane
- Cube AI API integration with streaming NDJSON
- JSON slide schema definition and parsing
- Text rendering (title, bullets, key findings)
- Chart generation via image pipeline (bar, line, pie)
- Loading/progress indication during API calls
- Error handling for API failures

**Should have (Phase 2 -- makes the demo compelling):**
- Data table rendering using `addTable()` (GA 1.8)
- Conversation context via `chatId` (multi-turn)
- Key insight callout boxes ("so what" text)
- Source attribution footnotes
- Slide layout intelligence (AI selects layout template)

**Defer (Phase 3+):**
- Streaming response display in taskpane (progressive partial text)
- Follow-up refinement ("change to pie chart")
- Multi-slide generation for complex queries
- Image fallback for visualizations Cube AI cannot express as chart data

**Anti-features (never build):** Full deck generation, design template library, user auth system, image generation (DALL-E style), PowerPoint animation control, offline caching.

### Architecture Approach

The add-in is a two-component system: an XML manifest that registers the add-in with PowerPoint, and a React SPA served over HTTPS that runs inside PowerPoint's WebView2 sandbox. The app communicates "inward" to the PowerPoint document via Office.js (RequestContext + `context.sync()` batching pattern) and "outward" to Cube AI via standard `fetch()`. A TypeScript `SlideLayout` interface acts as the intermediary contract between AI response parsing and slide rendering -- this decoupling is the most important structural decision. The layout engine uses fixed template slots (not AI-specified pixel coordinates) to ensure consistent, non-overlapping slide layouts.

**Major components:**
1. **Manifest (XML):** Registers add-in, declares permissions, specifies taskpane URL -- use stable XML manifest, not the JSON unified manifest (still in developer preview)
2. **Taskpane UI (React):** Chat input, conversation history, streaming status display, error feedback
3. **Cube AI API Service:** NDJSON stream reader with line buffer, chatId management, API key auth
4. **Slide Schema Parser:** Extracts and validates JSON from AI response; maps to typed `SlideLayout` objects; strips markdown fences, applies defaults, clamps values
5. **Slide Renderer:** Translates `SlideLayout` to Office.js calls -- TextRenderer, TableRenderer, ChartRenderer (image-based), LayoutEngine (points-based with fixed templates)
6. **PowerPoint Document:** The live presentation, manipulated via Office.js proxy model

**Key patterns:** All Office.js operations batched within `PowerPoint.run()` and committed with a single `context.sync()`; layout uses predefined region constants (TITLE, CONTENT_FULL, CONTENT_LEFT, CONTENT_RIGHT) in points; chart images rendered at ~800x600px and inserted via `ShapeFill.setImage()` on a rectangle shape.

### Critical Pitfalls

1. **No chart API in Office.js** -- Accept from day one that all charts are images. Design the schema and rendering pipeline around `ShapeFill.setImage()` (GA) or `addPicture()` (Preview with fallback). Never plan for a native `addChart()` call.
2. **`addPicture()` is Preview-only** -- Implement `ShapeFill.setImage()` on a geometric rectangle as the primary GA-stable image insertion path. Reserve `addPicture()` for environments where Preview APIs are confirmed available.
3. **CORS blocking Cube AI API calls** -- Validate that `ai.gcp-us-central1.cubecloud.dev` returns correct CORS headers from the WebView2 origin on day one. If not, a lightweight proxy server is required before any other development can proceed.
4. **Schema designed beyond API capabilities** -- Every element in the `SlideLayout` schema must map to a concrete, tested Office.js API call. Design bottom-up from the API surface, not top-down from ideal output.
5. **NDJSON stream chunk boundary failures** -- Use a line buffer that carries incomplete lines across `read()` calls. One malformed line must not crash the entire stream. Flush buffer on stream end.
6. **AI JSON non-compliance** -- Wrap all AI response parsing in try/catch, extract JSON from markdown fences, validate against schema, apply defaults. Keep the schema as simple as possible -- fewer fields means higher AI compliance.
7. **Layout without fixed templates** -- Use predefined layout templates (e.g., "title + chart", "title + table + summary") with hardcoded bounding boxes in points. Do not let the AI specify element coordinates.

## Implications for Roadmap

Based on combined research, a 6-phase build order is recommended. Dependencies are strictly sequential: each phase gates the next. Do not attempt Phase 4 without completing Phases 2 and 3 first.

### Phase 1: Foundation -- Scaffold, Manifest, and API Connectivity Proof

**Rationale:** Two architectural unknowns must be resolved before writing any feature code: (a) does the add-in load in PowerPoint, and (b) can the add-in reach the Cube AI API without CORS errors. Discovering a CORS blocker in Phase 3 would require a proxy server and significant rework. Resolve both on day one.
**Delivers:** Working add-in that loads in PowerPoint taskpane AND successfully makes a test call to Cube AI endpoint, with the result displayed in the taskpane UI.
**Addresses:** CORS validation (Pitfall 9), manifest setup, Office.onReady initialization
**Avoids:** Discovering CORS blocker late in the project (Pitfall 9)
**Research flag:** LOW -- well-documented scaffold path; CORS behavior for the specific Cube AI domain is the only unknown

### Phase 2: Office.js Slide Primitives

**Rationale:** Before connecting AI responses to slide rendering, verify what the Office.js API can actually do in the target environment. Build and test each rendering primitive in isolation. This phase enforces the "schema designed from API capabilities" principle and prevents Pitfall 4.
**Delivers:** Verified ability to programmatically create slides with text boxes, tables, and chart images (via `ShapeFill.setImage()`) using correct points-based coordinates.
**Addresses:** Text rendering, table rendering, image insertion, points-based layout engine with fixed template regions
**Avoids:** Schema designed beyond API capabilities (Pitfall 4), coordinate confusion (Pitfall 7), `context.sync()` batching mistakes (Pitfall 6)
**Research flag:** LOW -- all APIs are documented with HIGH confidence; standard patterns apply

### Phase 3: Cube AI API Integration

**Rationale:** Validate the full NDJSON streaming pipeline independently of slide rendering. Getting the stream parsing right in isolation is much easier than debugging it after connecting it to Office.js.
**Delivers:** Reliable NDJSON stream consumer that handles chunk boundaries correctly, accumulates the full response, extracts chatId, and displays partial text in the taskpane.
**Addresses:** NDJSON streaming (Pitfall 3), conversation threading via chatId, API key authentication, loading state display
**Avoids:** Streaming parsing failures (Pitfall 3), chatId loss on partial response
**Research flag:** LOW -- streaming NDJSON pattern is well-documented; Cube AI-specific response format may need empirical discovery

### Phase 4: Slide Schema and End-to-End Rendering

**Rationale:** Now that Office.js primitives (Phase 2) and Cube AI streaming (Phase 3) are independently proven, connect them through the `SlideLayout` schema. This is the core feature phase and the first time end-to-end question-to-slide works.
**Delivers:** Full pipeline -- user types question, Cube AI responds with slide JSON, schema parser validates it, slide renderer creates the slide in PowerPoint.
**Addresses:** `SlideLayout` TypeScript interface, schema parser with validation/sanitization, slide renderer wiring, Cube AI prompt engineering to produce conforming JSON, AI schema non-compliance handling (Pitfall 8)
**Avoids:** AI JSON non-compliance (Pitfall 8), layout without fixed templates (Pitfall 10)
**Research flag:** MEDIUM -- Cube AI prompt engineering for structured JSON output will require empirical tuning; the schema design is project-specific

### Phase 5: Chart Rendering Pipeline

**Rationale:** Charts are the highest-complexity rendering element and depend on a working end-to-end pipeline from Phase 4. Isolating chart work into its own phase allows focused debugging of the canvas-to-image pipeline.
**Delivers:** Chart data from Cube AI JSON rendered via Chart.js to canvas, exported as base64 PNG, inserted into slides as image fills on rectangle shapes. Covers bar, line, and pie charts.
**Addresses:** Chart.js integration, canvas resolution management (~800x600px), `ShapeFill.setImage()` insertion, `addPicture()` as optional enhancement with `isSetSupported()` feature detection
**Avoids:** Building on preview-only `addPicture()` without fallback (Pitfall 2), large base64 memory issues (Pitfall 14)
**Research flag:** LOW -- Chart.js canvas export is well-established; image insertion via ShapeFill.setImage is documented

### Phase 6: Polish, Multi-turn, and Demo Readiness

**Rationale:** Final phase wires together the remaining Phase 2 features (tables, key insight callouts, source attribution), adds multi-turn conversation support, refines layout, and hardens error handling for demo reliability.
**Delivers:** Table rendering, chatId-based multi-turn conversation, key findings callout boxes, source attribution footnotes, refined layout templates, streaming progress UX in taskpane, and comprehensive error handling.
**Addresses:** Data table rendering, conversation context, key insight callouts, source attribution, layout polish, platform requirement set checks (Pitfall 5)
**Avoids:** Requirement set gaps on desktop/Mac (Pitfall 5)
**Research flag:** LOW -- all component patterns are established by this phase; cross-platform testing is the main unknown

### Phase Ordering Rationale

- **CORS validation first** because a proxy server requirement would invalidate the entire client-side API call architecture, forcing a major rework if discovered late
- **Primitives before pipeline** because connecting Office.js APIs to AI output before verifying each API call in isolation produces untraceable bugs
- **API integration before schema** because the exact shape of Cube AI's response format must be observed empirically before finalizing the `SlideLayout` schema
- **Charts last** because chart rendering has the most dependencies (schema, renderer, canvas pipeline) and is the most complex isolated component
- **Single-slide mastery before multi-slide** -- multi-slide generation is deferred to Phase 3+ as per feature research

### Research Flags

Phases likely needing deeper research or empirical discovery during planning/execution:
- **Phase 1:** Cube AI CORS headers from WebView2 origin -- unknown until tested; may require a proxy server decision
- **Phase 4:** Cube AI prompt engineering for structured JSON output -- the exact system prompt format and few-shot examples needed to produce reliable `SlideLayout` JSON will require iteration
- **Phase 4:** Cube AI response format -- actual NDJSON message structure (which lines carry text vs. slide JSON vs. metadata) must be observed empirically

Phases with standard, well-documented patterns (research-phase not needed):
- **Phase 2:** Office.js shape creation -- HIGH confidence, official docs with code examples
- **Phase 3:** NDJSON streaming -- established pattern, pseudocode provided in ARCHITECTURE.md
- **Phase 5:** Chart.js canvas export -- standard library, well-documented pipeline
- **Phase 6:** Fluent UI components and error handling -- standard React patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against official Microsoft add-in docs (Feb 2026). Version constraints (React 18 not 19, `addPicture` preview status) confirmed against current API reference. |
| Features | MEDIUM | Feature categorization is sound; competitive landscape knowledge may be slightly stale (fast-moving AI market). Core feature set for this project is clear. |
| Architecture | HIGH | All API surfaces verified against official docs including requirement set compatibility matrix through 1.10 + preview. No chart API confirmed HIGH confidence. |
| Pitfalls | HIGH | All critical pitfalls sourced from official documentation. CORS for the specific Cube AI domain is the only unverified element. |

**Overall confidence:** HIGH

### Gaps to Address

- **Cube AI CORS configuration:** Must be tested in the actual WebView2 environment on day one of Phase 1. If CORS headers are missing, a thin proxy server must be scoped and built before Phase 3 can begin. Decision point: proxy server vs. direct call.
- **Cube AI response schema:** The exact structure of NDJSON messages (which message type carries slide JSON, which carries natural language text, what the chatId field is named) must be observed from a live API call before finalizing the `SlideLayout` parser in Phase 4. Plan for 1-2 days of empirical API exploration.
- **Chart.js vs. PptxGenJS chart strategy:** Research recommends Chart.js image insertion as the primary path (GA stable via `ShapeFill.setImage()`). PptxGenJS via `insertSlidesFromBase64()` produces editable native charts but forces whole-slide insertion. Confirm with stakeholders whether editable charts are a demo requirement before Phase 5.
- **Minimum supported Office version:** The manifest's `<Requirements>` element for PowerPointApi 1.8 excludes volume-licensed/LTSC Office users. Confirm target user base is on Microsoft 365 subscription builds before finalizing the manifest.

## Sources

### Primary (HIGH confidence)
- Microsoft Learn: PowerPoint add-ins overview -- https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/powerpoint-add-ins (updated Feb 2026)
- Microsoft Learn: Build first PowerPoint add-in quickstart -- https://learn.microsoft.com/en-us/office/dev/add-ins/quickstarts/powerpoint-quickstart (updated Dec 2025)
- Microsoft Learn: Work with shapes -- https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/shapes (updated May 2025)
- Microsoft Learn: ShapeCollection API reference -- https://learn.microsoft.com/en-us/javascript/api/powerpoint/powerpoint.shapecollection (updated Feb 2026)
- Microsoft Learn: PowerPoint API requirement sets -- https://learn.microsoft.com/en-us/javascript/api/requirement-sets/powerpoint/powerpoint-api-requirement-sets (updated Dec 2025)
- Microsoft Learn: PowerPointApi 1.8 requirement set -- https://learn.microsoft.com/en-us/javascript/api/requirement-sets/powerpoint/powerpoint-api-1-8-requirement-set
- Microsoft Learn: PowerPoint Preview APIs -- https://learn.microsoft.com/en-us/javascript/api/requirement-sets/powerpoint/powerpoint-preview-apis
- Microsoft Learn: Insert slides from another presentation -- https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/insert-slides-into-presentation (updated Dec 2025)
- Microsoft Learn: Add and delete slides -- https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/add-slides (updated Feb 2026)
- Microsoft Learn: Same-origin policy limitations -- https://learn.microsoft.com/en-us/office/dev/add-ins/develop/addressing-same-origin-policy-limitations
- Microsoft Learn: Tag presentations, slides, and shapes -- https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/tagging-presentations-slides-shapes
- Microsoft Learn: Understanding the Office JavaScript API -- https://learn.microsoft.com/en-us/office/dev/add-ins/develop/understanding-the-javascript-api-for-office

### Secondary (MEDIUM confidence)
- Training data knowledge of Microsoft Copilot for PowerPoint, Gamma.app, Tome, Beautiful.ai, SlidesAI.io, ThoughtSpot (competitive landscape, as of early 2025 -- fast-moving space)
- Project context from `.planning/PROJECT.md` -- direct source, HIGH confidence for project-specific decisions

---
*Research completed: 2026-03-23*
*Ready for roadmap: yes*
