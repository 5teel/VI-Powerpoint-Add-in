# Roadmap: Summit VI for PowerPoint

## Overview

Summit VI for PowerPoint is built in six sequential phases, each de-risking a specific architectural unknown before the next depends on it. Phase 1 proves the add-in loads in PowerPoint and can reach Cube AI without CORS errors — two unknowns that would force significant rework if discovered late. Phase 2 verifies every Office.js rendering primitive works in the target environment before AI output is connected to it. Phase 3 proves the Cube AI streaming pipeline in isolation. Phase 4 wires them together through the SlideLayout schema to deliver the first end-to-end question-to-slide experience. Phase 4.1 adds the guided slide builder wizard. Phase 4.2 ships the deployment to Railway. Phase 5 shifts from "build our own chart pipeline" to "consume Cube AI's chart/table specs and native data API" — the add-in extracts Vega-Lite specs + SQL from Cube AI's `cubeSqlApi` toolCall, fetches data via Cube's REST API, renders charts locally, and composes slides with AI-generated commentary. Phase 6 completes the demo experience with multi-turn conversation, streaming UX refinements, and demo hardening.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Scaffold add-in, load in PowerPoint taskpane, prove Cube AI API connectivity (completed 2026-03-23)
- [x] **Phase 2: Slide Primitives** - Verify all Office.js rendering APIs (text, tables, image insertion, layout) (completed 2026-03-23)
- [x] **Phase 3: Cube AI Integration** - Build and validate the full NDJSON streaming pipeline with error handling (completed 2026-03-24)
- [x] **Phase 4: Schema and End-to-End Pipeline** - Wire schema parser to slide renderer for first working question-to-slide (completed 2026-03-24)
- [x] **Phase 4.1: Guided Slide Builder** - Step-by-step wizard for branded, image-inclusive slides (INSERTED) (completed 2026-03-30)
- [x] **Phase 4.2: Deployment** - Deploy add-in to GitHub + Railway, update manifest for remote hosting (INSERTED) (completed 2026-03-30)
- [ ] **Phase 5: Chart + Table Interpretation & Slide Composition** - Extract Vega-Lite/table specs and SQL from Cube AI responses, fetch data via Cube REST API, render locally, compose slides with AI commentary
- [ ] **Phase 6: Polish and Demo Readiness** - Multi-turn conversation, streaming UX, layout polish, and demo hardening

## Phase Details

### Phase 1: Foundation
**Goal**: A working Office Web Add-in loads in PowerPoint's taskpane and can successfully call the Cube AI API
**Depends on**: Nothing (first phase)
**Requirements**: BRND-01, TASK-02
**Success Criteria** (what must be TRUE):
  1. The taskpane opens inside PowerPoint displaying "Summit VI" branding with a functional UI shell
  2. A test call to the Cube AI Chat API completes successfully (no CORS errors) and the raw response appears in the taskpane
  3. The add-in loads via sideload manifest without Office Store submission
  4. The project compiles with TypeScript strict mode and runs on the local HTTPS dev server
**Plans**: 2 plans
Plans:
- [x] 01-01-PLAN.md -- Scaffold Office add-in, configure dependencies, set up .env and logo asset
- [x] 01-02-PLAN.md -- Build branded UI shell with chat layout and Cube AI connectivity test

### Phase 2: Slide Primitives
**Goal**: Every Office.js rendering capability required by the project is individually proven to work in the target environment
**Depends on**: Phase 1
**Requirements**: TEXT-01, TEXT-02, TEXT-03, TEXT-04, TABL-01, TABL-02, LYOT-02, LYOT-03
**Success Criteria** (what must be TRUE):
  1. A slide is inserted at the current deck position containing a title, body text (bullets), and a key insight callout box with correct fonts and alignment
  2. A data table is inserted on a slide with headers, data rows, borders, alignment, and number formatting
  3. A placeholder image is inserted into a slide shape via ShapeFill.setImage() occupying the correct layout region
  4. Multiple layout templates (text-only, chart+text, table+text) produce non-overlapping elements in the correct positions
**Plans**: 3 plans
Plans:
- [x] 02-01-PLAN.md -- Types, layout constants, number formatter, and text/callout renderers
- [x] 02-02-PLAN.md -- Table renderer, chart placeholder, layout engine, and slide renderer orchestrator
- [x] 02-03-PLAN.md -- Test UI panel with four template buttons and human verification in PowerPoint

