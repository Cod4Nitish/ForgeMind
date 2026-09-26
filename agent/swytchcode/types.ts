import type { ToolName } from "./tools";

/** Arguments for `swytchcode exec`: request body and path/query params. */
export type SwytchToolInput = {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
};

export const SWYTCH_ERROR_CATEGORIES = [
  "auth",
  "not_enabled",
  "validation",
  "policy",
  "provider",
  "timeout",
  "network",
  "not_installed",
  "invalid_response",
  "unknown",
] as const;
export type SwytchErrorCategory = (typeof SWYTCH_ERROR_CATEGORIES)[number];

export type SwytchError = {
  category: SwytchErrorCategory;
  /** Safe to show in the UI: no provider payloads, tokens or stack traces. */
  message: string;
  retryable: boolean;
};

/** Normalized outcome of one tool execution — never a raw provider response. */
export type SwytchExecutionResult =
  | { ok: true; tool: ToolName; canonicalId: string; data: unknown; attempts: number }
  | { ok: false; tool: ToolName; canonicalId: string; error: SwytchError; attempts: number };

/**
 * The only path from the agent to GitHub/Jira/Slack. Production uses
 * `SwytchcodeCliExecutor`; deterministic tests use a mock.
 */
export interface SwytchExecutor {
  execute(tool: ToolName, input: SwytchToolInput): Promise<SwytchExecutionResult>;
}
