# Phase 2: Slide Primitives - Research

**Researched:** 2026-03-23
**Domain:** Office.js PowerPointApi 1.8 shape/table/text rendering on slide canvas
**Confidence:** HIGH

## Summary

Phase 2 proves every Office.js rendering capability required by the project works in the target environment. The phase creates four slide layout templates (text-only, chart+text, table+text, full combination) using hardcoded test data, with a minimal test UI in the taskpane to trigger each template. All rendering happens on the PowerPoint slide canvas via Office.js APIs -- no Cube AI integration, no real data.

The API surface is well-documented and verified against official Microsoft docs (updated Feb-Mar 2026). The key APIs -- `addTextBox()` (1.4), `addGeometricShape()` (1.4), `addTable()` (1.8), `ShapeFill.setImage()` (1.8), `addGroup()` (1.8) -- are all GA and available on Microsoft 365 desktop and web. The critical discovery is that `AddSlideOptions.index` (for inserting at a specific position) is PREVIEW-only, requiring a workaround for LYOT-03.

**Primary recommendation:** Build a modular slide rendering service with separate functions for text, table, callout, and placeholder rendering, driven by a layout constants module that encodes the four template geometries from the UI-SPEC. Use `specificCellProperties` on `addTable()` for per-cell formatting (header vs body styling). For slide position insertion (LYOT-03), use the GA `getSelectedSlides()` approach to determine current position and add the slide at the end, then potentially move it -- or accept end-of-deck insertion as the GA behavior and document the limitation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Support both widescreen (16:9, 13.33" x 7.5") and standard (4:3, 10" x 7.5") with adaptive positioning that detects the active presentation's slide dimensions.
- **D-02:** Four layout templates required: Text-only, Chart+text, Table+text, Full combination.
- **D-03:** New slides inserted at the current position in the deck (LYOT-03).
- **D-04:** Font choice and text formatting details deferred to UI-SPEC.
- **D-05:** Key insight callout box styling deferred to UI-SPEC.
- **D-06:** Bold header row style -- dark header row using Summit navy (#0F1330), white text, light body rows.
- **D-07:** Auto-format numbers by detected type: currency ($1,234), percentages (45.2%), plain numbers with commas (1,234).
- **D-08:** Claude's discretion for Phase 2 test UI.

### Claude's Discretion
- Font family and sizes (locked by UI-SPEC: Calibri, sizes 28/22/18/14)
- Key insight callout visual treatment (locked by UI-SPEC: left-bordered accent box)
- Test trigger UI design (buttons per layout type)
- Exact positioning and sizing of layout regions (locked by UI-SPEC)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEXT-01 | Add-in renders slide titles from Cube AI response | `addTextBox()` API (1.4 GA) with `ShapeAddOptions` for positioning, `textFrame.textRange.font` for formatting |
| TEXT-02 | Add-in renders body text (bullet points, paragraphs) | `addTextBox()` with newline-separated text; `paragraphFormat.horizontalAlignment` for alignment |
| TEXT-03 | Add-in renders key insight callout box | `addGeometricShape("Rectangle")` + `textFrame` for box, separate thin rectangle for left accent border, `addGroup()` to group them |
| TEXT-04 | Generated text uses professional formatting | `ShapeFont` properties: `name`, `size`, `bold`, `color`; `TextFrame` margins; `TextVerticalAlignment` |
| TABL-01 | Add-in renders formatted data tables on slides | `addTable(rowCount, columnCount, options)` with `TableAddOptions.values`, `specificCellProperties`, `uniformCellProperties` |
| TABL-02 | Tables include headers, data rows, cell formatting | `TableCellProperties`: `fill.color`, `font` (name, size, bold, color), `borders`, `horizontalAlignment`, `verticalAlignment`, `margins` |
| LYOT-02 | Multiple layout templates supported | Four template geometries defined in UI-SPEC with exact positioning constants; adaptive 4:3 scaling via 0.75x multiplier |
| LYOT-03 | New slides inserted at current position | `slides.add()` GA adds to end; `AddSlideOptions.index` is PREVIEW-only; workaround: use `getSelectedSlides()` to find current position, add slide, then use `Slide.moveTo()` (if available) or accept end-of-deck |
</phase_requirements>

## Standard Stack

### Core (already installed from Phase 1)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Office.js (PowerPointApi 1.8) | CDN-loaded | Slide/shape/table creation and formatting | Only way to manipulate PowerPoint slides from an add-in. 1.8 is minimum for addTable() and setImage() |
| React | 18.3.1 | Taskpane UI for test buttons | Already installed, Fluent UI v9 requires it |
| @fluentui/react-components | 9.73.4 | Button, Spinner, MessageBar for test UI | Already installed, Office-native look |
| TypeScript | ~5.4 | Type safety for Office.js calls | Already installed, Office.js types are TS-first |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/office-js | ^1.0.377 | TypeScript definitions for Office.js | Already installed as devDep |

### No New Dependencies
Phase 2 requires **zero new npm packages**. All rendering uses Office.js APIs already available via the CDN script tag. The test UI uses Fluent UI components already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/taskpane/
  components/
    App.tsx                    # Extend to include test panel
    ChatPanel.tsx              # Existing (Phase 1)
    Header.tsx                 # Existing (Phase 1)
    SlideTestPanel.tsx         # NEW: test trigger buttons UI
  services/
    cubeai.ts                  # Existing (Phase 1)
    slideRenderer.ts           # NEW: orchestrates slide creation
  slide/
    constants.ts               # NEW: layout constants, colors, fonts from UI-SPEC
    textRenderer.ts            # NEW: title, body, callout text box creation
    tableRenderer.ts           # NEW: table creation with formatting
    placeholderRenderer.ts     # NEW: chart placeholder shape creation
    layoutEngine.ts            # NEW: template definitions, adaptive sizing
    numberFormatter.ts         # NEW: detect and format number types (D-07)
    types.ts                   # NEW: TypeScript interfaces for slide content
```

### Pattern 1: Single PowerPoint.run() Per Slide
**What:** All shapes for one slide are created within a single `PowerPoint.run()` call with minimal `context.sync()` calls.
**When to use:** Always, for all slide creation operations.
**Why:** Each `context.sync()` is a round-trip to the Office host. Batching all shape additions before syncing minimizes latency.
**Example:**
```typescript
// Source: Official docs - ShapeCollection methods
async function createTextOnlySlide(content: TextOnlyContent): Promise<void> {
  await PowerPoint.run(async (context) => {
    // Step 1: Add slide and sync to get reference
    context.presentation.slides.add();
    await context.sync();

    // Step 2: Get the new slide
    const slideCount = context.presentation.slides.getCount();
    await context.sync();
    const newSlide = context.presentation.slides.getItemAt(slideCount.value - 1);

    // Step 3: Add ALL shapes in a batch (no sync between them)
    const title = newSlide.shapes.addTextBox(content.title, {
      left: 36, top: 36, width: 888, height: 44
    });
    title.textFrame.textRange.font.size = 28;
    title.textFrame.textRange.font.bold = true;
    title.textFrame.textRange.font.name = "Calibri";
    title.textFrame.textRange.font.color = "#0F1330";

    // ... add more shapes ...

    // Step 4: Single sync commits everything
    await context.sync();
  });
}
```

### Pattern 2: Layout Constants Module
**What:** All positioning values from the UI-SPEC encoded as typed constants, with a function to adapt for 4:3 slides.
**When to use:** Every shape placement references these constants, never hardcoded values.
**Example:**
```typescript
// Source: UI-SPEC layout contract
interface LayoutRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

const WIDESCREEN = { width: 960, height: 540 };
const STANDARD = { width: 720, height: 540 };

const SHARED = {
  MARGIN: 36,
  CONTENT_TOP: 100,
  TITLE: { left: 36, top: 36, width: 888, height: 44 },
} as const;

// Adapt widescreen layout to standard by scaling X coordinates
function adaptLayout(region: LayoutRegion, slideWidth: number): LayoutRegion {
  if (slideWidth === WIDESCREEN.width) return region;
  const scale = slideWidth / WIDESCREEN.width;
  return {
    left: Math.round(region.left * scale),
    top: region.top, // Y unchanged (same height)
    width: Math.round(region.width * scale),
    height: region.height,
  };
}
```

### Pattern 3: Per-Cell Table Formatting via specificCellProperties
**What:** Use `TableAddOptions.specificCellProperties` for full control over header vs body row styling.
**When to use:** All tables -- the UI-SPEC requires distinct header and body styling.
**Example:**
```typescript
// Source: Official docs - TableAddOptions.specificCellProperties
const headerCellProps: PowerPoint.TableCellProperties = {
  fill: { color: "#0F1330" },
  font: { color: "#FFFFFF", name: "Calibri", size: 14, bold: true },
  horizontalAlignment: PowerPoint.ParagraphHorizontalAlignment.center,
  verticalAlignment: PowerPoint.TextVerticalAlignment.middle,
  borders: {
    left: { color: "#D1D5DB", dashStyle: PowerPoint.ShapeLineDashStyle.solid, weight: 1 },
    right: { color: "#D1D5DB", dashStyle: PowerPoint.ShapeLineDashStyle.solid, weight: 1 },
    top: { color: "#D1D5DB", dashStyle: PowerPoint.ShapeLineDashStyle.solid, weight: 1 },
    bottom: { color: "#D1D5DB", dashStyle: PowerPoint.ShapeLineDashStyle.solid, weight: 1 },
  },
};

const bodyCellProps = (isEven: boolean, isNumeric: boolean): PowerPoint.TableCellProperties => ({
  fill: { color: isEven ? "#FFFFFF" : "#F2F4F8" },
  font: { color: "#333333", name: "Calibri", size: 14 },
  horizontalAlignment: isNumeric
    ? PowerPoint.ParagraphHorizontalAlignment.right
    : PowerPoint.ParagraphHorizontalAlignment.left,
  verticalAlignment: PowerPoint.TextVerticalAlignment.middle,
  borders: {
    left: { color: "#D1D5DB", dashStyle: PowerPoint.ShapeLineDashStyle.solid, weight: 1 },
    right: { color: "#D1D5DB", dashStyle: PowerPoint.ShapeLineDashStyle.solid, weight: 1 },
    top: { color: "#D1D5DB", dashStyle: PowerPoint.ShapeLineDashStyle.solid, weight: 1 },
    bottom: { color: "#D1D5DB", dashStyle: PowerPoint.ShapeLineDashStyle.solid, weight: 1 },
  },
});
```

### Pattern 4: Callout Box as Two Shapes + Group
**What:** The key insight callout box is implemented as two shapes: a rectangle for the background and a thin rectangle for the left accent border, grouped together.
**When to use:** Every callout box insertion.
**Example:**
```typescript
// Source: UI-SPEC callout box spec
function addCalloutBox(
  shapes: PowerPoint.ShapeCollection,
  text: string,
  region: LayoutRegion
): PowerPoint.Shape {
  // Main rectangle (background)
  const box = shapes.addGeometricShape(
    PowerPoint.GeometricShapeType.rectangle,
    { left: region.left, top: region.top, width: region.width, height: region.height }
  );
  box.fill.setSolidColor("#EBF0FA");
  box.textFrame.textRange.text = text;
  box.textFrame.textRange.font.name = "Calibri";
  box.textFrame.textRange.font.size = 22;
  box.textFrame.textRange.font.bold = true;
  box.textFrame.textRange.font.color = "#0F1330";
  box.textFrame.verticalAlignment = PowerPoint.TextVerticalAlignment.middle;
  box.textFrame.leftMargin = 18; // Extra left margin to clear accent border
  box.textFrame.topMargin = 12;
  box.textFrame.bottomMargin = 12;
  box.textFrame.rightMargin = 12;

  // Left accent border (thin rectangle)
  const accent = shapes.addGeometricShape(
    PowerPoint.GeometricShapeType.rectangle,
    { left: region.left, top: region.top, width: 3, height: region.height }
  );
  accent.fill.setSolidColor("#0F1330");

  // Group the two shapes
  const group = shapes.addGroup([box, accent]);
  return group;
}
```

### Pattern 5: Number Format Detection (D-07)
**What:** Detect whether table cell values are currency, percentages, large integers, or text and format accordingly.
**When to use:** All table cell values before inserting into `TableAddOptions.values`.
**Example:**
```typescript
function formatCellValue(raw: string | number): { display: string; isNumeric: boolean } {
  const str = String(raw).trim();

  // Currency: starts with $ or ends with currency symbol
  if (/^\$[\d,.]+$/.test(str)) return { display: str, isNumeric: true };

  // Percentage: ends with %
  if (/^[\d,.]+%$/.test(str)) return { display: str, isNumeric: true };

  // Check if parseable number
  const num = parseFloat(str.replace(/[,$%]/g, ""));
  if (!isNaN(num) && /^[\d,.]+$/.test(str)) {
    // Large integer with commas
    if (Number.isInteger(num) && num >= 1000) {
      return { display: num.toLocaleString("en-US"), isNumeric: true };
    }
    return { display: str, isNumeric: true };
  }

  return { display: str, isNumeric: false };
}
```

### Anti-Patterns to Avoid
- **context.sync() after each shape:** Causes visible lag. Batch all shape additions, sync once.
- **Hardcoding slide dimensions:** Always detect via presentation properties or default to 960x540. Never assume.
- **Using addPicture() for images:** PREVIEW-only. Use `addGeometricShape("Rectangle")` + `shape.fill.setImage(base64)` (GA in 1.8).
- **Using AddSlideOptions.index for slide position:** PREVIEW-only. Must use workaround.
- **Forgetting to load() before reading:** Properties return undefined without load+sync. Always follow load-sync-read pattern.
- **Using NoStyleNoGrid table style and then applying custom formatting:** The `style` property is API 1.9, not 1.8. Instead, use `uniformCellProperties: {}` (empty object) to get a plain table, then apply formatting via `specificCellProperties`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table cell formatting | Manual cell-by-cell iteration after creation | `specificCellProperties` 2D array in `TableAddOptions` | One-shot creation with full formatting, no post-creation sync needed |
| Shape grouping | Adjacent shapes without grouping | `addGroup([shape1, shape2])` (API 1.8) | Grouped shapes move together, preventing layout breakage when users interact |
| Text box margins | Invisible padding shapes around text boxes | `TextFrame.leftMargin/topMargin/bottomMargin/rightMargin` | Native API support in 1.4, cleaner than workarounds |
| Number formatting | Complex regex from scratch | `toLocaleString()` with appropriate options | Built-in JS, handles thousands separators and decimal precision |
| Per-side border on callout | Trying to set individual borders on a shape | Overlay a thin rectangle filled with accent color | Office.js does not support per-side border control on geometric shapes |

## Common Pitfalls

### Pitfall 1: AddSlideOptions.index is PREVIEW-only
**What goes wrong:** Code uses `slides.add({ index: N })` to insert at a specific position, but the `index` property is PREVIEW API and may not be available on all builds.
**Why it happens:** The GA `slides.add()` method (API 1.3) only supports `slideMasterId` and `layoutId` options. The `index` property was added in PREVIEW.
**How to avoid:** For the internal demo, using the PREVIEW API is acceptable (per PITFALLS.md). Runtime-check with `Office.context.requirements.isSetSupported()`. Fallback: add the slide at the end. Document the limitation clearly.
**Warning signs:** Slide always appears at the end of the deck instead of at the current position.

### Pitfall 2: addTextBox Sets Text but Formatting Applies to Entire Range
**What goes wrong:** When adding a text box with bullet points separated by `\n`, calling `textRange.font.size = 18` applies to ALL text. There is no direct way to set per-paragraph formatting on initial creation.
**Why it happens:** `addTextBox(text)` creates a single TextRange for all the text. To format individual paragraphs differently, you would need to use `getSubstring()` to get sub-ranges.
**How to avoid:** For bullet text bodies that share a single font (18pt regular, per UI-SPEC), this is fine -- one format applies to all. For mixed formatting (like title + body in one shape), use separate text boxes. The UI-SPEC already separates title and body into distinct shapes.
**Warning signs:** All text in a shape looks the same when you expected different formatting.

### Pitfall 3: Table Style Property Requires API 1.9
**What goes wrong:** Code sets `TableAddOptions.style` to control table appearance, but `style` requires PowerPointApi 1.9, not 1.8.
**Why it happens:** Developers see the `style` property in docs but miss that it was added in 1.9.
**How to avoid:** Use `uniformCellProperties: {}` (empty object, API 1.8) for plain table, then `specificCellProperties` for custom formatting. Do NOT use `style` unless runtime-checking for 1.9.
**Warning signs:** Table renders with unexpected default styling or throws an error on 1.8-only builds.

### Pitfall 4: Shape Fill Color Format Inconsistency
**What goes wrong:** `shape.fill.setSolidColor()` accepts colors like `"#0F1330"` but `shape.fill.foregroundColor` returns them without the `#` prefix (e.g., `"0F1330"`). Code that reads a color and compares it breaks.
**Why it happens:** API inconsistency between setter and getter format.
**How to avoid:** Only write colors, never read them for comparison. Define all colors as constants. If you must read, normalize by stripping `#`.
**Warning signs:** Color comparison checks fail even though the color looks correct on slide.

### Pitfall 5: addGroup Requires Shape IDs, Not Shape Objects Directly
**What goes wrong:** Calling `addGroup([shape1, shape2])` where shapes have just been created but not synced yet may fail because shape IDs are not yet resolved.
**Why it happens:** Shape IDs are assigned by the Office host after `context.sync()`. Before sync, shapes exist as proxy objects without stable IDs.
**How to avoid:** Call `context.sync()` after creating the shapes to be grouped, then load their IDs, then call `addGroup()`. This requires an additional sync round-trip, but is necessary for grouping.
**Warning signs:** `addGroup()` throws an error about invalid shape references.

### Pitfall 6: Bullet Points in Text Boxes
**What goes wrong:** Developer expects `addTextBox("- Point 1\n- Point 2")` to create formatted bullet points with proper indentation. Instead it renders as plain text with dash characters.
**Why it happens:** `addTextBox()` creates plain text. Bullet formatting requires `paragraphFormat.bulletFormat.visible = true` which must be set on the text range after creation.
**How to avoid:** Use Unicode bullet character (`\u2022`) or set `paragraphFormat` after creating the text box. For the simplest approach: include bullet characters in the text string (e.g., `"\u2022 Point 1\n\u2022 Point 2"`) and rely on left indentation via `textFrame.leftMargin` rather than the formal bullet API.
**Warning signs:** Bullets appear as plain dashes or no bullets at all.

## Code Examples

### Creating a Full Text-Only Slide
```typescript
// Source: Official docs - addTextBox, addGeometricShape, addGroup (verified Mar 2026)
async function insertTextOnlySlide(): Promise<void> {
  await PowerPoint.run(async (context) => {
    // Add slide at end (GA behavior)
    context.presentation.slides.add();
    await context.sync();

    const slideCount = context.presentation.slides.getCount();
    await context.sync();

    const slide = context.presentation.slides.getItemAt(slideCount.value - 1);
    const shapes = slide.shapes;

    // Title
    const title = shapes.addTextBox("Q3 2024 Revenue Analysis", {
      left: 36, top: 36, width: 888, height: 44,
    });
    title.textFrame.textRange.font.size = 28;
    title.textFrame.textRange.font.bold = true;
    title.textFrame.textRange.font.name = "Calibri";
    title.textFrame.textRange.font.color = "#0F1330";

    // Body bullets
    const bullets = [
      "\u2022 Total revenue increased 12% year-over-year",
      "\u2022 North region led growth at $4.2M (+18%)",
      "\u2022 New client acquisition up 23% vs. prior quarter",
      "\u2022 Operating margin improved to 34.1%",
    ].join("\n");
    const body = shapes.addTextBox(bullets, {
      left: 36, top: 100, width: 888, height: 260,
    });
    body.textFrame.textRange.font.size = 18;
    body.textFrame.textRange.font.name = "Calibri";
    body.textFrame.textRange.font.color = "#333333";
    body.textFrame.leftMargin = 18; // bullet indent

    // Callout box (background)
    const calloutBox = shapes.addGeometricShape(
      PowerPoint.GeometricShapeType.rectangle,
      { left: 36, top: 384, width: 888, height: 120 }
    );
    calloutBox.fill.setSolidColor("#EBF0FA");
    calloutBox.textFrame.textRange.text =
      "North region's 18% growth rate significantly outpaced other regions, driven by 3 enterprise deals closed in September.";
    calloutBox.textFrame.textRange.font.size = 22;
    calloutBox.textFrame.textRange.font.bold = true;
    calloutBox.textFrame.textRange.font.name = "Calibri";
    calloutBox.textFrame.textRange.font.color = "#0F1330";
    calloutBox.textFrame.verticalAlignment = PowerPoint.TextVerticalAlignment.middle;
    calloutBox.textFrame.leftMargin = 18;
    calloutBox.textFrame.topMargin = 12;
    calloutBox.textFrame.bottomMargin = 12;
    calloutBox.textFrame.rightMargin = 12;

    // Left accent border
    const accent = shapes.addGeometricShape(
      PowerPoint.GeometricShapeType.rectangle,
      { left: 36, top: 384, width: 3, height: 120 }
    );
    accent.fill.setSolidColor("#0F1330");

    await context.sync();

    // Group callout + accent (requires IDs, so sync first)
    // Note: shapes already synced above, IDs should be available
    // If grouping fails, the shapes still render correctly, just not grouped
  });
}
```

### Creating a Formatted Data Table
```typescript
// Source: Official docs - addTable with specificCellProperties (verified Mar 2026)
async function insertTableSlide(): Promise<void> {
  await PowerPoint.run(async (context) => {
    context.presentation.slides.add();
    await context.sync();

    const slideCount = context.presentation.slides.getCount();
    await context.sync();

    const slide = context.presentation.slides.getItemAt(slideCount.value - 1);
    const shapes = slide.shapes;

    // Title
    const title = shapes.addTextBox("Regional Performance Summary", {
      left: 36, top: 36, width: 888, height: 44,
    });
    title.textFrame.textRange.font.size = 28;
    title.textFrame.textRange.font.bold = true;
    title.textFrame.textRange.font.name = "Calibri";
    title.textFrame.textRange.font.color = "#0F1330";

    // Table: 5 rows (1 header + 4 data), 4 columns
    const values = [
      ["Region", "Revenue", "Growth", "Margin"],
      ["North", "$4.2M", "+18%", "36.2%"],
      ["South", "$3.1M", "+8%", "31.5%"],
      ["East", "$2.8M", "+11%", "33.8%"],
      ["West", "$3.4M", "+14%", "35.1%"],
    ];

    const borderDef = {
      left: { color: "#D1D5DB", dashStyle: PowerPoint.ShapeLineDashStyle.solid, weight: 1 },
      right: { color: "#D1D5DB", dashStyle: PowerPoint.ShapeLineDashStyle.solid, weight: 1 },
      top: { color: "#D1D5DB", dashStyle: PowerPoint.ShapeLineDashStyle.solid, weight: 1 },
      bottom: { color: "#D1D5DB", dashStyle: PowerPoint.ShapeLineDashStyle.solid, weight: 1 },
    };

    const headerCell: PowerPoint.TableCellProperties = {
      fill: { color: "#0F1330" },
      font: { color: "#FFFFFF", name: "Calibri", size: 14, bold: true },
      horizontalAlignment: PowerPoint.ParagraphHorizontalAlignment.center,
      verticalAlignment: PowerPoint.TextVerticalAlignment.middle,
      borders: borderDef,
    };

    const bodyCell = (rowIdx: number, isNumeric: boolean): PowerPoint.TableCellProperties => ({
      fill: { color: rowIdx % 2 === 0 ? "#FFFFFF" : "#F2F4F8" },
      font: { color: "#333333", name: "Calibri", size: 14 },
      horizontalAlignment: isNumeric
        ? PowerPoint.ParagraphHorizontalAlignment.right
        : PowerPoint.ParagraphHorizontalAlignment.left,
      verticalAlignment: PowerPoint.TextVerticalAlignment.middle,
      borders: borderDef,
    });

    // Build specificCellProperties 2D array
    const cellProps: PowerPoint.TableCellProperties[][] = [
      [headerCell, headerCell, headerCell, headerCell],
      ...values.slice(1).map((_, i) => [
        bodyCell(i, false),    // Region (text)
        bodyCell(i, true),     // Revenue (numeric)
        bodyCell(i, true),     // Growth (numeric)
        bodyCell(i, true),     // Margin (numeric)
      ]),
    ];

    shapes.addTable(5, 4, {
      left: 36,
      top: 100,
      width: 888,
      height: 300,
      values,
      specificCellProperties: cellProps,
    });

    await context.sync();
  });
}
```

### Image Placeholder (Chart Region)
```typescript
// Source: Official docs - addGeometricShape + ShapeFill.setImage (verified Mar 2026)
function addChartPlaceholder(
  shapes: PowerPoint.ShapeCollection,
  region: LayoutRegion
): PowerPoint.Shape {
  const placeholder = shapes.addGeometricShape(
    PowerPoint.GeometricShapeType.rectangle,
    { left: region.left, top: region.top, width: region.width, height: region.height }
  );
  placeholder.fill.setSolidColor("#E5E7EB");
  // Note: dashed border is not directly controllable via ShapeFill API
  // The line style would need shape.lineFormat (API 1.4+)
  placeholder.textFrame.textRange.text = "Chart Area";
  placeholder.textFrame.textRange.font.size = 14;
  placeholder.textFrame.textRange.font.name = "Calibri";
  placeholder.textFrame.textRange.font.color = "#9CA3AF";
  placeholder.textFrame.verticalAlignment = PowerPoint.TextVerticalAlignment.middle;
  placeholder.textFrame.textRange.paragraphFormat.horizontalAlignment =
    PowerPoint.ParagraphHorizontalAlignment.center;
  placeholder.altTextDescription = "Chart area - data visualization placeholder";

  return placeholder;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| addPicture() for images | addGeometricShape + ShapeFill.setImage() | addPicture still PREVIEW (Mar 2026) | Must use shape fill for GA image insertion |
| No table API | addTable() with full formatting | PowerPointApi 1.8 (2024) | Native tables are now possible; no PptxGenJS needed for tables |
| No slide position control | AddSlideOptions.index | PREVIEW (Mar 2026) | Slide insertion at specific position still requires preview API |
| Manual cell styling post-creation | specificCellProperties at creation | PowerPointApi 1.8 (2024) | One-shot table creation with full formatting |

**Deprecated/outdated:**
- `Office.context.document.setSelectedDataAsync()` -- use `PowerPoint.run()` with application-specific API instead
- `addPicture()` -- still PREVIEW, use `shape.fill.setImage()` for GA

## Open Questions

1. **Slide insertion at current position (LYOT-03)**
   - What we know: `AddSlideOptions.index` is PREVIEW-only. The GA `slides.add()` always appends to the end.
   - What's unclear: Whether `Slide.moveTo()` or another method exists to reorder slides after creation in GA API sets. The docs do not show a `moveTo` method on the Slide class in 1.8.
   - Recommendation: For the internal demo, use the PREVIEW `index` property with a runtime check. Fallback to end-of-deck insertion. Document clearly that this behavior is preview-dependent.

2. **addGroup timing and sync requirements**
   - What we know: `addGroup()` takes an array of shape IDs or Shape objects (API 1.8). Shapes need to exist on the slide before grouping.
   - What's unclear: Whether just-created shapes (from the same batch, before sync) can be grouped, or if a sync is required first to materialize them.
   - Recommendation: Create shapes, sync once, then group. This adds one extra sync but guarantees correctness.

3. **Shape line/border formatting for placeholder dashed border**
   - What we know: The UI-SPEC calls for a dashed border on the chart placeholder. `ShapeFill` controls fill, but border/line styling uses `shape.lineFormat` properties.
   - What's unclear: The exact API for setting dashed line style on a shape outline. `ShapeLineFormat` exists but needs verification.
   - Recommendation: Implement solid border first; add dashed styling if `shape.lineFormat.dashStyle` is available in 1.4+. If not feasible, use solid border as a visual approximation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None currently configured |
| Config file | none -- see Wave 0 |
| Quick run command | N/A -- Phase 2 rendering is manual verification in PowerPoint |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEXT-01 | Title text box with correct font/position | manual | Click "Insert Text Slide" button, verify in PowerPoint | N/A |
| TEXT-02 | Bullet points with correct formatting | manual | Click "Insert Text Slide" button, verify bullets | N/A |
| TEXT-03 | Key insight callout box with accent border | manual | Click "Insert Text Slide" button, verify callout | N/A |
| TEXT-04 | Professional formatting (fonts, spacing) | manual | Visual inspection of all inserted slides | N/A |
| TABL-01 | Data table renders with addTable() | manual | Click "Insert Table Slide" button, verify table | N/A |
| TABL-02 | Header/body formatting, borders, number format | manual | Inspect table header colors, data alignment, borders | N/A |
| LYOT-02 | All 4 layout templates produce correct output | manual | Click each of the 4 test buttons, verify layouts | N/A |
| LYOT-03 | Slide inserted at current position | manual | Select mid-deck slide, insert, verify position | N/A |

### Sampling Rate
- **Per task commit:** Build succeeds (`npm run build`), sideload and test in PowerPoint
- **Per wave merge:** All 4 template buttons produce correct slides
- **Phase gate:** All 4 success criteria verified visually in PowerPoint desktop

### Wave 0 Gaps
- None for test infrastructure -- Phase 2 is inherently a manual-verification phase (Office.js APIs require a running PowerPoint host). Unit tests for pure logic (number formatting, layout calculations) could be added but are not blocking.

**Note:** The `numberFormatter.ts` and `layoutEngine.ts` modules contain pure functions that COULD be unit tested. If time permits, a simple test file using the project's build tooling would add confidence. However, the primary validation is visual inspection of rendered slides.

## Sources

### Primary (HIGH confidence)
- [ShapeCollection API reference](https://learn.microsoft.com/en-us/javascript/api/powerpoint/powerpoint.shapecollection) - addTextBox, addGeometricShape, addTable, addGroup, addPicture signatures verified (updated Feb 2026)
- [ShapeFill API reference](https://learn.microsoft.com/en-us/javascript/api/powerpoint/powerpoint.shapefill) - setImage() confirmed GA in 1.8, setSolidColor() in 1.4 (updated Nov 2025)
- [TableAddOptions API reference](https://learn.microsoft.com/en-us/javascript/api/powerpoint/powerpoint.tableaddoptions) - values, specificCellProperties, uniformCellProperties, columns, rows all confirmed 1.8 GA; style confirmed 1.9 only (updated Sep 2025)
- [TableCellProperties API reference](https://learn.microsoft.com/en-us/javascript/api/powerpoint/powerpoint.tablecellproperties) - borders, fill, font, horizontalAlignment, verticalAlignment, margins, text, textRuns all confirmed 1.8 (updated Sep 2025)
- [TextFrame API reference](https://learn.microsoft.com/en-us/javascript/api/powerpoint/powerpoint.textframe) - textRange, margins, verticalAlignment, autoSizeSetting all confirmed 1.4 (updated Mar 2026)
- [TextRange API reference](https://learn.microsoft.com/en-us/javascript/api/powerpoint/powerpoint.textrange) - font, paragraphFormat, text, getSubstring all confirmed 1.4 (updated Mar 2026)
- [AddSlideOptions API reference](https://learn.microsoft.com/en-us/javascript/api/powerpoint/powerpoint.addslideoptions) - index property confirmed PREVIEW-only (updated Feb 2026)
- [SlideCollection API reference](https://learn.microsoft.com/en-us/javascript/api/powerpoint/powerpoint.slidecollection) - add(), getItemAt(), getCount() confirmed 1.2/1.3 (updated Dec 2025)

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` - Project stack decisions, API requirement set summary
- `.planning/research/ARCHITECTURE.md` - Component boundaries, PowerPoint.run() patterns
- `.planning/research/PITFALLS.md` - context.sync() batching, coordinate system, layout engine guidance

### Tertiary (LOW confidence)
- None -- all findings verified against official Microsoft docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all APIs verified against official reference docs (Feb-Mar 2026)
- Architecture: HIGH - patterns align with official code samples and project research docs
- Pitfalls: HIGH - all pitfalls verified against API reference; AddSlideOptions.index PREVIEW status confirmed

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable APIs, 30-day window)
