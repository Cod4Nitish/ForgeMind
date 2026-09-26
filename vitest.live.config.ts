import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Live verification against real services (Anthropic, Swytchcode → GitHub/
 * Jira/Slack). Kept separate from the deterministic suite; reads .env.local.
 * Standalone (not merged with vitest.config.ts) because array options such as
 * `exclude` concatenate on merge and would exclude these tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/live/**/*.live.test.ts"],
    setupFiles: ["./tests/live/load-env.ts"],
    testTimeout: 180_000,
    fileParallelism: false,
  },
});
