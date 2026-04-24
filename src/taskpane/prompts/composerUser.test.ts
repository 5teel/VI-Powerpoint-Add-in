import { describe, it, expect } from "vitest";
import { buildUserContent, MAX_ROWS_CHARS, MAX_COMMENTARY_CHARS } from "./composerUser";
import { COMPOSER_SYSTEM_PROMPT_V1 } from "./composerSystem";
import type { ComposerInput } from "../services/composer";

function makeInput(overrides: Partial<ComposerInput> = {}): ComposerInput {
  return {
    userQuestion: "Which states lead on sales?",
    cubeMeta: {
      queryTitle: "State sales",
      description: "FY26 YTD",
      vegaSpec: { mark: "bar" },
      commentary: "Short commentary.",
    },
    rows: [{ state: "NSW", sales: 1 }],
    canvas: { widthPx: 960, heightPx: 540 },
    ...overrides,
  };
}

describe("buildUserContent", () => {
  it("contains all required section labels", () => {
    const out = buildUserContent(makeInput());
    expect(out).toMatch(/User question: Which states lead on sales\?/);
    expect(out).toMatch(/Cube query title: State sales/);
    expect(out).toMatch(/Cube description: FY26 YTD/);
    expect(out).toMatch(/Cube commentary \(source-of-truth narrative\):/);
    expect(out).toMatch(/Rows \(1\):/);
    expect(out).toMatch(/Original chart spec:/);
  });

  it("caps rows JSON at MAX_ROWS_CHARS and marks as truncated", () => {
    const bigRows = Array.from({ length: 5000 }, (_, i) => ({ i, name: "x".repeat(20) }));
    const out = buildUserContent(makeInput({ rows: bigRows }));
    // Rows section should be capped + marked truncated
    const m = out.match(/Rows \(\d+,\s*truncated\): (.+?)(\n\n|$)/s);
    expect(m).not.toBeNull();
    expect(m![1].length).toBeLessThanOrEqual(MAX_ROWS_CHARS);
  });

  it("tail-truncates commentary at MAX_COMMENTARY_CHARS (keeps the end)", () => {
    const prefix = "IGNORE_ME".repeat(300); // ~2700 chars
    const tail = "KEEP_ME tail-facts here.";
    const commentary = prefix + tail;
    const out = buildUserContent(
      makeInput({
        cubeMeta: {
          queryTitle: "t",
          description: "d",
          commentary,
        },
      })
    );
    expect(out).toContain(tail);
    // The commentary section slice only contains the tail portion
    const commentarySection = out.match(/Cube commentary \(source-of-truth narrative\): (.+?)\n\n/s)![1];
    expect(commentarySection.length).toBeLessThanOrEqual(MAX_COMMENTARY_CHARS);
    expect(commentarySection.endsWith("tail-facts here.")).toBe(true);
    // The full prefix should not fit in the capped commentary section
    expect(commentarySection.startsWith(prefix.slice(0, 100))).toBe(false);
  });

  it("handles missing commentary as empty string without throwing", () => {
    const out = buildUserContent(
      makeInput({ cubeMeta: { queryTitle: "t", description: "d", commentary: "" } })
    );
    expect(out).toContain("Cube commentary (source-of-truth narrative): \n\n");
  });

  it("uses tableChartSpec when vegaSpec is absent", () => {
    const out = buildUserContent(
      makeInput({
        cubeMeta: {
          queryTitle: "t",
          description: "d",
          commentary: "c",
          tableChartSpec: { columns: ["a", "b"] },
        },
      })
    );
    expect(out).toContain(`Original chart spec: ${JSON.stringify({ columns: ["a", "b"] })}`);
  });
});

describe("COMPOSER_SYSTEM_PROMPT_V1", () => {
  it("exceeds Sonnet 4.6 2048-token cache minimum (approx >6200 chars)", () => {
    expect(COMPOSER_SYSTEM_PROMPT_V1.length).toBeGreaterThan(6200);
  });

  it("contains all six canonical sections in order (including TABLE_RENDER_RULES for D-13)", () => {
    const p = COMPOSER_SYSTEM_PROMPT_V1;
    const idxR = p.indexOf("<RESPONSIBILITIES>");
    const idxL = p.indexOf("<LAYOUT_RULES>");
    const idxC = p.indexOf("<COMMENTARY_RULES>");
    const idxM = p.indexOf("<CHART_MUTATION_RULES>");
    const idxT = p.indexOf("<TABLE_RENDER_RULES>");
    const idxF = p.indexOf("<FEW_SHOT_EXAMPLES>");
    expect(idxR).toBeGreaterThan(-1);
    expect(idxL).toBeGreaterThan(idxR);
    expect(idxC).toBeGreaterThan(idxL);
    expect(idxM).toBeGreaterThan(idxC);
    expect(idxT).toBeGreaterThan(idxM);
    expect(idxF).toBeGreaterThan(idxT);
  });

  it("D-13: TABLE_RENDER_RULES contains the native-vs-image heuristic thresholds (rows <=10, columns <=5)", () => {
    const p = COMPOSER_SYSTEM_PROMPT_V1;
    const idxT = p.indexOf("<TABLE_RENDER_RULES>");
    const idxTEnd = p.indexOf("</TABLE_RENDER_RULES>");
    expect(idxT).toBeGreaterThan(-1);
    expect(idxTEnd).toBeGreaterThan(idxT);
    const section = p.slice(idxT, idxTEnd);
    expect(section).toMatch(/rows .{0,4}.{0,2} 10/i);
    expect(section).toMatch(/columns .{0,4}.{0,2} 5/i);
    expect(section).toMatch(/native-tablev2/);
    expect(section).toMatch(/image/);
  });

  it("does not contain template-literal interpolation markers (cache hygiene)", () => {
    expect(COMPOSER_SYSTEM_PROMPT_V1).not.toMatch(/\$\{/);
  });
});
