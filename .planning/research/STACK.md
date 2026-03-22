# Technology Stack

**Project:** Summit VI for PowerPoint
**Researched:** 2026-03-23

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Office.js (PowerPoint JS API) | 1.8+ (target 1.8, runtime-check for 1.9/1.10) | PowerPoint slide manipulation | The only way to programmatically create shapes, text, tables, and images on slides from a web add-in. PowerPointApi 1.8 is the minimum that provides `addTable()` and `addGroup()`. 1.4 covers `addTextBox()`, `addGeometricShape()`, `addLine()`. | HIGH |
| TypeScript | ~5.4 | Type safety and Office.js typings | Microsoft's official add-in templates use TypeScript. Office.js type definitions are TypeScript-first. Catches API misuse at compile time. | HIGH |
| React | 18.x | Taskpane UI framework | Microsoft's Fluent UI v9 is built on React. The `yo office` generator supports React templates. React 18 is the stable production version. Do NOT use React 19 yet -- Fluent UI v9 has not validated against it. | HIGH |
| @fluentui/react-components | ~9.46 | Taskpane UI components | Microsoft's official design system for Office add-ins. Provides Button, Input, Spinner, Card, DataGrid, and other components that visually match the Office UI. Use Fluent UI v9 (the `@fluentui/react-components` package), NOT v8 (`@fluentui/react`) which is in maintenance mode. | HIGH |

### Build Tooling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Webpack | 5.x | Module bundling | The `yo office` generator scaffolds Webpack 5. Office add-ins need a bundler because they run in a sandboxed browser frame (WebView2 on Windows, Safari on Mac). Webpack handles the HtmlWebpackPlugin setup for manifest integration. Do NOT use Vite -- Office add-in tooling does not officially support it and the dev server proxy requirements are complex. | HIGH |
| webpack-dev-server | 4.x or 5.x | Local HTTPS dev server | Office add-ins require HTTPS even in development. The `yo office` template pre-configures self-signed certs and HTTPS for webpack-dev-server. | HIGH |
| office-addin-dev-certs | latest | Dev SSL certificates | Generates trusted self-signed certs for local HTTPS development. Included by `yo office` scaffold. | HIGH |

### API Integration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Native Fetch API | (built-in) | HTTP requests to Cube AI Chat API | Office add-ins run in a modern browser context (WebView2/Edge) that supports native `fetch()`. No need for axios or other HTTP libraries. Cube AI returns streaming NDJSON, which is best consumed with `fetch()` + `ReadableStream` for progressive response parsing. | HIGH |
| No dedicated NDJSON library | -- | Parse streaming NDJSON responses | NDJSON (newline-delimited JSON) is trivially parsed: split on `\n`, `JSON.parse()` each line. A dedicated library adds unnecessary dependency for ~10 lines of code. | MEDIUM |

### Charting Strategy

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| PptxGenJS | ~3.12 | Generate native PowerPoint charts | **CRITICAL FINDING:** The PowerPoint JavaScript API (Office.js) has NO native chart creation API. `ShapeCollection` supports `addTextBox()`, `addGeometricShape()`, `addTable()`, `addLine()`, `addPicture()` (preview) -- but NOT `addChart()`. To create native editable PowerPoint charts, you must either: (a) use PptxGenJS to generate a .pptx blob with charts and insert it via `insertSlidesFromBase64()`, or (b) render charts as images and use `addPicture()`. PptxGenJS is the standard open-source library for creating PowerPoint files with charts in JavaScript. | HIGH |
| Chart.js | ~4.4 | Render chart images as fallback | For complex visualizations or when PptxGenJS chart types are insufficient, render with Chart.js to a canvas, export as PNG base64, and insert via `addPicture()`. Chart.js is lightweight and handles bar, line, pie, scatter, and more. | MEDIUM |

