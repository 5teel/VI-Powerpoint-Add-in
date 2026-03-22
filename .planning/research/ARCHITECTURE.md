# Architecture Patterns

**Domain:** AI-powered PowerPoint Office Web Add-in (taskpane) integrating with Cube AI Chat API
**Researched:** 2026-03-23
**Confidence:** HIGH (based on official Microsoft documentation, verified API surfaces)

## Recommended Architecture

### High-Level Overview

```
+---------------------+       +------------------+       +-------------------+
|   PowerPoint Host   |       |   Taskpane UI    |       |  Cube AI Chat API |
|   (Office.js PPT    |<----->|   (React SPA in  |<----->|  (REST/NDJSON     |
|    document model)   |       |    browser       |       |   streaming)      |
|                     |       |    sandbox)      |       |                   |
+---------------------+       +------------------+       +-------------------+
        ^                            |
        |                            v
        |                    +------------------+
        +--------------------| Slide Renderer   |
                             | (Office.js API   |
                             |  calls to build  |
                             |  native PPT      |
                             |  elements)       |
                             +------------------+
```

The add-in is a **two-component system**: a manifest file that registers the add-in with PowerPoint, and a web application served over HTTPS that runs inside PowerPoint's browser-based taskpane sandbox. The web app communicates "inward" to the PowerPoint document via Office.js APIs and "outward" to Cube AI via standard HTTPS fetch calls.

### Component Boundaries

| Component | Responsibility | Communicates With | API Set |
|-----------|---------------|-------------------|---------|
| **Manifest (XML or unified JSON)** | Registers add-in, declares permissions, specifies taskpane entry point URL, ribbon buttons | PowerPoint host (read at install time) | N/A |
| **Taskpane UI** | Chat interface for natural language input, conversation history display, status/progress indicators | Cube AI API Service, Slide Schema Parser, Office.js PPT APIs | Browser DOM, Fetch API |
| **Cube AI API Service** | Sends user questions to Cube AI Chat API, handles streaming NDJSON responses, manages chatId for multi-turn conversation threading | Taskpane UI (consumer), Cube AI endpoint (external) | Fetch API with ReadableStream |
| **Slide Schema Parser** | Parses Cube AI JSON response into validated slide layout schema objects, normalizes data for rendering | Cube AI API Service (upstream), Slide Renderer (downstream) | Internal TypeScript interfaces |
| **Slide Renderer** | Translates slide schema into native PowerPoint elements using Office.js: creates slides, text boxes, tables, shapes, images | Slide Schema Parser (upstream), PowerPoint document (downstream) | PowerPoint JavaScript API (PowerPointApi 1.8+) |
| **PowerPoint Document** | The live presentation being edited by the user | Slide Renderer (read/write via Office.js) | Office.js proxy object model |

### Logical Layers

```
[User Input Layer]
    Taskpane UI (React) -- chat input, conversation display, action buttons

[API Integration Layer]
    Cube AI Service -- NDJSON stream parsing, chatId management, API key auth
    Slide Schema Parser -- JSON validation, normalization, error handling

[Rendering Layer]
    Slide Renderer -- Office.js PowerPoint API calls
      |-- TextRenderer (addTextBox, textFrame manipulation)
      |-- TableRenderer (addTable with TableAddOptions)
      |-- ChartRenderer (addPicture for chart images OR geometric shape composition)
      |-- ImageRenderer (addPicture for embedded visualizations)
      |-- LayoutEngine (positioning, sizing in points)

[Platform Layer]
    Office.js SDK -- proxy object model with RequestContext + context.sync() pattern
    PowerPoint Host -- the actual PowerPoint application
```

## Data Flow

### Primary Flow: Question to Slide

