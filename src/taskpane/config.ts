// Cube AI API configuration for Summit VI add-in
// Values injected at build time via webpack DefinePlugin
// In development: falls back to defaults for local dev
// In production: Railway env vars are injected during Docker build

declare const __CUBEAI_API_KEY__: string;
declare const __CUBEAI_BASE_URL__: string;
declare const __CUBEAI_EXTERNAL_ID__: string;
declare const __CUBEAI_TIMEOUT_MS__: number;

export const CUBEAI_CONFIG = {
  baseUrl: __CUBEAI_BASE_URL__,
  apiKey: __CUBEAI_API_KEY__,
  externalId: __CUBEAI_EXTERNAL_ID__,
  timeoutMs: __CUBEAI_TIMEOUT_MS__,
};

// Phase 5: Anthropic composer configuration
// SECURITY: The Anthropic API key is surfaced in the client bundle (Phase 5 D-04
// accepted trade-off for internal sideload). Never ship this build to AppSource
// without first moving the composer call behind a server-side proxy.
declare const __ANTHROPIC_API_KEY__: string;
declare const __ANTHROPIC_MODEL__: string;

export const ANTHROPIC_API_KEY = __ANTHROPIC_API_KEY__;
export const ANTHROPIC_MODEL = __ANTHROPIC_MODEL__;

// Phase 5: Cube REST data API configuration (deployment-specific)
// SECURITY: The Cube JWT is surfaced in the client bundle — same caveat as above.
declare const __CUBE_DATA_BASE_URL__: string;
declare const __CUBE_DATA_JWT__: string;

export const CUBE_DATA_CONFIG = {
  baseUrl: __CUBE_DATA_BASE_URL__,
  jwt: __CUBE_DATA_JWT__,
};

// Phase 6 D-14: Load-time credential validation.
// Setup-required screen (App.tsx, wired in a later wave) renders when any
// required credential is missing or contains a placeholder string. The helper
// deliberately returns only credential KEYS + non-secret purpose strings —
// NEVER the actual values — so the UI can safely render them verbatim.

export interface MissingCredential {
  key: "CUBEAI_API_KEY" | "CUBE_DATA_BASE_URL" | "CUBE_DATA_JWT" | "ANTHROPIC_API_KEY";
  purpose: string;
  railwayVarName: string;
}

// Placeholder patterns that should count as "missing" even when the string is
// non-empty. Each pattern is a compile-time literal regex — users cannot inject
// a new pattern (T-06-03 accepted risk).
const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /^REPLACE_ME$/i,
  /^YOUR_KEY_HERE$/i,
  /placeholder/i,
  /your-\w+-here/i,
];

function isPlaceholder(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return true;
  if (value.trim() === "") return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}

const CREDENTIAL_META: Record<
  MissingCredential["key"],
  { purpose: string; railwayVarName: string }
> = {
  CUBEAI_API_KEY: {
    purpose:
      "Cube AI Chat API key — used to generate slide insights from your data questions.",
    railwayVarName: "CUBEAI_API_KEY",
  },
  CUBE_DATA_BASE_URL: {
    purpose:
      "Cube REST data API base URL — points to your deployment-specific data endpoint (e.g., https://{deployment}.gcp-us-central1.cubecloud.dev).",
    railwayVarName: "CUBE_DATA_BASE_URL",
  },
  CUBE_DATA_JWT: {
    purpose:
      "Cube REST data API JWT — authenticates the data fetch for charts and tables.",
    railwayVarName: "CUBE_DATA_JWT",
  },
  ANTHROPIC_API_KEY: {
    purpose:
      "Anthropic Claude API key — composes the final slide layout from Cube's response.",
    railwayVarName: "ANTHROPIC_API_KEY",
  },
};

/**
 * Pure helper — accepts all credential values as parameters for testability.
 * ANTHROPIC_MODEL is intentionally NOT validated here: it has a working default
 * (claude-sonnet-4-6) baked in at build time and is never missing in practice.
 */
export function validateConfigInternal(
  cubeai: { apiKey: string },
  cubeData: { baseUrl: string; jwt: string },
  anthropicKey: string
): MissingCredential[] {
  const missing: MissingCredential[] = [];
  if (isPlaceholder(cubeai.apiKey)) {
    missing.push({ key: "CUBEAI_API_KEY", ...CREDENTIAL_META.CUBEAI_API_KEY });
  }
  if (isPlaceholder(cubeData.baseUrl)) {
    missing.push({ key: "CUBE_DATA_BASE_URL", ...CREDENTIAL_META.CUBE_DATA_BASE_URL });
  }
  if (isPlaceholder(cubeData.jwt)) {
    missing.push({ key: "CUBE_DATA_JWT", ...CREDENTIAL_META.CUBE_DATA_JWT });
  }
  if (isPlaceholder(anthropicKey)) {
    missing.push({ key: "ANTHROPIC_API_KEY", ...CREDENTIAL_META.ANTHROPIC_API_KEY });
  }
  return missing;
}

/**
 * Module-scope wrapper — reads the DefinePlugin-injected const exports above
 * and forwards to validateConfigInternal. Call this from App.tsx on mount
 * (once per session; values are frozen at bundle time).
 */
export function validateConfig(): MissingCredential[] {
  return validateConfigInternal(CUBEAI_CONFIG, CUBE_DATA_CONFIG, ANTHROPIC_API_KEY);
}
