import { describe, it, expect } from "vitest";
import { buildSlidePrompt } from "./promptBuilder";

describe("buildSlidePrompt", () => {
  const userQuestion = "What are Q2 revenues?";
  const prompt = buildSlidePrompt(userQuestion);

  it("contains all 4 layout type definitions", () => {
    expect(prompt).toContain("text-only");
    expect(prompt).toContain("chart-text");
    expect(prompt).toContain("table-text");
    expect(prompt).toContain("full-combination");
  });

  it("contains the user's original question", () => {
    expect(prompt).toContain("What are Q2 revenues?");
  });

  it("instructs Cube AI to return ONLY JSON", () => {
    expect(prompt.toLowerCase()).toMatch(/return\s+only\s+json|only\s+json/);
  });

  it("instructs Cube AI NOT to include chartImageBase64", () => {
    expect(prompt).toContain("chartImageBase64");
  });

  it("is under 2000 characters total", () => {
    expect(prompt.length).toBeLessThan(2000);
  });

  it("returns different prompts for different questions", () => {
    const prompt2 = buildSlidePrompt("Show me APAC sales");
    expect(prompt2).toContain("Show me APAC sales");
    expect(prompt2).not.toContain("What are Q2 revenues?");
  });
});
