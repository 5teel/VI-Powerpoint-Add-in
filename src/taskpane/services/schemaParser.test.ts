import { describe, it, expect } from "vitest";
import { extractSlideContent, fallbackToTextOnly } from "./schemaParser";

describe("extractSlideContent", () => {
  it("parses valid text-only JSON into TextOnlyContent", () => {
    const json = JSON.stringify({
      type: "text-only",
      title: "Q2 Revenue",
      bullets: ["Revenue grew 15%", "APAC led growth"],
      insight: "Strong quarter overall",
    });
    const result = extractSlideContent(json);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("text-only");
    if (result!.type === "text-only") {
      expect(result!.title).toBe("Q2 Revenue");
      expect(result!.bullets).toEqual(["Revenue grew 15%", "APAC led growth"]);
      expect(result!.insight).toBe("Strong quarter overall");
    }
  });

  it("parses valid table-text JSON into TableTextContent", () => {
    const json = JSON.stringify({
      type: "table-text",
      title: "Sales by Region",
      headers: ["Region", "Revenue"],
      rows: [["APAC", 500], ["EMEA", 300]],
      summary: "APAC leads",
    });
    const result = extractSlideContent(json);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("table-text");
    if (result!.type === "table-text") {
      expect(result!.headers).toEqual(["Region", "Revenue"]);
      expect(result!.rows).toEqual([["APAC", 500], ["EMEA", 300]]);
      expect(result!.summary).toBe("APAC leads");
    }
  });

  it("parses valid chart-text JSON and strips chartImageBase64", () => {
    const json = JSON.stringify({
      type: "chart-text",
      title: "Revenue Chart",
      chartImageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
      summaryBullets: ["Revenue up 10%"],
      insight: "Positive trend",
    });
    const result = extractSlideContent(json);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("chart-text");
    if (result!.type === "chart-text") {
      expect(result!.chartImageBase64).toBeUndefined();
      expect(result!.summaryBullets).toEqual(["Revenue up 10%"]);
    }
  });

  it("parses valid full-combination JSON and strips chartImageBase64", () => {
    const json = JSON.stringify({
      type: "full-combination",
      title: "Full Report",
      chartImageBase64: "base64data",
      headers: ["Metric", "Value"],
      rows: [["Sales", 100]],
      insight: "All good",
    });
    const result = extractSlideContent(json);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("full-combination");
    if (result!.type === "full-combination") {
      expect(result!.chartImageBase64).toBeUndefined();
      expect(result!.headers).toEqual(["Metric", "Value"]);
      expect(result!.rows).toEqual([["Sales", 100]]);
    }
  });

  it("extracts JSON from markdown code fences", () => {
    const raw = 'Here is the data:\n```json\n{"type":"text-only","title":"Fenced","bullets":["A"],"insight":"B"}\n```\nHope this helps!';
    const result = extractSlideContent(raw);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("text-only");
    expect(result!.title).toBe("Fenced");
  });

  it("extracts JSON embedded in commentary text", () => {
    const raw = 'Here is the data: {"type":"text-only","title":"Embedded","bullets":["X"],"insight":"Y"} Hope this helps';
    const result = extractSlideContent(raw);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("text-only");
    expect(result!.title).toBe("Embedded");
  });

  it("returns null for completely invalid input (no JSON)", () => {
    const result = extractSlideContent("This is just plain text with no JSON at all.");
    expect(result).toBeNull();
  });

  it("returns null for valid JSON but missing required fields (no title)", () => {
    const json = JSON.stringify({
      type: "text-only",
      bullets: ["A", "B"],
      insight: "C",
    });
    const result = extractSlideContent(json);
    expect(result).toBeNull();
  });

  it("returns null for unrecognized type field", () => {
    const json = JSON.stringify({
      type: "dashboard",
      title: "Custom",
      data: [],
    });
    const result = extractSlideContent(json);
    expect(result).toBeNull();
  });

  it("always deletes chartImageBase64 from parsed result", () => {
    const json = JSON.stringify({
      type: "text-only",
      title: "Test",
      bullets: ["A"],
      insight: "B",
      chartImageBase64: "shouldBeRemoved",
    });
    const result = extractSlideContent(json);
    expect(result).not.toBeNull();
    expect((result as any).chartImageBase64).toBeUndefined();
  });
});

describe("fallbackToTextOnly", () => {
  it("converts multi-line text into TextOnlyContent with lines as bullets", () => {
    const raw = "Line one\nLine two\nLine three";
    const result = fallbackToTextOnly(raw);
    expect(result.type).toBe("text-only");
    expect(result.title).toBe("AI Insights");
    expect(result.bullets).toEqual(["Line one", "Line two", "Line three"]);
    expect(result.insight).toBe("");
  });

  it("strips markdown bullet markers (- and *) from lines", () => {
    const raw = "- First item\n* Second item\n- Third item";
    const result = fallbackToTextOnly(raw);
    expect(result.bullets).toEqual(["First item", "Second item", "Third item"]);
  });

  it("caps bullets at 6 and puts overflow in insight", () => {
    const raw = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8";
    const result = fallbackToTextOnly(raw);
    expect(result.bullets).toHaveLength(6);
    expect(result.insight).toContain("Line 7");
    expect(result.insight).toContain("Line 8");
  });

  it("returns valid TextOnlyContent with default bullet for empty string", () => {
    const result = fallbackToTextOnly("");
    expect(result.type).toBe("text-only");
    expect(result.title).toBe("AI Insights");
    expect(result.bullets).toEqual(["No structured data available"]);
    expect(result.insight).toBe("");
  });
});
