# Requirements: Summit VI for PowerPoint

**Defined:** 2026-03-23
**Core Value:** Users can ask a business question in natural language and get a professionally laid-out PowerPoint slide populated with real data insights

## v1 Requirements

Requirements for internal demo release. Each maps to roadmap phases.

### Taskpane Input

- [ ] **TASK-01**: User can type a natural language business question in the taskpane input
- [ ] **TASK-02**: User sees loading/progress indication while Cube AI processes (3-15s)
- [ ] **TASK-03**: User sees clear error messages when API calls fail or responses are malformed
- [ ] **TASK-04**: User sees streaming partial AI results in the taskpane as they arrive from Cube AI

### Cube AI Integration

- [ ] **CUBE-01**: Add-in connects directly to Cube AI Chat API via HTTPS with API key authentication
- [ ] **CUBE-02**: Add-in parses streaming NDJSON responses with correct line buffering across chunk boundaries
- [ ] **CUBE-03**: User can ask follow-up questions that maintain conversation context via Cube AI chatId
- [ ] **CUBE-04**: User can refine previous results ("change to pie chart", "add Q3 numbers") without starting over

### Slide Schema

- [ ] **SCHM-01**: JSON slide schema defines supported layout types, content blocks, chart configs, and table structures
- [ ] **SCHM-02**: Cube AI is prompted to return structured JSON matching the slide schema alongside natural language insights
- [ ] **SCHM-03**: Schema parser validates Cube AI JSON output and handles malformed/partial responses gracefully

### Text Rendering

- [ ] **TEXT-01**: Add-in renders slide titles from Cube AI response
- [ ] **TEXT-02**: Add-in renders body text (bullet points, paragraphs) from Cube AI response
- [ ] **TEXT-03**: Add-in renders key insight callout box highlighting the most important takeaway
- [ ] **TEXT-04**: Generated text uses professional formatting (consistent fonts, spacing, alignment)

### Chart Rendering

- [ ] **CHRT-01**: Add-in renders bar charts from Cube AI data using Chart.js canvas-to-base64 pipeline
- [ ] **CHRT-02**: Add-in renders line charts from Cube AI data
- [ ] **CHRT-03**: Add-in renders pie charts from Cube AI data
- [ ] **CHRT-04**: Charts are inserted as images via ShapeFill.setImage() (GA API) with addPicture() as progressive enhancement

### Table Rendering

- [ ] **TABL-01**: Add-in renders formatted data tables on slides via Office.js addTable()
- [ ] **TABL-02**: Tables include headers, data rows, and basic cell formatting (borders, alignment, number formatting)

### Layout Intelligence

- [ ] **LYOT-01**: Cube AI determines the appropriate layout type based on data (chart vs table vs bullets vs combination)
- [ ] **LYOT-02**: Add-in supports multiple layout templates (text-only, chart+text, table+text, chart+table+text)
- [ ] **LYOT-03**: New slides are inserted at the current position in the deck

### Multi-Slide Generation

- [ ] **MLTS-01**: Complex queries produce coherent multi-slide sections (e.g., quarterly review = title + data slides + summary)
- [ ] **MLTS-02**: Multi-slide sets maintain visual consistency and logical flow

### Branding

- [ ] **BRND-01**: Taskpane displays "Summit VI" branding (name, minimal styling)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Visuals

- **EVIS-01**: Source attribution footnotes on slides (data source, query date, confidence)
- **EVIS-02**: Native editable PowerPoint charts (if Office.js adds chart API or via PptxGenJS insertSlidesFromBase64)

### Advanced Interaction

- **AINT-01**: Pre-built report templates (user picks template, plugin fills with data)
- **AINT-02**: Slide design respects active presentation's theme/styles

### Authentication

- **AUTH-01**: User authentication for multi-tenant isolation (client-facing deployment)
- **AUTH-02**: Per-user API key management

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full deck generation from single prompt | Massive complexity, not the core value (Gamma/Tome territory) |
| Design template library | Huge design effort, users already have company templates |
| Image generation (DALL-E style) | Scope creep, Cube AI returns data not creative imagery |
| Speaker notes AI | Nice-to-have, not demo-critical |
| Real-time collaboration features | PowerPoint already handles co-authoring |
| Offline caching of insights | Stale data worse than no data for live data tool |
| PowerPoint animation/transition control | Low value, users can add their own |
| Export to other formats | PowerPoint handles export natively |
| AppSource deployment | Internal sideload only for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TASK-01 | Phase 4 | Pending |
| TASK-02 | Phase 3 | Pending |
| TASK-03 | Phase 3 | Pending |
| TASK-04 | Phase 6 | Pending |
| CUBE-01 | Phase 3 | Pending |
| CUBE-02 | Phase 3 | Pending |
| CUBE-03 | Phase 6 | Pending |
| CUBE-04 | Phase 6 | Pending |
| SCHM-01 | Phase 4 | Pending |
| SCHM-02 | Phase 4 | Pending |
| SCHM-03 | Phase 4 | Pending |
| TEXT-01 | Phase 2 | Pending |
| TEXT-02 | Phase 2 | Pending |
| TEXT-03 | Phase 2 | Pending |
| TEXT-04 | Phase 2 | Pending |
| CHRT-01 | Phase 5 | Pending |
| CHRT-02 | Phase 5 | Pending |
| CHRT-03 | Phase 5 | Pending |
| CHRT-04 | Phase 5 | Pending |
| TABL-01 | Phase 2 | Pending |
| TABL-02 | Phase 2 | Pending |
| LYOT-01 | Phase 4 | Pending |
| LYOT-02 | Phase 2 | Pending |
| LYOT-03 | Phase 2 | Pending |
| MLTS-01 | Phase 6 | Pending |
| MLTS-02 | Phase 6 | Pending |
| BRND-01 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-03-23*
*Last updated: 2026-03-23 after roadmap creation — all 27 requirements mapped*
