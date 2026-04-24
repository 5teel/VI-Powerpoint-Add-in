/**
 * Vega-Lite spec + rows → raw base64 PNG (CHRT-01..04).
 *
 * Compiles a Vega-Lite spec via vegaLite.compile, constructs a headless vega.View,
 * injects row data via view.data(...), runs the dataflow, and exports a canvas to
 * raw base64 PNG (no data URL prefix).
 *
 * The output format matches Office.js ShapeFill.setImage contract (raw base64, no
 * "data:image/png;base64," prefix) — see 05-RESEARCH.md Pitfall 7 and the canonical
 * strip pattern in imageUtils.ts (line 60).
 *
 * Under Vitest (node env), view.toCanvas returns a node-canvas-like object rather
 * than a DOM HTMLCanvasElement. Tests mock the toCanvas return shape; at the
 * browser boundary we type-cast to HTMLCanvasElement.
 */

// vega-lite v6 ships types via "exports"."." → ./build/index.d.ts. tsconfig's
// moduleResolution:"node" can't resolve the "exports" map, but a local ambient
// declaration at src/types/vega-lite.d.ts shims the package so tsc accepts the
// import. Runtime resolution (webpack, vitest) follows the exports field.
import * as vegaLite from "vega-lite";
import * as vega from "vega";

export interface VegaRenderOptions {
  /** Vega-Lite spec (may reference a named dataset "table" that rows feeds). */
  spec: Record<string, unknown>;
  /** Row data bound to the spec's named dataset (typically "table"). Optional if spec has inline data. */
  rows?: unknown[];
  /** Override default chart width (px). Default: 1200. */
  widthPx?: number;
  /** Override default chart height (px). Default: 800. */
  heightPx?: number;
  /** Pixel-density scale factor. Default: 2 (retina). */
  scaleFactor?: number;
}

/**
 * Compiles a Vega-Lite spec, binds rows, and exports a PNG as raw base64.
 *
 * The composer is expected to omit `width`, `height`, and `background` from the
 * spec — this function injects them at render time to centralise sizing policy.
 *
 * @returns Raw base64 string (NO "data:" prefix) suitable for ShapeFill.setImage.
 */
export async function renderVegaToBase64Png(opts: VegaRenderOptions): Promise<string> {
  // Shallow-clone the spec so we don't mutate the caller's object, and inject sizing.
  const specWithSize = {
    ...opts.spec,
    width: opts.widthPx ?? 1200,
    height: opts.heightPx ?? 800,
    background: "#FFFFFF",
  };

  const vgSpec = vegaLite.compile(specWithSize as vegaLite.TopLevelSpec).spec;
  const runtime = vega.parse(vgSpec);
  const view = new vega.View(runtime, { renderer: "canvas" });

  if (opts.rows && opts.rows.length > 0) {
    view.data("table", opts.rows);
  }

  await view.runAsync();

  const canvas = await view.toCanvas(opts.scaleFactor ?? 2);
  // In a browser, view.toCanvas returns HTMLCanvasElement. Under Vitest, tests
  // inject a mock canvas-like object with toDataURL. Cast at the boundary.
  const dataUrl = (canvas as HTMLCanvasElement).toDataURL("image/png");

  // Strip "data:image/png;base64," prefix for Office.js ShapeFill.setImage (Pitfall 7).
  // Mirrors imageUtils.ts line 60.
  return dataUrl.split(",")[1];
}