```
1. USER types question in taskpane
       |
       v
2. TASKPANE UI dispatches to Cube AI Service
       |
       v
3. CUBE AI SERVICE sends POST to ai.gcp-us-central1.cubecloud.dev
   - Headers: API key, Content-Type
   - Body: { question, chatId? }
   - Response: streaming NDJSON
       |
       v
4. CUBE AI SERVICE reads stream line-by-line
   - Accumulates partial text for progress display
   - Detects JSON slide schema in response
   - Passes text chunks to UI for real-time display
       |
       v
5. SLIDE SCHEMA PARSER validates and normalizes the JSON
   - Validates against TypeScript interface/schema
   - Extracts: slide title, text blocks, chart data, table data, layout hints
   - Returns typed SlideLayout object
       |
       v
6. SLIDE RENDERER executes Office.js calls inside PowerPoint.run()
   - Creates new slide (slides.add())
   - Adds text elements (shapes.addTextBox())
   - Adds tables (shapes.addTable() with values/formatting)
   - Adds images (shapes.addPicture() -- PREVIEW API)
   - Sets positioning (left, top, height, width in points)
   - Calls context.sync() to commit to document
       |
       v
7. POWERPOINT renders the native slide
   User sees fully populated slide in their presentation
```

### NDJSON Streaming Pattern

Cube AI returns newline-delimited JSON (NDJSON). Each line is a separate JSON object. The service must:

```typescript
// Pseudocode for streaming consumption
const response = await fetch(CUBE_AI_URL, { method: 'POST', body, headers });
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop(); // Keep incomplete line in buffer

  for (const line of lines) {
    if (line.trim()) {
      const chunk = JSON.parse(line);
      // Process each NDJSON chunk: text content, metadata, slide schema
    }
  }
}
```

### Conversation Threading

Multi-turn conversations use Cube AI's `chatId` mechanism:

```
Turn 1: POST { question: "What were Q4 sales?" }
  Response includes chatId: "abc123"

Turn 2: POST { question: "Break that down by region", chatId: "abc123" }
  Cube AI has context from Turn 1
```

The Cube AI Service component must store and manage chatId across turns within a session.

## Office.js API Surface for Slide Construction

### What Can Be Created Natively (PowerPointApi 1.8, GA)

| Element | API Method | Requirement Set | Status |
|---------|-----------|----------------|--------|
| New slides | `slides.add()` | 1.3 | GA |
| Text boxes | `shapes.addTextBox(text, options)` | 1.4 | GA |
| Geometric shapes | `shapes.addGeometricShape(type, options)` | 1.4 | GA |
| Lines | `shapes.addLine(connectorType, options)` | 1.4 | GA |
| Tables | `shapes.addTable(rows, cols, options)` | 1.8 | GA |
| Shape groups | `shapes.addGroup(shapes)` | 1.8 | GA |
| Text formatting | `textFrame.textRange.font.*` | 1.4 | GA |
| Shape fill/color | `shape.fill.setSolidColor()` | 1.4 | GA |
| Image fill on shapes | `shape.fill.setImage(base64)` | 1.8 | GA |
| Pictures (standalone) | `shapes.addPicture(base64, options)` | Preview | PREVIEW |
| Slide deletion | `slide.delete()` | 1.2 | GA |
| Slide from template | `insertSlidesFromBase64()` | 1.2 | GA |
| Table cell formatting | `TableCellProperties` (borders, fill, font) | 1.8 | GA |

### What CANNOT Be Created Natively

| Element | Limitation | Workaround |
|---------|-----------|------------|
| **Native Charts** | No Chart API exists in PowerPoint JS API (unlike Excel) | Render chart as image server-side or client-side (e.g., Chart.js to canvas to base64), insert via `addPicture` (preview) or `shape.fill.setImage()` |
| **SmartArt** | No SmartArt API | Build from geometric shapes + text boxes |
| **Animations** | No animation API | Not supported; skip |
| **Transitions** | No transition API | Not supported; skip |
| **Video/Audio** | No media insertion API | Not supported; skip |

### Critical Architectural Decision: Charts

Since PowerPoint's Office.js API has **no native chart creation capability** (unlike Excel), charts must be handled through one of these approaches:

**Recommended: Client-side chart rendering to image**

