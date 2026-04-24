---
phase: 05-chart-table-interpretation-slide-composition
plan: 03
subsystem: slide-composition-renderer
tags: [phase-5, wave-2, composed-renderer, vega-lite, office-js, table-options]

# Dependency graph
requires:
  - phase: 05-chart-table-interpretation-slide-composition/01
    provides: "vega/vega-lite runtime deps (Plan 01), Wave 0 test-file stubs (vegaRenderer/composedRenderer/tableRenderer) replaced in-place"
  - phase: 05-chart-table-interpretation-slide-composition/02
    provides: "CompositionPlan Zod type + composition schema consumed by ComposedSlideContent.tableSpec shape and composedRenderer dispatch"
provides:
  - "renderVegaToBase64Png — Vega-Lite spec + rows → raw base64 PNG (no data: prefix) for ShapeFill.setImage"
  - "ComposedSlideContent discriminated variant — regions[], chartPngBase64, tableSpec (extended with showRowNumbers), calloutText"
  - "composedRenderer.renderComposedSlide — single Office.js batch, fractionToPoints + hasOverlappingRegions pre-flight guardrail"
  - "tableRenderer.addTable — extended with TableRenderOptions (showRowNumbers, showRowTotals, showColumnTotals, showPagination, maxRows); 4 existing callers unchanged"
  - "slideRenderer.insertSlide — early-return dispatch to renderComposedSlide for content.type === 'composed'"
  - "tests/setup.ts — module-load PowerPoint/Office global stub so tableRenderer's CELL_BORDER (PowerPoint.ShapeLineDashStyle.solid) doesn't ReferenceError at import time"
  - "src/types/vega-lite.d.ts — ambient shim so tsconfig.moduleResolution:'node' accepts the vega-lite import (runtime unaffected — webpack/vitest read exports map directly)"
affects: [phase-5-plan-04]

# Tech tracking
tech-stack:
  added: []  # All deps installed in Plan 01
  patterns:
    - "Fractional regions → integer points via Math.round (CMPS-02)"
    - "Pairwise axis-aligned rectangle intersection (G3 guardrail) — strict touching-edge non-overlap"
    - "Raw base64 PNG output (strip data: prefix) — canonical ShapeFill.setImage contract, mirrors imageUtils.ts:60"
    - "TableRenderOptions ordering: row totals → row numbers → column totals — guarantees grand total at bottom-right"
    - "Vitest setupFiles global PowerPoint stub — lets module-level enum references resolve at import, tests override with vi.stubGlobal"
    - "Ambient module shim for packages using 'exports' map under legacy moduleResolution:'node'"

key-files:
  created:
    - "src/taskpane/services/vegaRenderer.ts — renderVegaToBase64Png (vegaLite.compile → vega.View.toCanvas → split(',')[1])"
    - "src/taskpane/slide/composedRenderer.ts — renderComposedSlide + fractionToPoints + hasOverlappingRegions"
    - "tests/setup.ts — vitest global PowerPoint/Office stub"
    - "src/types/vega-lite.d.ts — ambient shim for vega-lite package exports"
  modified:
    - "src/taskpane/services/vegaRenderer.test.ts — Plan 01 4 it.todo stubs replaced with 8 real tests"
    - "src/taskpane/slide/composedRenderer.test.ts — Plan 01 3 it.todo stubs replaced with 16 real tests"
    - "src/taskpane/slide/tableRenderer.test.ts — Plan 01 4 it.todo stubs replaced with 8 real tests"
    - "src/taskpane/slide/types.ts — added ComposedSlideContent interface + widened SlideContent union additively"
    - "src/taskpane/slide/tableRenderer.ts — exported TableRenderOptions, extended addTable 5th optional param with full option processing"
    - "src/taskpane/services/slideRenderer.ts — import renderComposedSlide + early-return dispatch before PowerPoint.run"
    - "vitest.config.ts — added setupFiles: ['./tests/setup.ts']"

