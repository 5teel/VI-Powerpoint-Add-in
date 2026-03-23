# Phase 2: Slide Primitives - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove every Office.js rendering API required by the project works in the target environment using hardcoded test data. Build text shape insertion (titles, bullets, key insight callouts), data table insertion, image placeholder insertion (for future charts), and multiple layout templates. All rendering uses test data — Cube AI integration happens in Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Slide Layout Templates
- **D-01:** Support both widescreen (16:9, 13.33" x 7.5") and standard (4:3, 10" x 7.5") with adaptive positioning that detects the active presentation's slide dimensions.
- **D-02:** Four layout templates required:
  1. **Text-only** — title + bullet points + key insight callout
  2. **Chart + text** — chart region (left or right) with text summary alongside
  3. **Table + text** — data table with title and summary text
  4. **Full combination** — chart + table + text on one slide (dense data view)
- **D-03:** New slides inserted at the current position in the deck (LYOT-03).

### Text Formatting
- **D-04:** Font choice and text formatting details deferred to UI-SPEC — Claude's discretion for now, with professional data presentation defaults.
- **D-05:** Key insight callout box styling deferred to UI-SPEC — Claude's discretion, prioritizing making the key takeaway unmissable.

### Table Styling
- **D-06:** Bold header row style — dark header row using Summit navy (#0F1330), white text, light body rows.
- **D-07:** Auto-format numbers by detected type: currency ($1,234), percentages (45.2%), plain numbers with commas (1,234).

### Trigger Mechanism
- **D-08:** Claude's discretion for Phase 2 test UI — whatever makes it easy to verify each primitive works. Phase 4 replaces this with the real Cube AI → slide pipeline.

### Claude's Discretion
- Font family and sizes (likely Calibri as PowerPoint default)
- Key insight callout visual treatment (highlighted box, bordered quote, or large text)
- Test trigger UI design (buttons per layout type, single cycling button, etc.)
- Exact positioning and sizing of layout regions

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Office.js API Surface
- `.planning/research/STACK.md` — Office.js API capabilities: addTextBox(), addTable(), ShapeFill.setImage(), no addChart()
- `.planning/research/ARCHITECTURE.md` — Component boundaries, PowerPointApi 1.8 requirement set
- `.planning/research/PITFALLS.md` — Layout/positioning pitfalls, coordinate system, slide dimensions

### Phase 1 Codebase (build on this)
- `src/taskpane/components/App.tsx` — Main app component to extend with test UI
- `src/taskpane/components/ChatPanel.tsx` — Existing chat panel (may need test buttons added)
- `src/taskpane/config.ts` — Configuration pattern
- `webpack.config.js` — Build configuration (port 3100)

### Project Context
- `.planning/PROJECT.md` — Project vision, constraints
- `.planning/REQUIREMENTS.md` — TEXT-01 through TEXT-04, TABL-01, TABL-02, LYOT-02, LYOT-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **App.tsx**: Main component — Phase 2 adds slide rendering capabilities triggered from here
- **ChatPanel.tsx**: Chat-style UI — test buttons could be added here or as a separate test panel
- **cubeai.ts**: Cube AI service — not used in Phase 2 (hardcoded test data), but architecture pattern for services folder

### Established Patterns
- React 18 + Fluent UI v9 components
- Services in `src/taskpane/services/`
- Components in `src/taskpane/components/`
- TypeScript strict mode

### Integration Points
- Phase 2 creates a slide rendering service (e.g., `src/taskpane/services/slideRenderer.ts`) that Phase 4 will wire to Cube AI output
- Layout templates become the rendering targets for the SlideLayout JSON schema in Phase 4

</code_context>

<specifics>
## Specific Ideas

- Tables should use Summit navy (#0F1330) for header rows — consistent with taskpane branding
- UI-SPEC should be generated before planning to lock down exact visual details (user requested this)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-slide-primitives*
*Context gathered: 2026-03-23*
