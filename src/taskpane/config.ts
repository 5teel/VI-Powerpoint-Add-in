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