1. Use a charting library (Chart.js, Recharts, or similar) to render chart in an off-screen canvas
2. Export canvas to base64 PNG via `canvas.toDataURL('image/png')`
3. Insert into slide via `shape.fill.setImage(base64)` on a rectangle shape (GA in 1.8) or `shapes.addPicture(base64)` (Preview API)

This approach keeps the architecture simple (no server needed for chart rendering) and works within the browser sandbox. The tradeoff is that charts are not editable as native PowerPoint chart objects -- they are images. This aligns with the PROJECT.md decision: "Native PPT charts via Office.js where possible, embedded images as fallback for complex visuals." Since there IS no native PPT chart API, all charts become images.

**Alternative: Pre-built template slides**

Use `insertSlidesFromBase64()` to insert slides from a template .pptx that contains pre-configured chart placeholders, then manipulate the data. This is fragile and not recommended for dynamic AI-generated content.

## Patterns to Follow

### Pattern 1: PowerPoint.run() with Request Context

All Office.js PowerPoint API calls must be wrapped in `PowerPoint.run()`, which provides a `RequestContext`. Operations are batched and only sent to the host application when `context.sync()` is called.

**What:** Batch multiple operations before syncing to minimize round trips.
**When:** Always, for all PowerPoint document manipulation.

```typescript
async function createSlideWithContent(schema: SlideLayout): Promise<void> {
  await PowerPoint.run(async (context) => {
    // Step 1: Add slide
    context.presentation.slides.add();
    await context.sync();

    // Step 2: Get the new slide and add content
    const slideCount = context.presentation.slides.getCount();
    await context.sync();

    const newSlide = context.presentation.slides.getItemAt(slideCount.value - 1);
    const shapes = newSlide.shapes;

    // Step 3: Add all shapes in a batch
    const title = shapes.addTextBox(schema.title, {
      left: 50, top: 30, width: 860, height: 50
    });
    title.textFrame.textRange.font.size = 28;
    title.textFrame.textRange.font.bold = true;

    if (schema.table) {
      shapes.addTable(schema.table.rows, schema.table.cols, {
        left: 50, top: 100, width: 860, height: 400,
        values: schema.table.data
      });
    }

    // Step 4: Single sync commits everything
    await context.sync();
  });
}
```

### Pattern 2: Slide Schema as Intermediary Contract

**What:** Define a TypeScript interface that serves as the contract between Cube AI responses and the Slide Renderer.
**When:** Always -- this decouples AI response parsing from PowerPoint rendering.

```typescript
interface SlideLayout {
  title: string;
  subtitle?: string;
  elements: SlideElement[];
}

type SlideElement =
  | TextElement
  | TableElement
  | ChartElement
  | KeyFindingsElement;

interface TextElement {
  type: 'text';
  content: string;
  position: { left: number; top: number; width: number; height: number };
  style?: { fontSize?: number; bold?: boolean; color?: string };
}

interface TableElement {
  type: 'table';
  headers: string[];
  rows: string[][];
  position: { left: number; top: number; width: number; height: number };
}

interface ChartElement {
  type: 'chart';
  chartType: 'bar' | 'line' | 'pie' | 'doughnut';
  data: { labels: string[]; datasets: ChartDataset[] };
  position: { left: number; top: number; width: number; height: number };
}

interface KeyFindingsElement {
  type: 'keyFindings';
  findings: string[];
  position: { left: number; top: number; width: number; height: number };
}
```

### Pattern 3: Streaming UI Updates

**What:** Show progressive feedback as NDJSON stream arrives, before the full response is ready.
**When:** During Cube AI API calls to avoid blank-screen waiting.

```
User sends question
  -> Show "Thinking..." immediately
  -> As text chunks arrive, show partial AI response in taskpane
  -> When JSON schema detected, show "Building slide..."
  -> When slide rendered, show "Done" with navigation to new slide
```

### Pattern 4: Points-Based Layout System

**What:** PowerPoint uses a points-based coordinate system (1 point = 1/72 inch). Standard slide is 960x540 points (widescreen 16:9). All positioning must use this system.
**When:** For all shape placement.

