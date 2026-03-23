// Cube AI API configuration for Summit VI add-in
// Per D-04: hardcoded config for internal demo. Replace with proper auth for client-facing release.
// Webpack does not have dotenv-webpack or DefinePlugin configured, so values are hardcoded.

export const CUBEAI_CONFIG = {
  baseUrl:
    "https://ai.gcp-us-central1.cubecloud.dev/api/v1/public/summitinsights/agents/11/chat/stream-chat-state",
  apiKey: "YOUR_API_KEY_HERE", // Replace with actual key before testing
  externalId: "user@summit.com",
  timeoutMs: 180000,
};
