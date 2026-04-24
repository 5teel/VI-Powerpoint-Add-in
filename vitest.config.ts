import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "__CUBEAI_API_KEY__": JSON.stringify("test-key"),
    "__CUBEAI_BASE_URL__": JSON.stringify("https://test.example.com"),
    "__CUBEAI_EXTERNAL_ID__": JSON.stringify("test@test.com"),
    "__CUBEAI_TIMEOUT_MS__": JSON.stringify(180000),
    "__ANTHROPIC_API_KEY__": JSON.stringify("test-anthropic-key"),
    "__ANTHROPIC_MODEL__": JSON.stringify("claude-sonnet-4-6"),
    "__CUBE_DATA_BASE_URL__": JSON.stringify("https://test-cube.example.com"),
    "__CUBE_DATA_JWT__": JSON.stringify("test-jwt"),
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
});