```typescript
// Standard widescreen slide dimensions in points
const SLIDE = {
  WIDTH: 960,   // 13.33 inches
  HEIGHT: 540,  // 7.5 inches
  MARGIN: 40,   // ~0.55 inch margin
};

// Layout regions
const REGIONS = {
  TITLE: { left: 40, top: 20, width: 880, height: 50 },
  SUBTITLE: { left: 40, top: 75, width: 880, height: 30 },
  CONTENT_FULL: { left: 40, top: 120, width: 880, height: 390 },
  CONTENT_LEFT: { left: 40, top: 120, width: 420, height: 390 },
  CONTENT_RIGHT: { left: 500, top: 120, width: 420, height: 390 },
};
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Sync After Every Operation
**What:** Calling `context.sync()` after each individual shape addition.
**Why bad:** Each sync is a round-trip between the add-in process and the Office host process. Multiple syncs per slide creation causes visible lag and poor performance.
**Instead:** Batch all operations for a single slide, then call `context.sync()` once. Only sync multiple times when you need return values (like slide count or IDs) to proceed.

### Anti-Pattern 2: Assuming Chart API Exists
**What:** Writing code that tries to create native PowerPoint charts via Office.js.
**Why bad:** Unlike Excel's JavaScript API, PowerPoint's JavaScript API has NO chart creation or manipulation APIs. Code will fail at runtime.
**Instead:** Render charts client-side to canvas/image and insert as pictures.

### Anti-Pattern 3: Hardcoding Slide Master/Layout IDs
**What:** Embedding specific slideMasterId or layoutId strings in code.
**Why bad:** These IDs are opaque numeric tokens specific to each presentation. They change between presentations and cannot be predicted.
**Instead:** Either use default layout (no options to `slides.add()`) or discover layouts at runtime by iterating `presentation.slideMasters` collection.

### Anti-Pattern 4: Blocking on Full AI Response Before Showing Anything
**What:** Waiting for the entire NDJSON stream to complete before updating the UI.
**Why bad:** Cube AI responses can take 5-30+ seconds. Users see a frozen interface with no feedback.
**Instead:** Stream partial text to the taskpane as it arrives. Show a progress indicator. Only block on slide rendering once the complete schema is received.

### Anti-Pattern 5: Using Common API When Application-Specific API Exists
**What:** Using older `Office.context.document.setSelectedDataAsync()` patterns when PowerPoint-specific APIs (PowerPointApi 1.x) are available.
**Why bad:** Common APIs are callback-based, less capable, and don't provide the rich object model. The application-specific APIs use the modern promise-based proxy model with batched operations.
**Instead:** Always prefer `PowerPoint.run()` with the application-specific API for slide/shape manipulation.

## Scalability Considerations

| Concern | Internal Demo (v1) | Broader Internal Use | External Clients |
|---------|-------------------|---------------------|-----------------|
| **Hosting** | localhost / simple static host | Azure Static Web Apps or similar CDN | CDN with HTTPS, proper CORS, monitoring |
| **API Keys** | Hardcoded in client (acceptable for demo) | Environment variable, consider thin proxy | Must use server-side proxy to hide API keys |
| **Concurrent Users** | 1-5 | 50-100 (Cube AI rate limits become relevant) | Requires auth, rate limiting, API key management |
| **Slide Complexity** | Simple layouts, few elements | More complex multi-element slides | Template library, layout optimization |
| **Error Handling** | Console.log, basic error messages | User-friendly error UI, retry logic | Comprehensive error handling, telemetry |

## Suggested Build Order

Dependencies flow top-to-bottom. Each phase depends on the one before it.

```
Phase 1: Scaffold + Manifest + Taskpane Shell
  - Office add-in project scaffolding (Yeoman generator or manual)
  - XML/JSON manifest with taskpane configuration
  - Basic React app that loads in PowerPoint taskpane
  - Office.js initialization (Office.onReady)
  - Verify: add-in loads and displays in PowerPoint
  DEPENDS ON: nothing

