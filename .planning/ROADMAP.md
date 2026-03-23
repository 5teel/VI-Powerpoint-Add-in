# Roadmap: Summit VI for PowerPoint

## Overview

Summit VI for PowerPoint is built in six sequential phases, each de-risking a specific architectural unknown before the next depends on it. Phase 1 proves the add-in loads in PowerPoint and can reach Cube AI without CORS errors — two unknowns that would force significant rework if discovered late. Phase 2 verifies every Office.js rendering primitive works in the target environment before AI output is connected to it. Phase 3 proves the Cube AI streaming pipeline in isolation. Phase 4 wires them together through the SlideLayout schema to deliver the first end-to-end question-to-slide experience. Phase 5 adds the chart rendering pipeline (the highest-complexity element). Phase 6 completes the demo experience with multi-turn conversation, table rendering, streaming UX, and hardened error handling.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Scaffold add-in, load in PowerPoint taskpane, prove Cube AI API connectivity
- [ ] **Phase 2: Slide Primitives** - Verify all Office.js rendering APIs (text, tables, image insertion, layout)
- [ ] **Phase 3: Cube AI Integration** - Build and validate the full NDJSON streaming pipeline with error handling
- [ ] **Phase 4: Schema and End-to-End Pipeline** - Wire schema parser to slide renderer for first working question-to-slide
- [ ] **Phase 5: Chart Rendering** - Chart.js canvas pipeline producing bar, line, and pie charts inserted as images
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
**Plans**: TBD

### Phase 2: Slide Primitives
**Goal**: Every Office.js rendering capability required by the project is individually proven to work in the target environment
**Depends on**: Phase 1
**Requirements**: TEXT-01, TEXT-02, TEXT-03, TEXT-04, TABL-01, TABL-02, LYOT-02, LYOT-03
**Success Criteria** (what must be TRUE):
  1. A slide is inserted at the current deck position containing a title, body text (bullets), and a key insight callout box with correct fonts and alignment
  2. A data table is inserted on a slide with headers, data rows, borders, alignment, and number formatting
  3. A placeholder image is inserted into a slide shape via ShapeFill.setImage() occupying the correct layout region
  4. Multiple layout templates (text-only, chart+text, table+text) produce non-overlapping elements in the correct positions
**Plans**: TBD

### Phase 3: Cube AI Integration
**Goal**: The add-in reliably streams, buffers, and parses NDJSON responses from Cube AI with correct error handling
**Depends on**: Phase 1
**Requirements**: CUBE-01, CUBE-02, TASK-02, TASK-03
**Success Criteria** (what must be TRUE):
  1. The add-in authenticates to Cube AI via API key and initiates a streaming NDJSON request
  2. Partial response lines are buffered correctly across chunk boundaries — no dropped or malformed lines
  3. A loading/progress indicator is visible in the taskpane for the full duration of the API call (3-15 seconds)
  4. When an API call fails or returns a malformed response, a clear error message is displayed in the taskpane (not a blank screen or crash)
**Plans**: TBD

### Phase 4: Schema and End-to-End Pipeline
**Goal**: A user can type a business question, Cube AI returns a conforming JSON slide schema, and a fully populated slide appears in PowerPoint
**Depends on**: Phase 2, Phase 3
**Requirements**: SCHM-01, SCHM-02, SCHM-03, TASK-01, LYOT-01
**Success Criteria** (what must be TRUE):
  1. User types a natural language question in the taskpane input and submits it
  2. Cube AI returns JSON matching the SlideLayout schema and a new slide is created in the active presentation
  3. Cube AI's schema output determines the layout type (text-only, chart, table, or combination) and the correct layout template is applied
  4. When Cube AI returns malformed or non-conforming JSON, the parser recovers gracefully and either renders a degraded slide or shows a user-facing error — it does not crash
**Plans**: TBD

### Phase 5: Chart Rendering
**Goal**: Bar, line, and pie chart data from Cube AI JSON is rendered as correctly sized images and inserted into slides
**Depends on**: Phase 4
**Requirements**: CHRT-01, CHRT-02, CHRT-03, CHRT-04
**Success Criteria** (what must be TRUE):
  1. A question that returns chart data produces a bar chart rendered from that data and inserted into the slide in the correct layout region
  2. Line charts and pie charts are rendered correctly from Cube AI data using the same pipeline
  3. Charts are inserted via ShapeFill.setImage() on a geometric shape (GA path) and the code includes addPicture() as a detectable enhancement for Preview-capable environments
  4. Chart images are rendered at sufficient resolution (~800x600px) to be legible when displayed on a standard slide
**Plans**: TBD

### Phase 6: Polish and Demo Readiness
**Goal**: The demo experience is complete — multi-turn conversation, streaming partial results, multi-slide output, and hardened error handling
**Depends on**: Phase 5
**Requirements**: CUBE-03, CUBE-04, TASK-04, MLTS-01, MLTS-02
**Success Criteria** (what must be TRUE):
  1. User asks a follow-up question ("now show Q3 data") and the response correctly uses the same chatId — conversation context is maintained across turns
  2. User can refine a previous result ("change to pie chart") without starting a new conversation
  3. Streaming partial AI text is visible in the taskpane as the response arrives, not only after completion
  4. A complex query (e.g., quarterly review) produces a coherent multi-slide section with consistent visual styling and logical flow between slides
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

Note: Phase 2 and Phase 3 have no dependency on each other — both depend only on Phase 1. They can be planned in parallel but execute sequentially (Phase 2 first, as primitives must be proven before schema wiring in Phase 4).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/TBD | Not started | - |
| 2. Slide Primitives | 0/TBD | Not started | - |
| 3. Cube AI Integration | 0/TBD | Not started | - |
| 4. Schema and End-to-End Pipeline | 0/TBD | Not started | - |
| 5. Chart Rendering | 0/TBD | Not started | - |
| 6. Polish and Demo Readiness | 0/TBD | Not started | - |
