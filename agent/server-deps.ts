import "server-only";
import { loadModelConfig } from "./config";
import type { AgentDeps } from "./deps";
import { AnthropicStructuredModel } from "./model";

let cached: AgentDeps | undefined;

/**
 * Production dependencies, created once per server instance. Throws
 * `ConfigError` when required configuration is missing.
 */
export function getServerDeps(): AgentDeps {
  if (!cached) {
    cached = {
      model: new AnthropicStructuredModel(loadModelConfig()),
      now: () => new Date(),
    };
  }
  return cached;
}