### Phase 3: Cube AI Integration
**Goal**: The add-in reliably streams, buffers, and parses NDJSON responses from Cube AI with correct error handling
**Depends on**: Phase 1
**Requirements**: CUBE-01, CUBE-02, TASK-02, TASK-03
**Success Criteria** (what must be TRUE):
  1. The add-in authenticates to Cube AI via API key and initiates a streaming NDJSON request
  2. Partial response lines are buffered correctly across chunk boundaries — no dropped or malformed lines
  3. A loading/progress indicator is visible in the taskpane for the full duration of the API call (3-15 seconds)
  4. When an API call fails or returns a malformed response, a clear error message is displayed in the taskpane (not a blank screen or crash)
**Plans**: 2 plans
Plans:
- [x] 03-01-PLAN.md -- Streaming NDJSON client with callback interface and unit tests
- [x] 03-02-PLAN.md -- ChatPanel streaming UI with phase spinner, inline errors, and retry

### Phase 4: Schema and End-to-End Pipeline
**Goal**: A user can type a business question, Cube AI returns a conforming JSON slide schema, and a fully populated slide appears in PowerPoint
**Depends on**: Phase 2, Phase 3
**Requirements**: SCHM-01, SCHM-02, SCHM-03, TASK-01, LYOT-01
**Success Criteria** (what must be TRUE):
  1. User types a natural language question in the taskpane input and submits it
  2. Cube AI returns JSON matching the SlideLayout schema and a new slide is created in the active presentation
  3. Cube AI's schema output determines the layout type (text-only, chart, table, or combination) and the correct layout template is applied
  4. When Cube AI returns malformed or non-conforming JSON, the parser recovers gracefully and either renders a degraded slide or shows a user-facing error — it does not crash
**Plans**: 2 plans
Plans:
- [x] 04-01-PLAN.md -- Schema parser and prompt builder services with unit tests
- [x] 04-02-PLAN.md -- ChatPanel integration with Create Slide button and end-to-end verification

### Phase 4.1: Guided Slide Builder (INSERTED)
**Goal**: A step-by-step wizard that guides users through brand selection, image upload, analysis purpose, and slide design approval before building data-driven slides with product imagery
**Depends on**: Phase 4
**Requirements**: SC-01, SC-02, SC-03, SC-04, SC-05
**Success Criteria** (what must be TRUE):
  1. User can select or enter a brand name to focus the analysis on
  2. User can upload a product image that is stored in session memory (base64) and displayed in the wizard
  3. User can choose the purpose/focus of the analysis (e.g., range review, performance breakdown, competitor comparison)
  4. User previews and approves a slide design before it is created in the presentation
  5. The created slide includes the uploaded product image placed in a shape region alongside data content
**Plans**: 2 plans
Plans:
- [x] 04.1-01-PLAN.md -- Image utilities, guided prompt builder, and slide renderer extension for product images
- [x] 04.1-02-PLAN.md -- WizardPanel UI with 4 steps, App.tsx tab integration, and end-to-end verification

### Phase 4.2: Deployment (INSERTED)
**Goal**: Deploy the add-in to Railway for remote hosting so it can be distributed to users with Summit email accounts via Microsoft 365 admin center
**Depends on**: Phase 4.1
**Requirements**: None (infrastructure)
**Success Criteria** (what must be TRUE):
  1. Source code is hosted on GitHub
  2. Add-in static files are deployed to Railway with HTTPS
  3. Manifest points to Railway URL instead of localhost:3100
  4. Add-in loads and functions correctly in PowerPoint when sideloaded from the remote URL
**Plans**: 2 plans
Plans:
- [x] 04.2-01-PLAN.md -- Build config refactor (DefinePlugin, Dockerfile, nginx, .gitignore, manifest updates)
- [x] 04.2-02-PLAN.md -- GitHub push, Railway deployment, and end-to-end PowerPoint verification

### Phase 5: Chart + Table Interpretation & Slide Composition
**Goal**: The add-in reads Cube AI's `cubeSqlApi` toolCall output (SQL + Vega-Lite spec + table spec + metadata), executes the query against Cube's REST data API to fetch rows, renders the chart or table locally, and composes a slide that combines the visualization with AI-generated commentary.
**Depends on**: Phase 4.2
**Requirements**: CHRT-01, CHRT-02, CHRT-03, CHRT-04 (chart rendering replaced: now consume Vega-Lite specs instead of building bar/line/pie renderers from scratch), plus new requirements covering table rendering and commentary placement (to be finalized during /gsd-discuss-phase).

