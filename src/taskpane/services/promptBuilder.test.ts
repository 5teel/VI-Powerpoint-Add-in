import { describe, it, expect } from "vitest";
import { buildSlidePrompt, buildGuidedPrompt } from "./promptBuilder";

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

describe("buildGuidedPrompt", () => {
  it("contains brand name", () => {
    const result = buildGuidedPrompt("Red Bull", "range review");
    expect(result).toContain("Red Bull");
  });

  it("contains purpose", () => {
    const result = buildGuidedPrompt("Red Bull", "range review");
    expect(result).toContain("range review");
  });

  it("contains all 4 layout type definitions", () => {
    const result = buildGuidedPrompt("Test", "test");
    expect(result).toContain("text-only");
    expect(result).toContain("chart-text");
    expect(result).toContain("table-text");
    expect(result).toContain("full-combination");
  });

  it("instructs Cube AI to return ONLY JSON", () => {
    const result = buildGuidedPrompt("Test", "test");
    expect(result).toContain("ONLY JSON");
  });

  it("instructs Cube AI NOT to include chartImageBase64", () => {
    const result = buildGuidedPrompt("Test", "test");
    expect(result).toContain("chartImageBase64");
  });

  it("is under 2000 characters", () => {
    const result = buildGuidedPrompt("Very Long Brand Name", "comprehensive performance analysis");
    expect(result.length).toBeLessThan(2000);
  });
});