### Type Definitions and Utilities

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @types/office-js | latest | TypeScript types for Office.js | Provides IntelliSense and compile-time checking for all PowerPoint API calls. Updated with each requirement set release. | HIGH |
| office-addin-debugging | latest | Debugging and sideloading utilities | Part of the Office Add-in tooling. Handles sideloading the add-in into PowerPoint for testing. | HIGH |

### Testing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Vitest or Jest | latest | Unit testing | For testing the JSON schema parsing, slide layout logic, and API call formatting. Either works; Jest has more Office add-in community examples, but Vitest is faster. For an internal demo, keep testing lightweight. | MEDIUM |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| UI Framework | React 18 + Fluent UI v9 | Vanilla HTML/CSS/JS | Fluent UI provides Office-native look and feel out of the box. The `yo office` generator supports React. Vanilla JS means rebuilding UI components from scratch. |
| UI Framework | React 18 + Fluent UI v9 | Angular | Angular is supported by `yo office` but Fluent UI v9 components are React-only. Angular would require `@nickvdyck/allotment` or similar wrappers. |
| UI Components | Fluent UI v9 (`@fluentui/react-components`) | Fluent UI v8 (`@fluentui/react`) | v8 is in maintenance mode. v9 is the actively developed version with better tree-shaking and smaller bundle size. Microsoft recommends v9 for new projects. |
| Bundler | Webpack 5 | Vite | Vite is not officially supported by Office add-in tooling. The `yo office` generator and `office-addin-debugging` tools assume Webpack. Fighting the toolchain is not worth it for an internal demo. |
| Bundler | Webpack 5 | esbuild | Same issue -- Office add-in dev tooling (sideloading, cert management, manifest validation) integrates with Webpack. |
| HTTP Client | Native fetch | Axios | Fetch is built into the WebView2 runtime. Axios adds 13KB gzipped for no benefit. Fetch + ReadableStream handles NDJSON streaming natively. |
| Charts | PptxGenJS + insertSlidesFromBase64 | Only image-based charts | PptxGenJS creates native editable PowerPoint charts. Image-only charts look good but users cannot edit them. PptxGenJS is the standard approach. |
| Charts | PptxGenJS | Open XML SDK (client-side) | Generating Open XML manually to create charts is extremely complex. PptxGenJS abstracts this away. |
| PPTX Generation | PptxGenJS | officegen | officegen is unmaintained (last publish 2020). PptxGenJS is actively maintained and has better chart support. |
| Manifest Format | XML manifest (add-in only) | Unified manifest for M365 (JSON) | The unified manifest for PowerPoint add-ins is still in **public developer preview** as of Dec 2025. Not recommended for even an internal demo -- use the stable XML manifest format. |

## Architecture-Critical Decisions

### Chart Creation Strategy (Two-Track Approach)

**This is the most important architectural decision for this project.**

Office.js PowerPoint API does NOT support creating charts directly. There are two viable paths:

#### Track 1: PptxGenJS + insertSlidesFromBase64() (Primary)
1. Cube AI returns structured JSON with chart data
2. Use PptxGenJS to build a temporary .pptx in memory with the chart(s)
3. Convert to base64
4. Use `presentation.insertSlidesFromBase64()` to inject the slide(s)
5. Result: Native, editable PowerPoint charts

**Pros:** Users can edit charts after insertion. Charts are native PowerPoint objects.
**Cons:** Inserts entire slides (not individual shapes onto existing slides). Requires careful slide positioning logic.

#### Track 2: Chart.js Canvas to Image (Fallback)
1. Render chart with Chart.js on a hidden canvas
2. Export canvas to base64 PNG
3. Use `shapes.addPicture()` (Preview API) to add image to current slide
4. Result: Non-editable chart image on any slide

**Pros:** Can add to any existing slide. More layout flexibility.
**Cons:** Not editable. `addPicture()` is still in Preview API set. Image quality depends on canvas resolution.

**Recommendation:** Use Track 1 (PptxGenJS) as the primary path for bar, line, and pie charts. Use Track 2 (Chart.js images) as fallback for complex visualizations or when the chart must be placed on an existing slide alongside other content.