**Architecture (validated by spike 2026-04-23):**
- Cube AI Chat API streams a `toolCall` message with `input: { sqlQuery, queryTitle, description, chartCategory, vegaSpec | tableChartSpec, memoryId }`
- Final `assistant.content` contains ready-to-use commentary text (e.g., *"NSW leads with $5.3B, representing 33% of total…"*)
- **Data rows are NOT in the Chat API stream** — the add-in must call Cube REST `/load` separately, sending a translated query derived from the SQL fields Cube AI provides
- Cube REST API confirmed CORS-open (`allow-origin: *`), JWT-authenticated, standard `{ data, annotation }` response shape, and supports async polling via `{"error":"Continue wait"}` pattern

**Success Criteria** (what must be TRUE):
  1. A chart-eliciting question produces a slide where the Vega-Lite spec from Cube AI is bound to rows fetched from Cube REST, rendered to PNG, and inserted via `ShapeFill.setImage()` in the correct layout region
  2. A table-eliciting question produces a slide where data fetched from Cube REST is rendered as a native PowerPoint table honoring `tableChartSpec` flags (row numbers, totals, pagination)
  3. Every composed slide includes: title (from `queryTitle`), subtitle (from `description`), visualization (chart or table), and commentary (from final `assistant.content`) placed in a dedicated commentary region
  4. When Cube REST returns `{"error":"Continue wait"}`, the add-in polls until data resolves or surfaces a clear timeout error — no crashes
  5. The deployment-specific Cube REST base URL and JWT are configurable via webpack DefinePlugin env vars (same pattern as `CUBEAI_API_KEY`)

**External prerequisites (must be resolved before planning):**
- [ ] Cube Cloud AI Agent 13 must be linked to the `dFdm_7Eleven` deployment (currently returns *"Agent does not have a deployment associated"*)
- [ ] Deployment-specific Cube REST API URL and JWT for `dFdm_7Eleven` must be provided
- [ ] Confirm the schema the agent emits SQL against matches the schema available via the data API (spike against agent 11 + deployment 52 revealed a mismatch — `sales_analysis_view` referenced in SQL but not present in `/meta`)

**Dependencies this phase will add:**
- `vega` and `vega-lite` npm packages (~500KB bundled) for in-browser chart rendering to canvas → PNG

**Plans**: 4 plans
Plans:
- [x] 05-01-PLAN.md — Wave 0 test infrastructure, 4 DefinePlugin env vars, 7 new requirement IDs, cubeai.ts onToolCall extension, cubeDataClient polling, sqlTranslator
- [x] 05-02-PLAN.md — Composer AI stack: Zod CompositionPlanSchema, byte-stable COMPOSER_SYSTEM_PROMPT_V1 (≥2048 tokens), composer.ts forced-tool streaming, compositionRetry G1/G2 guardrails, telemetry ring buffer
- [x] 05-03-PLAN.md — vegaRenderer (Vega-Lite → PNG), ComposedSlideContent type variant, composedRenderer (fractional regions → Office.js), tableRenderer extension (rowNumbers/totals), slideRenderer early-dispatch
- [x] 05-04-PLAN.md — SlidePreview 280×158 skeleton UI + custom shimmer, ChatPanel/WizardPanel/ReviewStep toolCall capture and D-02 routing, end-to-end UAT checkpoint

### Phase 6: Polish and Demo Readiness
**Goal**: The demo experience is complete — multi-turn conversation, streaming partial results, multi-slide output, and hardened error handling
**Depends on**: Phase 5
**Requirements**: CUBE-03, CUBE-04, TASK-04, MLTS-01, MLTS-02
**Success Criteria** (what must be TRUE):
  1. User asks a follow-up question ("now show Q3 data") and the response correctly uses the same chatId — conversation context is maintained across turns
  2. User can refine a previous result ("change to pie chart") without starting a new conversation
  3. Streaming partial AI text is visible in the taskpane as the response arrives, not only after completion
  4. A complex query (e.g., quarterly review) produces a coherent multi-slide section with consistent visual styling and logical flow between slides
