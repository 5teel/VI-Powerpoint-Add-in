import { describe, it, expect } from "vitest";
import { validateConfigInternal, type MissingCredential } from "./config";

/**
 * Phase 6 D-14 load-time credential validation. Tests target the pure helper
 * validateConfigInternal, which accepts all credential values as arguments so
 * DefinePlugin-frozen module-scope consts (tested separately via validateConfig)
 * don't interfere with fixture variation.
 */
describe("validateConfigInternal (D-14)", () => {
  const ok = {
    cubeai: { apiKey: "real-cubeai-key-abc123" },
    cubeData: {
      baseUrl: "https://my-deployment.gcp-us-central1.cubecloud.dev",
      jwt: "eyJhbGci.eyJpZCI.abc123",
    },
    anthropicKey: "sk-ant-real-key-123",
  };

  it("D-14: all creds set (non-placeholder) → missing is empty []", () => {
    const missing = validateConfigInternal(ok.cubeai, ok.cubeData, ok.anthropicKey);
    expect(missing).toEqual([]);
  });

  it("D-14: CUBEAI_API_KEY empty string → missing[0].key === 'CUBEAI_API_KEY'", () => {
    const missing = validateConfigInternal({ apiKey: "" }, ok.cubeData, ok.anthropicKey);
    expect(missing).toHaveLength(1);
    expect(missing[0].key).toBe("CUBEAI_API_KEY");
  });

  it("D-14: CUBE_DATA_BASE_URL === 'REPLACE_ME' → missing contains CUBE_DATA_BASE_URL", () => {
    const missing = validateConfigInternal(
      ok.cubeai,
      { baseUrl: "REPLACE_ME", jwt: ok.cubeData.jwt },
      ok.anthropicKey
    );
    expect(missing.map((m) => m.key)).toContain("CUBE_DATA_BASE_URL");
  });

  it("D-14: CUBE_DATA_JWT === 'your-jwt-here' → missing contains CUBE_DATA_JWT (placeholder substring regex matches)", () => {
    const missing = validateConfigInternal(
      ok.cubeai,
      { baseUrl: ok.cubeData.baseUrl, jwt: "your-jwt-here" },
      ok.anthropicKey
    );
    expect(missing.map((m) => m.key)).toContain("CUBE_DATA_JWT");
  });

  it("D-14: ANTHROPIC_API_KEY === 'placeholder-key' → missing contains ANTHROPIC_API_KEY", () => {
    const missing = validateConfigInternal(ok.cubeai, ok.cubeData, "placeholder-key");
    expect(missing.map((m) => m.key)).toContain("ANTHROPIC_API_KEY");
  });

  it("D-14: multiple missing → array length equals number of missing creds", () => {
    const missing = validateConfigInternal(
      { apiKey: "" },
      { baseUrl: "REPLACE_ME", jwt: "" },
      "placeholder"
    );
    expect(missing).toHaveLength(4);
    expect(missing.map((m) => m.key).sort()).toEqual(
      ["ANTHROPIC_API_KEY", "CUBEAI_API_KEY", "CUBE_DATA_BASE_URL", "CUBE_DATA_JWT"].sort()
    );
  });

  it("D-14: missing[].purpose is a non-empty human-readable string for every entry", () => {
    const missing = validateConfigInternal(
      { apiKey: "" },
      { baseUrl: "REPLACE_ME", jwt: "" },
      "placeholder"
    );
    for (const m of missing) {
      expect(m.purpose).toBeTruthy();
      expect(typeof m.purpose).toBe("string");
      expect(m.purpose.length).toBeGreaterThan(10);
    }
  });

  it("D-14: missing[].railwayVarName equals the env-var name exactly", () => {
    const missing: MissingCredential[] = validateConfigInternal(
      { apiKey: "" },
      { baseUrl: "REPLACE_ME", jwt: "" },
      "placeholder"
    );
    for (const m of missing) {
      expect(m.railwayVarName).toBe(m.key);
    }
  });

  it("D-14: whitespace-only credential values are treated as missing", () => {
    const missing = validateConfigInternal(
      { apiKey: "   " },
      { baseUrl: "\t\n", jwt: "" },
      " "
    );
    // All four creds are whitespace/empty — all four should be flagged.
    expect(missing).toHaveLength(4);
  });
});
