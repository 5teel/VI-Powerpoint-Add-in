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
  internalId: __CUBEAI_EXTERNAL_ID__,
  timeoutMs: __CUBEAI_TIMEOUT_MS__,
};
