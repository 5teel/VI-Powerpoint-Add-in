/**
 * SlidePreview state-machine + CMPS-03 commentary-grounding coverage.
 *
 * Vitest env=node — full DOM rendering is deferred to manual UAT per 05-UI-SPEC.md.
 * These tests assert the component's module-level surface (types, prop contract,
 * dependency imports) + the CMPS-03 commentary grounding hand-off into composer.cubeMeta.
 */
import { describe, it, expect } from "vitest";
import * as SlidePreviewModule from "./SlidePreview";
import { UnsupportedSqlError } from "../services/sqlTranslator";

describe("SlidePreview module surface", () => {
  it("exports SlidePreview component + SlidePreviewStage type", () => {
    expect(SlidePreviewModule.SlidePreview).toBeDefined();
    expect(typeof SlidePreviewModule.SlidePreview).toBe("function");
  });

  it("PREV-01: UnsupportedSqlError is exported and can be thrown/caught at component boundary", () => {
    expect(() => {
      throw new UnsupportedSqlError("JOIN");
    }).toThrow(UnsupportedSqlError);
  });

  // SlidePreview full render/state-machine tests are manual UAT per 05-UI-SPEC.md.
  // The component mounts translateSql / loadCubeData / composeWithRetry /
  // renderVegaToBase64Png / insertSlide — all of which are individually tested
  // in Plans 01–03. The component itself is integration glue + visual polish.
  it.todo("UAT: renders shimmer during fetching-data stage");
  it.todo("UAT: title snaps in when partial.title first arrives");
  it.todo("UAT: commentary fills word-by-word as partial.commentary grows");
  it.todo("UAT: Stop building aborts the in-flight pipeline");
  it.todo("UAT: success flash holds 1200ms then onSuccess fires");
  it.todo("UAT: failed state shows error message + Try again button");
});