### Table Creation: Native via Office.js

Tables ARE natively supported via `ShapeCollection.addTable(rowCount, columnCount, options)` in PowerPointApi 1.8. Table formatting and cell content can be set via `Shape.table` property. Use this directly -- no need for PptxGenJS for tables.

### Text Content: Native via Office.js

Text boxes are natively supported via `ShapeCollection.addTextBox(text, options)` in PowerPointApi 1.4. Font formatting via `TextFrame.textRange.font`. Use this directly.

## PowerPoint API Requirement Sets Summary

| Requirement Set | Key Capabilities Used | Platform Support |
|----------------|----------------------|-----------------|
| PowerPointApi 1.3 | Slide management, shape collection, tags | Web + Desktop + Mac |
| PowerPointApi 1.4 | `addTextBox()`, `addGeometricShape()`, `addLine()`, shape formatting | Web + Desktop + Mac |
| PowerPointApi 1.5 | Hyperlink management | Web + Desktop + Mac |
| PowerPointApi 1.8 | `addTable()`, `addGroup()`, table manipulation | Web + Desktop (v2504+) + Mac |
| PowerPointApi 1.9 | Table formatting and management | Web + Desktop (v2508+) + Mac |
| PowerPointApi Preview | `addPicture()` (base64 image insertion) | Preview builds only |

**Target:** Require PowerPointApi 1.8 minimum. Runtime-check for Preview features (`addPicture`). Use `insertSlidesFromBase64()` (available since 1.2) as the chart insertion mechanism.

**IMPORTANT WARNING:** `addPicture()` is in PREVIEW only as of the latest docs (Feb 2026). For production chart images, you may need to use PptxGenJS to generate a slide with the image embedded instead of calling `addPicture()` directly. Runtime-check with `Office.context.requirements.isSetSupported()` and fall back accordingly.

## Installation

```bash
# Scaffold project (if starting fresh)
npm install -g yo generator-office
yo office
# Choose: "Office Add-in Task Pane project"
# Choose: TypeScript
# Choose: PowerPoint

# Core dependencies
npm install @fluentui/react-components react react-dom pptxgenjs

# Dev dependencies
npm install -D typescript @types/office-js @types/react @types/react-dom webpack webpack-cli webpack-dev-server html-webpack-plugin office-addin-debugging office-addin-dev-certs

# Optional: Chart image fallback
npm install chart.js
```

## Key NPM Packages Reference

| Package | Purpose | Notes |
|---------|---------|-------|
| `office-js` | Loaded via CDN `<script>` tag, NOT npm | The Office.js library is loaded from `https://appsource.microsoft.com/lib/office/office.js` in your HTML. Do not bundle it. |
| `@types/office-js` | TypeScript type definitions | Install as dev dependency for IntelliSense |
| `@fluentui/react-components` | UI components (Fluent UI v9) | Tree-shakeable, import only what you use |
| `pptxgenjs` | PowerPoint file generation with charts | Used to create .pptx blobs with charts for insertion |
| `react` / `react-dom` | UI framework | React 18.x, not 19 |

## Sources

- Microsoft Learn: PowerPoint add-ins overview (updated Feb 2026) - https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/powerpoint-add-ins
- Microsoft Learn: Build first PowerPoint add-in quickstart (updated Dec 2025) - https://learn.microsoft.com/en-us/office/dev/add-ins/quickstarts/powerpoint-quickstart
- Microsoft Learn: Work with shapes (updated May 2025) - https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/shapes
- Microsoft Learn: ShapeCollection API reference (updated Feb 2026) - https://learn.microsoft.com/en-us/javascript/api/powerpoint/powerpoint.shapecollection
- Microsoft Learn: PowerPoint API requirement sets (updated Dec 2025) - https://learn.microsoft.com/en-us/javascript/api/requirement-sets/powerpoint/powerpoint-api-requirement-sets
- Microsoft Learn: Insert slides from another presentation (updated Dec 2025) - https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/insert-slides-into-presentation
