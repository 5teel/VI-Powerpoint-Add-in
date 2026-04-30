/// <reference types="@testing-library/jest-dom" />
// @vitest-environment jsdom
/**
 * Phase 7 Wave 0 RED scaffold for R4 (clarify/refuse render suppression).
 *
 * INTENTIONAL RED STATE — this test currently fails because:
 *   (a) ChatPanel does not yet accept an `initialMessages` prop, AND
 *   (b) ChatMessage interface does not yet have a `responseClass` field.
 *
 * Wave 2 (07-03-PLAN.md) adds both, turning this test GREEN.
 *
 * Test rationale (per Pattern 4 / R4 / Pitfall 2):
 *   When responseClass ∈ {clarify, refuse}, the assistant message must render
 *   as a plain text bubble — NO Create Slide button, NO SlidePreview,
 *   NO SectionStrip. While responseClass is undefined (mid-classification),
 *   the button is also suppressed (Pitfall 2 fix).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ChatPanel from "../ChatPanel";

// Mock streamCubeAI so render does not attempt network calls.
vi.mock("../../services/cubeai", async () => {
  const actual =
    await vi.importActual<typeof import("../../services/cubeai")>(
      "../../services/cubeai"
    );
  return {
    ...actual,
    streamCubeAI: vi.fn(() => new AbortController()),
  };
});

describe("R4: clarify/refuse render suppression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responseClass='clarify' renders NO Create Slide button", () => {
    const messages = [
      { role: "user" as const, content: "show sales" },
      {
        role: "assistant" as const,
        content: "Did you mean NSW or all states?",
        slideState: "idle" as const,
        responseClass: "clarify" as const,
      },
    ];
    // Wave 2 adds initialMessages prop. Cast keeps TS happy until then.
    render(
      <ChatPanel
        {...({ initialMessages: messages } as unknown as Record<string, unknown>)}
      />
    );
    expect(screen.queryByRole("button", { name: /Create Slide/i })).toBeNull();
  });

  it("responseClass='refuse' renders NO Create Slide button", () => {
    const messages = [
      {
        role: "assistant" as const,
        content: "I don't have data on competitor pricing.",
        slideState: "idle" as const,
        responseClass: "refuse" as const,
      },
    ];
    render(
      <ChatPanel
        {...({ initialMessages: messages } as unknown as Record<string, unknown>)}
      />
    );
    expect(screen.queryByRole("button", { name: /Create Slide/i })).toBeNull();
  });

  it("responseClass='data' with toolCall DOES render Create Slide button (control)", () => {
    const messages = [
      {
        role: "assistant" as const,
        content: "Sales were $5.3B in NSW.",
        slideState: "idle" as const,
        responseClass: "data" as const,
        toolCall: {
          name: "cubeSqlApi" as const,
          isInProcess: false as const,
          input: {
            sqlQuery: "SELECT 1",
            queryTitle: "Sales",
            description: "x",
            chartCategory: "vega" as const,
          },
        },
      },
    ];
    render(
      <ChatPanel
        {...({ initialMessages: messages } as unknown as Record<string, unknown>)}
      />
    );
    expect(
      screen.queryByRole("button", { name: /Create Slide/i })
    ).not.toBeNull();
  });

  it("responseClass=undefined (mid-classification) renders NO Create Slide button (Pitfall 2)", () => {
    const messages = [
      {
        role: "assistant" as const,
        content: "Streaming complete...",
        slideState: "idle" as const,
        // responseClass intentionally absent
      },
    ];
    render(
      <ChatPanel
        {...({ initialMessages: messages } as unknown as Record<string, unknown>)}
      />
    );
    expect(screen.queryByRole("button", { name: /Create Slide/i })).toBeNull();
  });

  it("responseClass='clarify' suppresses SlidePreview region", () => {
    const messages = [
      {
        role: "assistant" as const,
        content: "Did you mean NSW or all states?",
        slideState: "idle" as const,
        responseClass: "clarify" as const,
      },
    ];
    render(
      <ChatPanel
        {...({ initialMessages: messages } as unknown as Record<string, unknown>)}
      />
    );
    // SlidePreview never mounts on a clarify branch — naturally suppressed
    // because slideState stays "idle" and isRefinement is false. Assert by
    // looking for the SlidePreview test marker (the production component
    // renders a 280×158 skeleton with the queryTitle as heading on success).
    expect(screen.queryByTestId("slide-preview")).toBeNull();
  });

  it("responseClass='refuse' suppresses SectionStrip region", () => {
    const messages = [
      {
        role: "assistant" as const,
        content: "I don't have forecasting data.",
        slideState: "idle" as const,
        responseClass: "refuse" as const,
      },
    ];
    render(
      <ChatPanel
        {...({ initialMessages: messages } as unknown as Record<string, unknown>)}
      />
    );
    expect(screen.queryByTestId("section-strip")).toBeNull();
  });
});