key-decisions:
  - "Test spy strategy for vega-lite compile: ESM module namespace is non-configurable under vitest, so vi.spyOn(vegaLite, 'compile') and vi.spyOn(vega, 'parse') both fail with 'Cannot redefine property'. Switched to spying on vega.View.prototype.runAsync and capturing signals (width/height/background) via this.signal() after run. See Deviation §1."
  - "Ambient vega-lite shim vs tsconfig upgrade: tsconfig's moduleResolution:'node' doesn't read vega-lite's package.json exports map. Added a local ambient module declaration (src/types/vega-lite.d.ts) re-exporting from 'vega-lite/build/index' — keeps the rest of the monorepo's tsconfig untouched while satisfying tsc. Runtime resolution (webpack, vitest) follows the real exports map. See Deviation §2."
  - "tests/setup.ts global PowerPoint stub: tableRenderer.ts constructs CELL_BORDER at module load using PowerPoint.ShapeLineDashStyle.solid, which would ReferenceError under vitest 'node' environment. A vitest setupFiles entry populates a minimal PowerPoint global before any tests run — tests that actually exercise PowerPoint.run override via vi.stubGlobal. Cleaner than restructuring production code to lazy-init CELL_BORDER. See Deviation §3."
  - "Option processing ordering (TABL-NATV-01): row totals first, then row numbers, then column totals. The 'first' pass produces a Total column on the body rows; subsequent column-totals pass sees the Total column as numeric and produces a grand total there — so bottom-right cell is always the grand total when both dimensions are enabled."
  - "Touching edges are NOT overlap in hasOverlappingRegions: two regions sharing an edge (e.g., {x:0, w:0.5} + {x:0.5, w:0.5}) satisfy `a.x + a.w <= b.x` strictly. This matches how layout designers think about adjacent regions — proximity is not collision. Composer upstream is responsible for any tolerance (T-05-15 accepted)."
  - "composedRenderer table path type-narrows cell values via `typeof v === 'number' ? v : String(v ?? '')` (T-05-17 mitigation): prevents object-shaped values from leaking into tableRenderer's styling logic."

patterns-established:
  - "Pattern: vitest ESM spy avoidance — when spyOn(module, 'fn') fails with 'Cannot redefine', spy on prototype methods (.prototype.method) or observable side effects (signals, constructor arguments) instead."
  - "Pattern: ambient module shim for packages whose types live under 'exports' map — create a .d.ts that `declare module 'x' { export * from 'x/build/index' }` under tsconfig node moduleResolution."
  - "Pattern: vitest global setup for Office.js host globals — a minimal PowerPoint enum stub at setupFiles unlocks all tests that import slide modules, without requiring each test to re-stub."

requirements-completed: [CHRT-01, CHRT-02, CHRT-03, CHRT-04, CMPS-02, TABL-NATV-01]

# Metrics
duration: 17min
completed: 2026-04-24
---

# Phase 5 Plan 03: Slide Composition Renderer Summary

**Wave 2 rendering stack landed: vegaRenderer compiles Vega-Lite + rows to raw base64 PNG; composedRenderer maps fractional regions to Office.js shapes inside a single PowerPoint.run; tableRenderer gains TableRenderOptions (row numbers, row/column totals, pagination, maxRows); slideRenderer.insertSlide early-dispatches the new composed variant. Full Vitest suite 137 passing, 0 failures, 0 todo.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-04-24T02:11:40Z
- **Completed:** 2026-04-24T02:29:18Z
- **Tasks:** 3 (all type="auto" tdd="true")
- **Files modified:** 11 (4 created, 7 modified)
- **Commits:** 6 (3 RED test-commits + 3 GREEN implementation commits)

## Accomplishments

