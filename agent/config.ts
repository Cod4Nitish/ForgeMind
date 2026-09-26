import "server-only";
import { ConfigError } from "./errors";

/**
 * Default reasoning model. Override with ANTHROPIC_MODEL; the value is never
 * taken from user input or tool output.
 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

export type ModelConfig = {
  apiKey: string;
  model: string;
};

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/** Reads the model configuration. Error messages name variables, never values. */
export function loadModelConfig(env: Env = process.env): ModelConfig {
  const apiKey = read(env, "ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new ConfigError("ANTHROPIC_API_KEY is not configured on the server.");
  }
  return {
    apiKey,
    model: read(env, "ANTHROPIC_MODEL") ?? DEFAULT_ANTHROPIC_MODEL,
  };
}
