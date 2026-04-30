/**
 * Vitest global setup — stubs Office.js / PowerPoint globals so module-load
 * references (e.g., PowerPoint.ShapeLineDashStyle.solid in slide/tableRenderer.ts)
 * don't throw ReferenceError when test files import them.
 *
 * Individual tests may override these stubs via vi.stubGlobal(...) in their
 * beforeEach blocks — the module-level stubs are a minimal safety net.
 */

// Minimal PowerPoint enum stubs — enough for module-load references to resolve.
// Tests that actually exercise PowerPoint.run(...) override with vi.stubGlobal.
(globalThis as unknown as { PowerPoint: unknown }).PowerPoint = {
  run: async (_cb: unknown) => {
    throw new Error("PowerPoint.run not stubbed in this test — call vi.stubGlobal('PowerPoint', ...)");
  },
  GeometricShapeType: { rectangle: "rectangle" },
  ParagraphHorizontalAlignment: { left: "left", center: "center", right: "right" },
  TextVerticalAlignment: { top: "top", middle: "middle", bottom: "bottom" },
  ShapeLineDashStyle: { solid: "solid", dash: "dash" },
};

(globalThis as unknown as { Office: unknown }).Office = {
  context: { requirements: { isSetSupported: () => false } },
};

// Phase 7 Wave 0 — jsdom doesn't implement scrollIntoView, but ChatPanel uses
// it in a useEffect. Stub it here so component tests render without throwing.
// Only applies in jsdom env (Element exists); node-env tests are unaffected.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* no-op stub for jsdom */
  };
}