Phase 2: Office.js Slide Primitives
  - Create new blank slides
  - Add text boxes with content and formatting
  - Add tables with data
  - Add images (base64)
  - Position elements using points system
  - Verify: can programmatically build a multi-element slide
  DEPENDS ON: Phase 1

Phase 3: Cube AI API Integration
  - NDJSON streaming client
  - API key authentication
  - chatId conversation management
  - Response parsing and text extraction
  - Verify: can send question, receive streaming response, display text
  DEPENDS ON: Phase 1 (taskpane UI)

Phase 4: Slide Schema + Renderer
  - Define SlideLayout TypeScript interfaces
  - Build schema parser (JSON from Cube AI -> SlideLayout)
  - Build slide renderer (SlideLayout -> Office.js API calls)
  - Prompt engineering: instruct Cube AI to return slide JSON
  - Verify: end-to-end question -> slide generation
  DEPENDS ON: Phase 2 + Phase 3

Phase 5: Chart Rendering
  - Client-side chart library integration
  - Canvas-to-base64 pipeline
  - Chart insertion into slides as images
  - Verify: data visualizations appear on slides
  DEPENDS ON: Phase 4

Phase 6: Polish + Multi-turn
  - Streaming progress UI
  - Conversation history
  - Error handling and retry
  - Layout refinement and positioning
  - Minimal Summit VI branding
  DEPENDS ON: Phase 4 + Phase 5
```

## Key Requirement Sets to Target

For this project, target **PowerPointApi 1.8** as the minimum requirement set:

- 1.3: Slide creation, shape collection access, tags
- 1.4: Shape creation (text boxes, geometric shapes, lines), formatting
- 1.8: Table creation (`addTable`), shape grouping, image fill (`setImage`), placeholder format

PowerPointApi 1.8 is supported on:
- Office on the web (all versions)
- Office on Windows (Microsoft 365, Version 2504+)
- Office on Mac (Version 16.96+)
- NOT supported on Office on iPad or volume-licensed perpetual Office

The `addPicture()` method for standalone picture insertion is still in **Preview** as of March 2026. For GA compatibility, use `addGeometricShape(rectangle)` + `shape.fill.setImage(base64)` as the image insertion strategy.

## Sources

- [PowerPoint add-ins overview](https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/powerpoint-add-ins) -- Confidence: HIGH (official docs, updated Feb 2026)
- [Office Add-ins platform overview](https://learn.microsoft.com/en-us/office/dev/add-ins/overview/office-add-ins) -- Confidence: HIGH (official docs)
- [Understanding the Office JavaScript API](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/understanding-the-javascript-api-for-office) -- Confidence: HIGH (official docs)
- [Work with shapes using PowerPoint JS API](https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/shapes) -- Confidence: HIGH (official docs, updated May 2025)
- [Add and delete slides](https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/add-slides) -- Confidence: HIGH (official docs, updated Feb 2026)
- [Insert slides from another presentation](https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/insert-slides-into-presentation) -- Confidence: HIGH (official docs)
- [PowerPoint API requirement sets](https://learn.microsoft.com/en-us/javascript/api/requirement-sets/powerpoint/powerpoint-api-requirement-sets) -- Confidence: HIGH (official docs, updated Dec 2025)
- [PowerPointApi 1.8 requirement set](https://learn.microsoft.com/en-us/javascript/api/requirement-sets/powerpoint/powerpoint-api-1-8-requirement-set) -- Confidence: HIGH (official docs, table API details)
- [ShapeCollection class reference](https://learn.microsoft.com/en-us/javascript/api/powerpoint/powerpoint.shapecollection) -- Confidence: HIGH (official API reference, addPicture confirmed as Preview)
- [Office dialog API](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/dialog-api-in-office-add-ins) -- Confidence: HIGH (official docs)
- [Document themes in PowerPoint add-ins](https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/use-document-themes-in-your-powerpoint-add-ins) -- Confidence: HIGH (official docs)
