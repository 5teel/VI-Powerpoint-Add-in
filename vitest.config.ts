import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "__CUBEAI_API_KEY__": JSON.stringify("test-key"),
    "__CUBEAI_BASE_URL__": JSON.stringify("https://test.example.com"),
    "__CUBEAI_EXTERNAL_ID__": JSON.stringify("test@test.com"),
    "__CUBEAI_TIMEOUT_MS__": JSON.stringify(180000),
  },
  test: {
    globals: true,
    environment: "node",
  },
});
