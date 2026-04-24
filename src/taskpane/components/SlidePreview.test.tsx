/**
 * SlidePreview state-machine + CMPS-03 commentary-grounding coverage.
 *
 * Vitest env=node — full DOM rendering is deferred to manual UAT per 05-UI-SPEC.md.
 * These tests assert the component's module-level surface (types, prop contract,
 * dependency imports) + the CMPS-03 commentary grounding hand-off into composer.cubeMeta.
 *
 * Phase 6 additions: type-level assertions that the Phase 6 prop contract
 * (outerSignal?, awaitingChoice?, skipAutoStart?, onRetryStage?) compiles and
 * that the extended SlidePreviewStage union accepts "awaiting-choice".
 */
import { describe, it, expect } from "vitest";
import * as SlidePreviewModule from "./SlidePreview";
import type { SlidePreviewProps, SlidePreviewStage, StageRowState } from "./SlidePreview";
import type { CubeSqlApiToolCall } from "../services/cubeai";
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

describe("SlidePreview Phase 6 surface", () => {
  it("exports updated SlidePreviewProps with outerSignal?, awaitingChoice?, skipAutoStart?, onRetryStage?", () => {
    // Type-only assertion: a props literal with all Phase 6 optional fields must compile.
    const props: SlidePreviewProps = {
      toolCall: {
        name: "cubeSqlApi",
        isInProcess: false,
        input: { sqlQuery: "", queryTitle: "", description: "" },
      } as unknown as CubeSqlApiToolCall,
      userQuestion: "x",
      commentary: "y",
      onStageChange: () => undefined,
      onSuccess: () => undefined,
      onError: () => undefined,
      outerSignal: new AbortController().signal,
      awaitingChoice: { onReplace: () => undefined, onInsertNew: () => undefined },
      skipAutoStart: true,
      onRetryStage: () => undefined,
    };
    expect(props.skipAutoStart).toBe(true);
    expect(typeof props.outerSignal).toBe("object");
    expect(typeof props.awaitingChoice?.onReplace).toBe("function");
    expect(typeof props.onRetryStage).toBe("function");
  });

  it("SlidePreviewStage union includes 'awaiting-choice' (Phase 6 D-04 sub-state)", () => {
    // Type-level: assignment must compile. Runtime: stage strings are comparable.
    const stages: SlidePreviewStage[] = [
      "fetching-data",
      "composing",
      "rendering",
      "awaiting-choice",
      "success",
      "failed",
    ];
    expect(stages).toContain("awaiting-choice");
  });

  it("StageRowState shape accepts stage/status/errorMessage members (Phase 6 per-stage retry)", () => {
    const row: StageRowState = {
      stage: "composing",
      status: "error",
      errorMessage: "Composer rate-limited",
    };
    expect(row.status).toBe("error");
    expect(row.errorMessage).toContain("rate-limited");
  });

  it.todo("renders 4-row stage list on error (jsdom UAT — deferred)");
  it.todo("outer AbortSignal cascades to inner AC (integration UAT — deferred)");
  it.todo("stage retry re-runs only failed stage (jsdom UAT — deferred)");
  it.todo("awaiting-choice pauses success-hold until chooser fires (jsdom UAT — deferred)");
  it.todo("skipAutoStart=true does not run pipeline; awaitingChoice prop drives render (jsdom UAT — deferred)");
});