- **vegaRenderer.ts** — `renderVegaToBase64Png({spec, rows, widthPx, heightPx, scaleFactor})` compiles a Vega-Lite spec via `vegaLite.compile(spec).spec`, parses to a Vega runtime, constructs a headless `vega.View`, injects rows via `view.data('table', rows)`, runs the dataflow, exports via `view.toCanvas(scaleFactor ?? 2)`, and returns `dataUrl.split(',')[1]` (raw base64 with no `data:` prefix — canonical ShapeFill.setImage contract per Pitfall 7). Width (default 1200), height (default 800), and `background: "#FFFFFF"` are injected into a shallow spec clone at render time — composer omits these per system-prompt rule. Input spec is never mutated.
- **types.ts** — added `ComposedSlideContent` interface with fields `{type: "composed", title, subtitle?, commentary, regions[], chartPngBase64?, tableSpec?, calloutText?}` and widened the `SlideContent` union additively. Existing variants (`TextOnlyContent`, `ChartTextContent`, `TableTextContent`, `FullCombinationContent`) unchanged. `tableSpec` extended with a `rows: Array<Record<string, unknown>>` field (resolved data) and `showRowNumbers?: boolean` (threaded from Cube AI's `tableChartSpec` at Plan 04 wiring time per TABL-NATV-01).
- **composedRenderer.ts** — three exports: `renderComposedSlide(content)` runs a single `PowerPoint.run`, detects slide width (GA fallback 960pt), creates a slide, iterates `content.regions[]` mapping fractional coords → integer points → dispatches by `region.kind` to the existing text/shape/table primitives; `fractionToPoints(region, slideWidthPt, slideHeightPt)` rounds via `Math.round`; `hasOverlappingRegions(regions)` is an O(n²) pairwise axis-aligned rectangle intersection test (G3 guardrail, strict touching-edge non-overlap).
- **slideRenderer.ts** — added `import { renderComposedSlide } from "../slide/composedRenderer"` and an EARLY RETURN at the top of `insertSlide` before the `PowerPoint.run` block: `if (content.type === "composed") return renderComposedSlide(content)`. TypeScript's narrowing after the early return excludes `ComposedSlideContent` from the union for the existing switch statements — no `default` branch needed.
- **tableRenderer.ts** — exported `TableRenderOptions` interface and extended `addTable` to a 5-param signature with an optional `options` parameter. Absent options preserve existing behaviour verbatim (all 4 existing callers in `slideRenderer.ts` compile unchanged). `showRowNumbers` prepends a `#` column with 1..N body numbering; `showRowTotals` appends a `Total` column with per-row numeric sums; `showColumnTotals` appends a footer row with per-column numeric sums; `showPagination` logs a `console.info` note and no-ops (TableV2 has no native pagination). `maxRows` overrides the default 10-row cap.
- **tests/setup.ts** (new) — vitest `setupFiles` entry that populates `globalThis.PowerPoint` and `globalThis.Office` with minimal enum stubs before any tests import modules. This unblocks tableRenderer's `CELL_BORDER = {dashStyle: PowerPoint.ShapeLineDashStyle.solid}` (evaluated at module load), which previously would ReferenceError under the `environment: "node"` Vitest default.
- **src/types/vega-lite.d.ts** (new) — ambient module declaration `declare module "vega-lite" { export * from "vega-lite/build/index"; }`. vega-lite v6 ships types through `package.json` `exports`.`"."` which tsconfig's `moduleResolution: "node"` cannot resolve. The shim satisfies tsc without touching the rest of the tsconfig; runtime resolvers (webpack, vitest) follow the real exports map and are unaffected.
- **Full Vitest suite:** 137 passing, 0 failures, 0 todo, duration ~7s (of which transform 6.7s, tests 1.8s). 32 new tests added across three files (8 vegaRenderer + 16 composedRenderer + 8 tableRenderer).

## Task Commits

Each task was committed with atomic RED then GREEN commits (`--no-verify` per parallel-executor protocol):

1. **Task 1 RED: vegaRenderer test suite** — `9b21d58` (test)
2. **Task 1 GREEN: renderVegaToBase64Png implementation** — `2e4df8d` (feat)
3. **Task 2 RED: composedRenderer test suite** — `7bbb867` (test)
4. **Task 2 GREEN: composedRenderer + types extension + slideRenderer dispatch + tableRenderer options-param stub + vitest setup + vega-lite shim** — `6285296` (feat)
5. **Task 3 RED: tableRenderer TableRenderOptions test suite** — `5770163` (test)
6. **Task 3 GREEN: TableRenderOptions processing in addTable** — `228df3d` (feat)

## Files Created/Modified

### Created
- `src/taskpane/services/vegaRenderer.ts` — ~65 lines, renderVegaToBase64Png with full spec injection + stripping logic
- `src/taskpane/slide/composedRenderer.ts` — ~135 lines, renderComposedSlide + fractionToPoints + hasOverlappingRegions + per-kind dispatch
- `tests/setup.ts` — global PowerPoint/Office stubs for vitest setupFiles
- `src/types/vega-lite.d.ts` — ambient module declaration

### Modified
- `src/taskpane/services/vegaRenderer.test.ts` — 8 tests (CHRT-01..04 + non-mutation + width/height/background + scaleFactor + view.data skip)
- `src/taskpane/slide/composedRenderer.test.ts` — 16 tests (fractionToPoints×3, hasOverlappingRegions×5, renderComposedSlide×8)
- `src/taskpane/slide/tableRenderer.test.ts` — 8 tests (backward-compat + showRowNumbers + showColumnTotals + showRowTotals + combined grand total + showPagination + maxRows + type existence)
- `src/taskpane/slide/types.ts` — ComposedSlideContent interface + union extension
- `src/taskpane/slide/tableRenderer.ts` — TableRenderOptions export + 5th-param processing (row totals → row numbers → column totals ordering)
- `src/taskpane/services/slideRenderer.ts` — renderComposedSlide import + early-return dispatch
- `vitest.config.ts` — setupFiles entry

## ComposedSlideContent Field Enumeration + Union Diff

**New variant:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | `"composed"` (literal) | ✓ | Discriminator |
| `title` | `string` | ✓ | Injected into title-kind regions |
| `subtitle` | `string` | — | Injected into subtitle-kind regions if set |
| `commentary` | `string` | ✓ | Injected into commentary-kind regions (as single bullet via addBody) |
| `regions` | `Array<{id, kind, x, y, w, h}>` | ✓ | Fractional coords [0, 1], `kind ∈ 6 values` |
| `chartPngBase64` | `string` (raw base64) | — | Absent → chart regions skipped |
| `tableSpec` | `{renderMode, columns, rows, show*, ...}` | — | Absent → table regions skipped |
| `calloutText` | `string` | — | Absent → callout regions skipped |

**Union diff:**

```typescript
// Before Plan 03:
export type SlideContent =
  | TextOnlyContent
  | ChartTextContent
  | TableTextContent
  | FullCombinationContent;

// After Plan 03 (additive widening):
export type SlideContent =
  | TextOnlyContent
  | ChartTextContent
  | TableTextContent
  | FullCombinationContent
  | ComposedSlideContent;   // NEW
```

All existing variants unchanged; early-return dispatch in `slideRenderer.insertSlide` handles the new variant before TS narrows the union for the pre-existing switch.

## composedRenderer Dispatch Table (region.kind → primitive)

| region.kind | Primitive | Content source | Skip condition |
|-------------|-----------|----------------|----------------|
| `title` | `addTitle(shapes, content.title, rect)` | `content.title` (required) | Never |
| `subtitle` | `addSummaryText(shapes, content.subtitle, rect)` | `content.subtitle` (optional) | `subtitle` absent |
| `commentary` | `addBody(shapes, [content.commentary], rect)` | `content.commentary` (required) | Never |
| `callout` | `addCalloutBox(shapes, content.calloutText, rect)` | `content.calloutText` (optional) | `calloutText` absent |
| `chart` | `shapes.addGeometricShape(rectangle, rect)` + `shape.fill.setImage(content.chartPngBase64)` | `content.chartPngBase64` (raw base64) | `chartPngBase64` absent |
| `table` | `addTable(shapes, headers, bodyRows, rect, tableOptions)` | `content.tableSpec.columns + rows + show* flags` | `tableSpec` absent |

Chart region sets `shape.lineFormat.weight = 0` (no border) and `shape.altTextDescription = content.title` (a11y).

Table region type-narrows cells: `typeof v === "number" ? v : String(v ?? "")` (T-05-17 mitigation).

## fractionToPoints Rounding Behaviour

```typescript
fractionToPoints({x: 0.5,   y: 0.5, w: 0.5,   h: 0.5}, 960, 540) → {left: 480, top: 270, width: 480, height: 270}
fractionToPoints({x: 0.333, y: 0,   w: 0.333, h: 1},   960, 540) → {left: 320, top: 0,   width: 320, height: 540}   // Math.round(319.68) = 320
fractionToPoints({x: 0,     y: 0,   w: 1,     h: 1},   960, 540) → {left: 0,   top: 0,   width: 960, height: 540}
```

All four fields are rounded independently to integer points via `Math.round`. A 1-pixel seam is possible at some fractional boundaries (T-05-15 accepted — visually absorbed by text frame insets).

## hasOverlappingRegions Semantics

**Predicate:** `!(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)`

**Strict touching-edge non-overlap:**

| Case | Regions | Overlap? |
|------|---------|----------|
| Identical | `{0.1, 0.1, 0.4, 0.4}` twice | ✓ overlap |
| Partial | `{0.1, 0.1, 0.5, 0.5}` + `{0.3, 0.3, 0.5, 0.5}` | ✓ overlap |
| Touching edge (left/right split) | `{0, 0, 0.5, 1}` + `{0.5, 0, 0.5, 1}` | ✗ no overlap |
| Non-adjacent | `{0, 0, 0.3, 0.3}` + `{0.5, 0.5, 0.3, 0.3}` | ✗ no overlap |
| Single region | `[{0, 0, 1, 1}]` | ✗ no overlap |

G3 composer upstream (Plan 02) is responsible for any proximity tolerance. The renderer trusts — `hasOverlappingRegions` is exposed for pre-flight checks by callers, not called inside `renderComposedSlide`.

## vegaRenderer Injection Strategy

- Input spec is shallow-cloned via `{...opts.spec, width, height, background: "#FFFFFF"}` — **input is never mutated**.
- `widthPx` defaults to `1200`; `heightPx` defaults to `800`; `scaleFactor` defaults to `2` (retina).
- Composer omits `width`/`height`/`background` from its emitted spec per `05-AI-SPEC.md` system prompt rule — centralising sizing here.
- Output: `dataUrl.split(",")[1]` strips the `data:image/png;base64,` prefix. Return value is raw base64 suitable for `ShapeFill.setImage` (Pitfall 7).
- If `rows` is absent or empty, `view.data(...)` is skipped — the spec may have inline data (`{data: {values: [...]}}`).

## tableRenderer TableRenderOptions Ordering

Options are processed in this order:

1. **Row totals** (append `Total` column with per-row numeric sum, using RAW input rows)
2. **Row numbers** (prepend `#` column with 1..N body numbering)
3. **Column totals** (append footer row with per-column numeric sum, including the Total column from step 1 → grand total at bottom-right)

Column-totals labelling:
- If `showRowNumbers` is on, the `#` column footer cell gets `"Total"` label.
- The leftmost non-numeric column (excluding `#` if present) also gets `"Total"` label.
- All other non-numeric column footer cells are empty strings.

`showPagination`: intentionally unsupported — logs a `console.info` note and no-ops (TableV2 has no native pagination).

`maxRows`: overrides default 10 row cap. Applied to input rows BEFORE totals/numbering augmentation, so the cap doesn't shorten the totals row.

## slideRenderer Early-Dispatch Insertion Point

```typescript
export async function insertSlide(content: SlideContent, productImageBase64?: string): Promise<void> {
  // Phase 5: composed slides own their regions + PowerPoint.run lifecycle.
  // Early-return to avoid nested PowerPoint.run (Office.js does not support nesting).
  if (content.type === "composed") {
    return renderComposedSlide(content);
  }

  await PowerPoint.run(async (context) => {
    // ... existing template logic unchanged ...
  });
}
```

Inserted **between** the function signature and the `await PowerPoint.run(...)` call. TypeScript's type narrowing after the early return removes `ComposedSlideContent` from the remaining union, so the existing switch statements (no `default` branch) still pass exhaustiveness checks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vitest ESM namespace spy limitation**
- **Found during:** Task 1 first test run (injection test).
- **Issue:** Plan's test code used `vi.spyOn(vegaLite, "compile")` to observe the width/height/background injection on the compiled spec. This throws `TypeError: Cannot redefine property: compile — Module namespace is not configurable in ESM` under Vitest 4.1 with ESM imports. Attempted fallbacks on `vi.spyOn(vega, "parse")` and `vi.spyOn(vega, "View")` fail with the same error.
- **Fix:** Rewrote the test to spy on `vega.View.prototype.runAsync` (prototype methods are configurable) and capture the view's width/height/background signals via `this.signal("width")` etc. after the dataflow runs. The signals preserve the top-level values from the compiled Vega spec.
- **Files modified:** `src/taskpane/services/vegaRenderer.test.ts`
- **Verification:** Injection test passes; spec is confirmed to receive width=640, height=480, background="#FFFFFF" when explicit dimensions are provided. The non-mutation check (split into a second test) independently confirms the input spec is not mutated.
- **Committed in:** `2e4df8d` (Task 1 GREEN).

**2. [Rule 3 - blocking] tsconfig moduleResolution can't resolve vega-lite "exports" field**
- **Found during:** Task 1 tsc check.
- **Issue:** vega-lite v6 ships types through `package.json` `exports`.`"."`  → `./build/index.d.ts`. Under tsconfig's `moduleResolution: "node"` (legacy, non-NodeNext), the exports map is ignored and `import * as vegaLite from "vega-lite"` fails with `TS2307: Cannot find module 'vega-lite'`. Runtime resolution (webpack, vitest) is unaffected because both read exports maps directly.
- **Fix:** Added a local ambient declaration at `src/types/vega-lite.d.ts` that re-exports from `"vega-lite/build/index"` under `declare module "vega-lite"`. TypeScript picks up the shim via include-by-default; runtime is untouched.
- **Files modified:** `src/types/vega-lite.d.ts` (new)
- **Verification:** `npx tsc --noEmit` emits no errors for Plan 03 files; `npx vitest run` passes all vegaRenderer tests.
- **Committed in:** `6285296` (Task 2 GREEN — bundled with composedRenderer commit since the shim unblocks composedRenderer's indirect vega-lite type dependency).
- **Alternative considered:** Upgrading tsconfig.moduleResolution to `"node16"` or `"bundler"` — rejected because it would affect the entire codebase's module resolution semantics and risk cascading issues in Phase 1-4 code outside this plan's scope.

**3. [Rule 3 - blocking] PowerPoint global not defined at module load under vitest**
- **Found during:** Task 2 first test run (composedRenderer suite).
- **Issue:** `tableRenderer.ts` constructs `CELL_BORDER = { dashStyle: PowerPoint.ShapeLineDashStyle.solid, ... }` at module-top-level. When `composedRenderer.test.ts` imports `composedRenderer` → `tableRenderer`, the reference to `PowerPoint.ShapeLineDashStyle.solid` throws `ReferenceError: PowerPoint is not defined` before any test's `beforeEach` can run `vi.stubGlobal("PowerPoint", ...)`.
- **Fix:** Added `tests/setup.ts` with `globalThis.PowerPoint = { ShapeLineDashStyle: {solid, dash}, ... }` and `globalThis.Office = {...}` stubs, and wired `setupFiles: ["./tests/setup.ts"]` in `vitest.config.ts`. Individual tests still override with `vi.stubGlobal` when exercising `PowerPoint.run`; the module-level stub is a minimal safety net for import-time references.
- **Files modified:** `tests/setup.ts` (new), `vitest.config.ts`
- **Verification:** All 16 composedRenderer tests pass; all 8 tableRenderer tests pass; all 8 vegaRenderer tests pass; full suite (137 tests) passes.
- **Committed in:** `6285296` (Task 2 GREEN).
- **Alternative considered:** Restructuring `tableRenderer.ts` to lazy-init `CELL_BORDER` inside `addTable` — rejected because it adds cost per call and mutates stable production code for a test-environment artefact.

**4. [Rule 3 - scope] TableRenderOptions interface declared in Task 2, processing deferred to Task 3**
- **Found during:** Task 2 composedRenderer implementation.
- **Issue:** `composedRenderer.ts` imports `TableRenderOptions` from `./tableRenderer` and passes an options object to `addTable`. Per the plan, Task 3 extends `addTable` with the 5th parameter. To keep Task 2 compilable AND avoid a circular task dependency, I added the `TableRenderOptions` interface + optional 5th param (ignored via `void _options`) in Task 2's tableRenderer edit, then filled in the actual option processing in Task 3.
- **Fix:** Split the tableRenderer change across Task 2 (type + param stub) and Task 3 (processing logic). This matches the plan's task boundaries better than bundling everything into Task 3.
- **Files modified:** `src/taskpane/slide/tableRenderer.ts` (Task 2 added interface + param stub; Task 3 added processing)
- **Verification:** Task 2 tests pass with the stub (options discarded); Task 3 tests pass with the full processing. No change to 4 existing `slideRenderer.ts` callers.
- **Committed in:** `6285296` (Task 2 stub) + `228df3d` (Task 3 processing).

---

**Total deviations:** 4 auto-fixed (1 Rule 1 bug, 3 Rule 3 blocking).

**Impact on plan:** All fixes were localised; no public API changes, no test-contract changes. The vega-lite shim, tests/setup.ts, and the tableRenderer split are tactical workarounds that keep the rest of the codebase untouched. All plan success criteria (grep counts, test pass, tsc clean on Plan 03 files) met.

## Issues Encountered

- **Windows CRLF warnings** on all newly-created files during `git add`. Cosmetic; `git core.autocrlf` handles the conversion. Same pattern as Plans 01, 02.
- **vega-lite color-hex warnings on stderr** during test runs (inherited from Plan 02's compositionRetry.ts Ajv path). Not related to this plan's changes.
- **Pre-existing tsc errors** in Phase 3/4 files (composer.ts Zod deep inference, sqlTranslator.ts ES2018 regex flags, cubeai.ts externalId typo, compositionRetry.ts `resolveJsonModule`). These existed before Plan 03 and are documented in prior summaries. My Plan 03 files compile cleanly.

## User Setup Required

No additional user setup for Plan 03. Phase 5's Anthropic API key and Cube REST credentials (from Plan 01) carry forward for Plan 04 wiring; Plan 03's renderer layer is purely deterministic.

## Next Phase Readiness

- **Ready for Plan 04 (UI wiring + live preview + eval harness):** `insertSlide(composedSlideContent)` is the single entry point. Plan 04 will:
  1. Call `composeWithRetry(input, cb)` → receive `CompositionPlan` from Plan 02.
  2. If `chartSpec` present, render to base64 via `renderVegaToBase64Png({spec: chartSpec, rows: cubeDataRows})` (Plan 03).
  3. Assemble `ComposedSlideContent` → call `insertSlide(content)` (dispatches to Plan 03 `renderComposedSlide`).
  4. `showRowNumbers` threading from `tableChartSpec` (per TABL-NATV-01) happens at Plan 04 wiring time — the ComposedSlideContent.tableSpec already has the field.
- **UAT prerequisites unchanged from Plans 01-02:** Anthropic API key + Cube REST JWT still required for end-to-end smoke tests (D-23, D-24 external blockers).

## Threat Flags

No new threat surface introduced beyond the plan's `<threat_model>`. All identified threats have mitigations landed:

- **T-05-13 (Tampering — Vega-Lite spec XSS):** Chart renders to `<canvas>` — no HTML execution path from spec to slide. `view.toCanvas()` is the only exfiltration route, returning an opaque bitmap. ✓ mitigated.
- **T-05-14 (DoS — 500+ regions):** Composer Zod schema caps at 6 regions (Plan 02 `CompositionPlanSchema.regions.max(6)`). Enforced upstream — this renderer trusts the cap. ✓ mitigated.
- **T-05-15 (Tampering — G3 bypass via 1px rounding):** `fractionToPoints` uses `Math.round`; 1-pixel seams possible at some fractional boundaries. Visually absorbed by text frame inset; accepted trade-off — not exploitable, merely cosmetic. ✓ accepted.
- **T-05-16 (Info Disclosure — base64 PNG logged):** Renderer does not log chart bytes. No telemetry hook in this layer. ✓ accepted (no leak path).
- **T-05-17 (Tampering — malformed tableSpec rows):** `composedRenderer` narrows each cell via `typeof v === "number" ? v : String(v ?? "")` before passing to `addTable`. Non-primitive values coerce to `"[object Object]"` — unsightly but non-exploitable. ✓ mitigated.

## Known Stubs

None. All files wire real logic to real external modules (vega-lite, vega, Office.js PowerPoint). The `tests/setup.ts` PowerPoint global is test-only and explicitly flagged as a stub — it throws if `PowerPoint.run` is called without being overridden by a specific test's `vi.stubGlobal`.

## TDD Gate Compliance

Plan frontmatter is `type: execute` with all three tasks carrying `tdd="true"`. All tasks followed the strict RED → GREEN cycle:

- **Task 1:** RED commit `9b21d58` (test-only, all tests fail — module doesn't exist) → GREEN commit `2e4df8d` (implementation + passing tests).
- **Task 2:** RED commit `7bbb867` (test-only, module doesn't exist) → GREEN commit `6285296` (implementation + passing tests).
- **Task 3:** RED commit `5770163` (test-only, 6/8 tests fail — options logic not implemented) → GREEN commit `228df3d` (implementation + passing tests).

Gate sequence verified in git log: three `test(...)` commits precede three `feat(...)` commits. No REFACTOR commits necessary.

## Self-Check: PASSED

**Created files exist:**
- `src/taskpane/services/vegaRenderer.ts` — FOUND
- `src/taskpane/slide/composedRenderer.ts` — FOUND
- `tests/setup.ts` — FOUND
- `src/types/vega-lite.d.ts` — FOUND

**Commits exist:**
- `9b21d58` (Task 1 RED) — FOUND
- `2e4df8d` (Task 1 GREEN) — FOUND
- `7bbb867` (Task 2 RED) — FOUND
- `6285296` (Task 2 GREEN) — FOUND
- `5770163` (Task 3 RED) — FOUND
- `228df3d` (Task 3 GREEN) — FOUND

**Success criteria verified:**
- `npx vitest run`: 137 passed, 0 failures, 0 todo, ~7s
- `npx tsc --noEmit`: 0 errors in Plan 03 files (composedRenderer.ts, vegaRenderer.ts, tableRenderer.ts, types.ts, slideRenderer.ts). Pre-existing Phase 3/4 errors unchanged.
- `grep -c "ComposedSlideContent" src/taskpane/slide/types.ts`: 2 hits (≥ 2 required) ✓
- `grep -c "renderComposedSlide\|fractionToPoints\|hasOverlappingRegions" src/taskpane/slide/composedRenderer.ts`: 7 hits (≥ 3 required) ✓
- `grep -n "renderComposedSlide" src/taskpane/services/slideRenderer.ts`: 2 hits (≥ 2 required: import + early return) ✓
- `grep -c "TableRenderOptions\|showRowNumbers\|showColumnTotals\|showRowTotals\|showPagination" src/taskpane/slide/tableRenderer.ts`: 16 hits (≥ 5 required) ✓
- `grep -n "view.toCanvas\|split(\",\")" src/taskpane/services/vegaRenderer.ts`: 4 hits (≥ 2 required) ✓
- `grep -c "PowerPoint.run" src/taskpane/slide/composedRenderer.ts`: 1 hit (exactly 1 required for single-run discipline) ✓
- `grep -n "background.*FFFFFF" src/taskpane/services/vegaRenderer.ts`: 1 hit (≥ 1 required) ✓

---
*Phase: 05-chart-table-interpretation-slide-composition*
*Completed: 2026-04-24*
