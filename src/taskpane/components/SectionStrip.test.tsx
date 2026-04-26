/**
 * SectionStrip surface coverage.
 *
 * Vitest env=node — full DOM rendering is deferred to manual UAT per 05-UI-SPEC.md
 * (same posture as SlidePreview.test.tsx). These tests assert the module-level
 * surface (exports, props shape) and document the jsdom-UAT surfaces that will
 * land in a future pass (header copy across the 5 strip-status states, Stop
 * button abort, responsive layout, state-badge palette).
 */
import { describe, it, expect } from "vitest";
import { SectionStrip, type SectionStripProps } from "./SectionStrip";
import type { CubeSqlApiToolCall } from "../services/cubeai";

describe("SectionStrip surface", () => {
  it("exports SectionStrip component + SectionStripProps", () => {
    expect(typeof SectionStrip).toBe("function");
    const props: SectionStripProps = {
      input: {
        userQuestion: "q",
        toolCall: {
          name: "cubeSqlApi",
          isInProcess: false,
          input: { sqlQuery: "", queryTitle: "", description: "" },
        } as unknown as CubeSqlApiToolCall,
        cubeRows: [],
        commentary: "",
      },
      onAllDone: () => undefined,
      onPlanError: () => undefined,
    };
    expect(props.onAllDone).toBeTypeOf("function");
    expect(props.onPlanError).toBeTypeOf("function");
    expect(props.input.userQuestion).toBe("q");
  });

  it.todo("header copy is 'Building N slides — M done' during build (jsdom UAT)");
  it.todo("Stop button calls outer abort + flips status to stopped (jsdom UAT)");
  it.todo("responsive layout at <360px uses horizontal scroll (jsdom UAT)");
  it.todo("state badges render per 06-UI-SPEC palette (jsdom UAT)");
});
