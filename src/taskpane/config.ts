// Cube AI API configuration for Summit VI add-in
// Per D-04: hardcoded config for internal demo. Replace with proper auth for client-facing release.
// Webpack does not have dotenv-webpack or DefinePlugin configured, so values are hardcoded.

export const CUBEAI_CONFIG = {
  baseUrl:
    "https://ai.gcp-us-central1.cubecloud.dev/api/v1/public/summitinsights/agents/11/chat/stream-chat-state",
  apiKey: "sk-c3VtbWl0aW5zaWdodHM6ZjAxZWIzMGZkZWIyYjFmNWE4YmRjOWMwYWNlZjNiZTU1MWIxNDhlNmRiMGJiN2Y5Nzk1YzI2ODk3ZjBjZDE0YQ==", // Replace with actual key before testing
  internalId: "simon.scott@summitinsights.com",
  timeoutMs: 180000,
};
