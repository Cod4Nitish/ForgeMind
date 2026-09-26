import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // The real marker throws outside the react-server condition; tests run
      // server modules directly, so use its no-op export.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Live tests hit real Anthropic/Swytchcode and run only via `npm run test:live`.
    exclude: ["tests/live/**", "node_modules/**"],
  },
});
