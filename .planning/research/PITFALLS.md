# Domain Pitfalls

**Domain:** AI-powered PowerPoint Office Web Add-in (Cube AI to slide rendering)
**Researched:** 2026-03-23
**Confidence:** HIGH (based on official Microsoft documentation, API reference verification)

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: No Native Chart API Exists in Office.js for PowerPoint

**What goes wrong:** Teams assume Office.js provides a `ShapeCollection.addChart()` method for PowerPoint (analogous to Excel's chart APIs) and design their entire rendering pipeline around programmatic native chart creation. When they discover no such API exists, the rendering architecture must be reworked.

**Why it happens:** Excel's Office.js API has rich chart support (`Worksheet.charts.add()`). Developers assume PowerPoint has parity. The PowerPoint JS API (through 1.10 and even the current preview) provides `addGeometricShape`, `addTextBox`, `addLine`, `addTable` (1.8+), and `addPicture` (preview only) -- but no `addChart`.

**Consequences:** Entire chart rendering strategy must be redesigned mid-project. This is the single biggest architectural blocker for this project.

**Prevention:**
- Accept from day one that charts must be rendered as images (server-side or client-side via a charting library like Chart.js or D3), then inserted via the `addPicture` preview API or via `insertSlidesFromBase64` with a pre-built template.
- The `addPicture(base64EncodedImage, options)` method exists in PREVIEW only (not GA). For production stability, consider the `ShapeFill.setImage(base64EncodedImage)` method (GA in 1.8) which sets an image as fill on an existing geometric shape -- though this is a workaround, not a clean image insertion.
- Alternative approach: use `insertSlidesFromBase64` to inject pre-built slides from a .pptx template that contains chart placeholders, then modify the data. However, this requires pre-existing template files and cannot dynamically create chart types.

**Detection:** Ask early: "Show me the API call to create a bar chart on a PowerPoint slide." If the answer involves Excel APIs or hypothetical methods, you have this pitfall.

**Phase mapping:** Must be resolved in Phase 1 (architecture). The chart rendering strategy is foundational.

**Confidence:** HIGH -- verified against official PowerPoint JS API reference (ShapeCollection methods) and requirement set documentation through 1.10 + preview.

---

### Pitfall 2: addPicture Is Preview-Only -- Not Production-Stable

**What goes wrong:** The clean way to add images to slides (`ShapeCollection.addPicture`) is currently a PREVIEW API, meaning it can change or break without notice. Teams build their image insertion pipeline on it, then face instability or unavailability in certain Office versions.

**Why it happens:** The PowerPoint JS API has evolved rapidly (1.1 in 2018 to 1.10 in 2025), but image insertion as a standalone shape is still not in a GA requirement set. The preview API docs explicitly state: "Do not use this API in a production environment."

**Consequences:** Image-based chart rendering (the primary workaround for Pitfall 1) sits on unstable ground. Users on older Office versions or non-Insider builds may not have access to the API at all.

**Prevention:**
- For an internal demo (which this project is), using the preview API is acceptable. Document the dependency explicitly.
- Implement a fallback: use `ShapeFill.setImage(base64EncodedImage)` (GA in 1.8) to place chart images as fills on geometric shapes. This is less clean (the image fills a rectangle shape rather than being a standalone picture) but is stable.
- Use runtime requirement set checks: `Office.context.requirements.isSetSupported('PowerPointApi', '1.8')` at minimum, and feature-detect `addPicture` availability.
- Another fallback: render charts entirely off-slide and use `insertSlidesFromBase64` to inject a full slide with embedded images from a programmatically-generated .pptx buffer.

**Detection:** Check if your image insertion code calls `addPicture`. If yes, verify that all target environments have preview API access.

**Phase mapping:** Phase 1 (architecture) -- decide on image insertion strategy with fallback chain.

**Confidence:** HIGH -- verified against official preview API documentation.

---

### Pitfall 3: NDJSON Streaming Parsing in the Browser Sandbox

**What goes wrong:** The Cube AI Chat API returns streaming NDJSON (newline-delimited JSON). Developers use `fetch` with a `ReadableStream` reader, but fail to handle partial JSON chunks, buffering, or incomplete lines. The result: intermittent parsing failures, dropped data, or garbled responses.

**Why it happens:** NDJSON streams deliver data as it arrives. A single `read()` call from the stream may return half a JSON line, two complete lines, or 1.5 lines. Naive implementations that split on `\n` and parse each segment will fail on chunk boundaries.

**Consequences:** Intermittent failures that are hard to reproduce. AI responses appear truncated or corrupted. Multi-turn conversations break because `chatId` from a partial response is lost.

**Prevention:**
- Implement a proper line buffer: accumulate incoming text, split on `\n`, parse only complete lines, carry forward any incomplete trailing segment.
- Pattern:
  ```javascript
  let buffer = '';
  // On each chunk:
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop(); // incomplete last line goes back to buffer
  for (const line of lines) {
    if (line.trim()) {
      const parsed = JSON.parse(line);
      // process parsed object
    }
  }
  ```
- Handle the case where the stream ends with data still in the buffer (flush it).
- Add error handling around individual line parsing -- one malformed line should not crash the entire stream.

**Detection:** Test with slow network throttling and large responses. If responses sometimes appear truncated or parsing errors appear in console, you have this issue.

**Phase mapping:** Phase 2 (API integration). Must be correct before any AI-to-slide pipeline works reliably.

**Confidence:** HIGH -- this is a well-documented pattern issue with NDJSON streaming.

---

### Pitfall 4: Designing the JSON Slide Schema Without Understanding Office.js Capabilities

**What goes wrong:** Teams design an ambitious JSON slide schema (instructing Cube AI to return layout specifications) without first mapping every schema element to a concrete Office.js API call. The schema includes elements like "chart: { type: 'bar', data: [...] }" or "animation: 'fadeIn'" that have no corresponding API. The result is a schema that cannot be rendered.

**Why it happens:** The schema is designed from a "what would be nice" perspective rather than a "what can Office.js actually do" perspective. The gap between what PowerPoint can display and what Office.js can programmatically create is enormous.

**Consequences:** Major rework of both the schema and the AI prompt engineering. Time wasted on prompt tuning for a schema that was never implementable.

**Prevention:**
- Build the schema bottom-up from Office.js capabilities, not top-down from desired output.
- The PowerPoint JS API can currently create (GA, 1.8+):
  - Slides (`SlideCollection.add`)
  - Text boxes (`ShapeCollection.addTextBox`)
  - Geometric shapes with text (`addGeometricShape` + `textFrame`)
  - Lines (`addLine`)
  - Tables with cell data (`addTable` with `TableAddOptions`)
  - Shape positioning/sizing (`left`, `top`, `height`, `width` in points)
  - Font formatting (bold, italic, color, size, name)
  - Shape fill colors (`ShapeFill.setSolidColor`)
  - Image fills on shapes (`ShapeFill.setImage` -- GA 1.8)
  - Tags on shapes/slides for metadata
- The API CANNOT create (as of March 2026):
  - Native charts (bar, line, pie, etc.)
  - Animations or transitions
  - SmartArt
  - Audio/video elements
  - Complex text layouts (columns, text wrapping around shapes)
  - Standalone images (preview only via `addPicture`)
- Design the schema to emit ONLY what the API supports. Chart data should arrive as a separate data payload that the client renders to an image.

**Detection:** For every element in your proposed schema, write the Office.js code that would render it. If you cannot, remove or redesign that element.

**Phase mapping:** Phase 1 (architecture/schema design). This must be validated before any prompt engineering begins.

**Confidence:** HIGH -- verified against complete API surface area documentation.

---

### Pitfall 5: Ignoring Requirement Set Differences Across Platforms

**What goes wrong:** The add-in works perfectly in PowerPoint on the web but crashes or degrades silently on desktop (Windows/Mac) or iPad because it uses APIs from requirement sets not available on those platforms.

**Why it happens:** PowerPoint API requirement sets have uneven platform support. Key examples:
- PowerPointApi 1.8 (tables): supported on web and Microsoft 365 desktop, but NOT on volume-licensed/LTSC Office or iPad.
- PowerPointApi 1.9/1.10: NOT available on volume-licensed Office or iPad.
- Preview APIs (addPicture): only available on Insider builds.

**Consequences:** Add-in appears broken for subset of users. If the manifest declares a minimum requirement set too high, the add-in won't even appear in the add-in catalog for those users.

**Prevention:**
- For an internal demo, target PowerPoint on the web (which supports all requirement sets) as the primary platform.
- Use runtime requirement set checks (`Office.context.requirements.isSetSupported`) rather than manifest-level requirements for non-essential features.
- Document minimum supported platforms explicitly.
- If desktop support is needed later, implement graceful degradation (e.g., skip table creation on platforms without 1.8, use text-based layouts instead).

**Detection:** Test on PowerPoint on the web first (guaranteed support), then test on desktop. If features silently fail on desktop, you likely have requirement set gaps.

**Phase mapping:** Phase 1 (architecture) for platform targeting decisions. Phase 3+ for cross-platform testing.

**Confidence:** HIGH -- verified against official requirement set compatibility matrix.

## Moderate Pitfalls

### Pitfall 6: context.sync() Batching Mistakes

**What goes wrong:** Developers call `context.sync()` too frequently (degrading performance) or too infrequently (reading stale/undefined property values). Both patterns are common Office.js mistakes.

**Prevention:**
- Call `context.sync()` after setting up all operations in a batch, not after each individual operation.
- Always call `context.sync()` before reading any property value that was loaded.
- Pattern: load what you need, sync, read values, perform mutations, sync again.
- Be aware that `load()` just queues a request -- the data is not available until after `await context.sync()`.
- When creating multiple shapes on a slide, batch all `addGeometricShape`/`addTextBox`/`addTable` calls before a single `context.sync()`.

**Detection:** If property reads return `undefined` or the add-in is noticeably slow when creating slides, check your sync patterns.

**Phase mapping:** Phase 2 (rendering engine implementation).

**Confidence:** HIGH -- standard Office.js pattern documented extensively.

---

### Pitfall 7: Coordinate System Confusion (Points vs Pixels vs Percentages)

**What goes wrong:** Shape positioning uses points (1 point = 1/72 inch), but developers think in pixels or percentages. Slides are 10" x 7.5" (720 x 540 points) at default size, but the add-in renders to different dimensions, causing elements to overflow or appear misaligned.

**Prevention:**
- All Office.js positioning uses points. Document this in the schema.
- Standard slide dimensions: 720 points wide x 540 points tall (10" x 7.5") for widescreen, or 720 x 540 for standard 4:3.
- Actually, default widescreen is 13.333" x 7.5" = 960 x 540 points. Verify by reading `context.presentation.pageSetup` at runtime.
- Build a layout engine that converts your schema coordinates to points relative to actual slide dimensions.
- Leave margins (at least 36 points / 0.5 inch from edges) to avoid content being clipped during projection.

**Detection:** Elements appear off-screen, overlapping, or unexpectedly small/large.

**Phase mapping:** Phase 2 (rendering engine).

**Confidence:** MEDIUM -- standard slide dimensions verified, but actual behavior can vary with presentation settings.

---

### Pitfall 8: AI Response Schema Compliance Failures

**What goes wrong:** Cube AI is instructed to return JSON conforming to the slide schema, but AI models do not reliably produce valid JSON, especially with complex schemas. Responses may include markdown code fences, extra commentary, partial JSON, or schema violations.

**Prevention:**
- Never trust AI output to be valid JSON. Always wrap parsing in try/catch.
- Implement a validation layer between AI response and rendering:
  1. Extract JSON from response (strip markdown fences, find first `{` to last `}`)
  2. Parse JSON
  3. Validate against schema (use a lightweight validator like Ajv)
  4. Apply defaults for missing fields
  5. Clamp values to valid ranges (e.g., coordinates within slide bounds)
- Keep the schema as simple as possible. Fewer fields = higher AI compliance rate.
- Use few-shot examples in the system prompt showing exact expected output format.
- Consider asking for the natural language answer and structured data separately rather than a single complex JSON blob.

**Detection:** Monitor parse failure rate in development. If > 10% of AI responses fail to parse, simplify the schema.

**Phase mapping:** Phase 2 (AI integration) and ongoing refinement.

**Confidence:** HIGH -- this is a universal challenge with LLM-structured output.

---

### Pitfall 9: CORS and API Key Security in Browser Sandbox

**What goes wrong:** The Office add-in runs in a browser webview. Making direct HTTPS calls to the Cube AI API requires CORS headers on the API server. If CORS is not configured, requests fail silently or with opaque errors. Additionally, API keys embedded in client-side JavaScript are exposed to anyone who inspects the page source.

**Prevention:**
- Verify that the Cube AI endpoint (`ai.gcp-us-central1.cubecloud.dev`) returns proper CORS headers (`Access-Control-Allow-Origin`) for requests from the add-in's origin.
- If CORS is not supported, you must implement a lightweight proxy server that the add-in calls, which then forwards requests to Cube AI.
- For the internal demo, embedding the API key in client code is acceptable but should be flagged as a security debt. For production, use a backend proxy that holds the API key and authenticates add-in users separately.
- Test CORS behavior from within the actual PowerPoint webview, not just a regular browser -- the webview origin may differ.

**Detection:** Network requests to Cube AI fail with no response body, or the browser console shows CORS errors. This must be tested very early.

**Phase mapping:** Phase 1 (proof of concept / API connectivity). This is a day-one validation item.

**Confidence:** HIGH -- CORS restrictions are well-documented for Office Web Add-ins. The specific Cube AI CORS configuration is unknown and must be tested.

---

### Pitfall 10: Slide Layout Positioning Without a Layout Engine

**What goes wrong:** Each AI response produces a different combination of elements (title, summary, chart, table, key findings). Without a layout engine, elements overlap, overflow the slide, or waste space. Developers hard-code positions for "the common case" and everything else looks broken.

**Prevention:**
- Define a small set of fixed slide templates/layouts in your code (e.g., "title + chart", "title + table + summary", "title + bullets") rather than allowing arbitrary element placement.
- For each template, pre-define the bounding boxes (in points) for each element slot.
- The AI schema should specify which template to use, not pixel-level coordinates.
- This is much more reliable than having the AI specify positions, because the AI does not know the slide dimensions or the size of rendered content.
- Start with 3-4 templates maximum. Add more only as needed.

**Detection:** Slides look good for one type of response but terrible for others.

**Phase mapping:** Phase 2 (schema design and rendering engine).

**Confidence:** HIGH -- layout management is a common challenge in document generation systems.

## Minor Pitfalls

### Pitfall 11: 1-Based vs 0-Based Index Confusion

**What goes wrong:** The Common API `getSelectedDataAsync(SlideRange)` returns 1-based slide indexes, while `SlideCollection.getItemAt()` uses 0-based indexes. Off-by-one errors cause operations on the wrong slide.

**Prevention:** Always subtract 1 when converting from `getSelectedDataAsync` index to `getItemAt` index. Document this in code comments at every conversion point.

**Phase mapping:** Phase 2 (slide operations).

**Confidence:** HIGH -- explicitly documented in Microsoft docs.

---

### Pitfall 12: Forgetting to Load Properties Before Reading Them

**What goes wrong:** Code attempts to read shape properties (name, type, dimensions) without first calling `load()` and `context.sync()`. Properties return `undefined` with no error thrown, leading to silent bugs.

**Prevention:** Establish a coding pattern: always `load` before `sync` before `read`. Use TypeScript strict mode to catch potential undefined access. Create helper functions that encapsulate the load-sync-read pattern.

**Phase mapping:** Phase 2 (all Office.js code).

**Confidence:** HIGH -- fundamental Office.js pattern.

---

### Pitfall 13: Tag Key Case Sensitivity

**What goes wrong:** PowerPoint stores tag keys as uppercase regardless of how they are added. Code that compares tag keys using the original casing (e.g., checking for `"slideType"` when it is stored as `"SLIDETYPE"`) fails to find matches.

**Prevention:** Always use uppercase for tag keys in both writing and reading code. Document this convention in the codebase.

**Phase mapping:** Phase 2 (if using tags for slide/shape metadata tracking).

**Confidence:** HIGH -- explicitly documented in Microsoft docs.

---

### Pitfall 14: Large Base64 Image Strings Causing Memory Issues

**What goes wrong:** Chart images rendered at high resolution produce large base64 strings. Passing multiple large strings through Office.js in a single batch can cause memory pressure in the webview, leading to slow performance or crashes.

**Prevention:**
- Render chart images at reasonable resolutions (e.g., 800x600 pixels, not 4K).
- Limit the number of image-heavy slides created in a single `PowerPoint.run` batch.
- If creating multiple slides with images, consider breaking them into separate `PowerPoint.run` calls.
- Test with realistic data volumes early.

**Phase mapping:** Phase 3 (performance optimization).

**Confidence:** MEDIUM -- based on general webview memory constraints; specific thresholds depend on the environment.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Architecture | No chart API exists (Pitfall 1) | Design image-based chart rendering from day one |
| Phase 1: Architecture | Schema designed beyond API capabilities (Pitfall 4) | Map every schema element to a concrete API call |
| Phase 1: Architecture | CORS blocking API calls (Pitfall 9) | Test Cube AI connectivity from webview on day one |
| Phase 2: API Integration | NDJSON streaming parsing (Pitfall 3) | Implement proper line buffering |
| Phase 2: API Integration | AI response schema violations (Pitfall 8) | Build validation/sanitization layer |
| Phase 2: Rendering | context.sync() batching (Pitfall 6) | Follow batch pattern from the start |
| Phase 2: Rendering | Coordinate confusion (Pitfall 7) | Use points, define template-based layouts |
| Phase 2: Rendering | No layout engine (Pitfall 10) | Use fixed template slots, not AI-specified positions |
| Phase 3: Polish | addPicture preview instability (Pitfall 2) | Implement ShapeFill.setImage fallback |
| Phase 3: Polish | Memory with large images (Pitfall 14) | Constrain image resolution, batch wisely |
| Phase 4: Cross-platform | Requirement set gaps (Pitfall 5) | Runtime capability detection, graceful degradation |

## Sources

- [PowerPoint Add-ins Overview](https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/powerpoint-add-ins) -- Official Microsoft docs, updated Feb 2026
- [PowerPoint JS API Requirement Sets](https://learn.microsoft.com/en-us/javascript/api/requirement-sets/powerpoint/powerpoint-api-requirement-sets) -- Requirement set compatibility matrix
- [PowerPoint API 1.8 Requirement Set](https://learn.microsoft.com/en-us/javascript/api/requirement-sets/powerpoint/powerpoint-api-1-8-requirement-set) -- Table APIs (addTable), shape grouping, image fills
- [PowerPoint Preview APIs](https://learn.microsoft.com/en-us/javascript/api/requirement-sets/powerpoint/powerpoint-preview-apis) -- addPicture (preview), addSlideOptions.index
- [ShapeCollection API Reference](https://learn.microsoft.com/en-us/javascript/api/powerpoint/powerpoint.shapecollection) -- Complete list of add* methods
- [Working with Shapes](https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/shapes) -- Shape creation, text frames, formatting
- [Add and Delete Slides](https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/add-slides) -- Slide master/layout ID handling
- [Insert Slides from Another Presentation](https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/insert-slides-into-presentation) -- insertSlidesFromBase64
- [Same-Origin Policy Limitations](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/addressing-same-origin-policy-limitations) -- CORS handling for add-ins
- [Tag Presentations, Slides, and Shapes](https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/tagging-presentations-slides-shapes) -- Tagging system, uppercase key behavior
- [Understanding the Office JavaScript API](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/understanding-the-javascript-api-for-office) -- API models, requirement sets