**Plans**: 8 plans
Plans:
- [x] 06-01-PLAN.md — Wave 1 pure foundations: refinementDetector, retryBackoff, slideRouter routeMessage extension, config.validateConfig, constants/suggestedQuestions
- [x] 06-02-PLAN.md — Wave 2 Anthropic services: refinementClassifier (Haiku 4.5), metaComposer (Sonnet 4.6, >=2048-char cached prompt), compositionRetry 429 auto-retry
- [x] 06-03-PLAN.md — Wave 3 sectionOrchestrator: meta-composer + bounded-parallel per-slide composition + SerialMutex insertion + outer-AbortController cascade
- [x] 06-04-PLAN.md — Wave 4 UI atoms: SetupRequired, App.tsx credential gate, RefiningChip, SuggestedQuestionsTray, ReplaceOrAddChooser, ElapsedTimeCounter
- [x] 06-05-PLAN.md — Wave 5 SlidePreview extension (per-stage errors, awaiting-choice, outer-signal, skipAutoStart escape hatch — NO mini variant) + SectionStrip container (inline presentational mini cards)
- [x] 06-06-PLAN.md — Wave 6 ChatPanel refinement pipeline: refinement chip, tray, routeMessage (refinement / new-composition), classifier dispatch, runCompositionForRefinement with skipAutoStart SlidePreview, D-04 honest Replace via Office.js slide-id + slide.delete(), lastBuildRef at all 3 insertion sites
- [x] 06-07-PLAN.md — Wave 7 ChatPanel planSection preflight for ALL composition-route messages + SectionStrip mount (slideCount > 1) + WizardPanel/ReviewStep refinement affordance with D-03 classifier routing (both branches)
- [ ] 06-08-PLAN.md — Wave 8 end-to-end UAT checkpoint (7 scenarios: refinement chip, D-04 honest Replace, multi-slide section via planSection preflight, Setup-required, elapsed-time + streaming, stage retry, Wizard refinement with D-03 both branches)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 4.1 → 4.2 → 5 → 6

Note: Phase 2 and Phase 3 have no dependency on each other — both depend only on Phase 1. They can be planned in parallel but execute sequentially (Phase 2 first, as primitives must be proven before schema wiring in Phase 4).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete | 2026-03-23 |
| 2. Slide Primitives | 3/3 | Complete |  |
| 3. Cube AI Integration | 2/2 | Complete   | 2026-03-24 |
| 4. Schema and End-to-End Pipeline | 2/2 | Complete   | 2026-03-24 |
| 4.1. Guided Slide Builder | 2/2 | Complete | 2026-03-30 |
| 4.2. Deployment | 2/2 | Complete | 2026-03-30 |
| 5. Chart + Table Interpretation & Slide Composition | 0/4 | Not started | - |
| 6. Polish and Demo Readiness | 7/8 | In Progress | - |

### Phase 7: Conversational Routing & Response Taxonomy

**Description:** Add a judgement layer that classifies every assistant turn into a response taxonomy (clarify / data / modify / variant / section / refuse) and routes each class to the right pipeline (cube-ai stream, composer-only refinement, multi-slide orchestrator, plain conversational reply). Extends Phase 6's `refinementClassifier` so it fires on first-turn AND continuation contexts — not only refinements with a prior slide. Resolves the Phase 6 Wave 8 UAT gap where the addin treats agent responses as binary (toolCall vs no toolCall) and produces misleading affordances when the agent replies conversationally.

**Goal:** Every assistant turn passes through a 6-class response classifier (clarify | data | modify | variant | section | refuse) whose output deterministically selects the downstream pipeline (compose, refine, conversational reply, refuse) and the UI affordance shown — eliminating the Phase 6 Wave 8 UAT gap where every assistant response triggered slide affordances.
**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8, R9 (locked in 07-SPEC.md)
**Depends on:** Phase 6
**Plans:** 6 plans

Plans:
- [ ] 07-01-PLAN.md — Wave 0 test infra (jsdom + @testing-library), RED scaffolds for responseClassifier/responseDispatcher/clarify-refuse-suppression, Cube AI fixture file
- [ ] 07-02-PLAN.md — Wave 1 service files: responseClassifier.ts (Haiku 4.5 6-class), responseClassifierSystem.ts (<2048 chars decision tree), responseDispatcher.ts (facade + mapping helper + D-08 stage-2 chain)
- [ ] 07-03-PLAN.md — Wave 2 ChatPanel integration: lift handleSubmit to streamAndClassify, add responseClass field + initialMessages prop, suppress Create Slide on clarify/refuse
- [ ] 07-04-PLAN.md — Wave 2 WizardPanel + ReviewStep + sectionOrchestrator: dispatcher integration, conversational-reply bubble, precomputedPlan short-circuit on Stage A
- [ ] 07-05-PLAN.md — Wave 3 RefiningChip reconciliation (D-07): chip derives from classifier verdict (post-submit) AND scoreRefinementIntent predictor (pre-submit)
- [ ] 07-06-PLAN.md — Wave 4 manual UAT: dump-classifier-telemetry helper script + 5-scenario manual UAT (R6 latency p95 ≤ 600ms, R8 clarify/refuse/first-turn-modify)
