import "server-only";
import { loadIntegrationConfig, loadModelConfig } from "./config";
import { DEMO_CONFIG, DemoExecutor, DemoModel } from "./demo";
import type { AgentDeps } from "./deps";
import { AnthropicStructuredModel } from "./model";
import { SwytchcodeCliExecutor } from "./swytchcode/executor";
import { RetryPolicyExecutor } from "./swytchcode/policy";

// Above the Swytchcode kernel's 90s total timeout (see executor.ts).
const SWYTCHCODE_TIMEOUT_MS = 100_000;

export type RunMode = "live" | "demo";

/**
 * FORGEMIND_MODE=live|demo forces a mode. Otherwise ForgeMind runs live only
 * when its credentials are present: an Anthropic key, plus a Swytchcode
 * service token on Vercel (locally, `swytchcode login` is used instead).
 * Anything else falls back to the self-contained demo sandbox.
 */
export function resolveRunMode(env: Record<string, string | undefined> = process.env): RunMode {
  const forced = env.FORGEMIND_MODE?.trim().toLowerCase();
  if (forced === "live" || forced === "demo") return forced;
  const hasModel = Boolean(env.ANTHROPIC_API_KEY?.trim());
  const hasSwytchcode = Boolean(env.SWYTCHCODE_TOKEN?.trim()) || !env.VERCEL;
  return hasModel && hasSwytchcode ? "live" : "demo";
}

let cached: AgentDeps | undefined;

/**
 * Production dependencies, created once per server instance (one model
 * client, one Swytchcode executor). Throws `ConfigError` when live mode is
 * selected but required configuration is missing.
 */
export function getServerDeps(): AgentDeps {
  if (!cached) {
    cached =
      resolveRunMode() === "demo"
        ? { model: new DemoModel(), executor: new DemoExecutor(), config: DEMO_CONFIG, now: () => new Date() }
        : {
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
