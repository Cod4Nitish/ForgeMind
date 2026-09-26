import "server-only";
import { loadIntegrationConfig, loadModelConfig } from "./config";
import type { AgentDeps } from "./deps";
import { AnthropicStructuredModel } from "./model";
import { SwytchcodeCliExecutor } from "./swytchcode/executor";
import { RetryPolicyExecutor } from "./swytchcode/policy";

// Above the Swytchcode kernel's 90s total timeout (see executor.ts).
const SWYTCHCODE_TIMEOUT_MS = 100_000;

let cached: AgentDeps | undefined;

/**
 * Production dependencies, created once per server instance (one model
 * client, one Swytchcode executor). Throws `ConfigError` when required
 * configuration is missing.
 */
export function getServerDeps(): AgentDeps {
  if (!cached) {
    cached = {
      model: new AnthropicStructuredModel(loadModelConfig()),
      executor: new RetryPolicyExecutor(
        new SwytchcodeCliExecutor({ cwd: process.cwd(), timeoutMs: SWYTCHCODE_TIMEOUT_MS }),
      ),
      config: loadIntegrationConfig(),
      now: () => new Date(),
    };
  }
  return cached;
}
