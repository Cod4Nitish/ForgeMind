import { SWYTCH_TOOLS, type ToolName } from "./tools";
import type { SwytchExecutionResult, SwytchExecutor, SwytchToolInput } from "./types";

/** Total attempts for read-only tools on transient failures. */
export const READ_MAX_ATTEMPTS = 2;

/**
 * Conservative retry policy around any executor.
 *
 * - Read-only tools are retried once on a transient failure (timeout/network
 *   or an error Swytchcode marks retryable).
 * - Mutations (Jira create, Slack post) are NEVER retried automatically: a
 *   timed-out mutation may already have succeeded, and repeating it could
 *   create a duplicate task or message. Swytchcode's exec interface exposes no
 *   idempotency key, so the safe behaviour is to report the failure as-is.
 */
export class RetryPolicyExecutor implements SwytchExecutor {
  constructor(private readonly inner: SwytchExecutor) {}

  async execute(tool: ToolName, input: SwytchToolInput): Promise<SwytchExecutionResult> {
    const maxAttempts = SWYTCH_TOOLS[tool].access === "read" ? READ_MAX_ATTEMPTS : 1;
    let result = await this.inner.execute(tool, input);
    let attempts = 1;
    while (!result.ok && result.error.retryable && attempts < maxAttempts) {
      attempts++;
      result = await this.inner.execute(tool, input);
    }
    return { ...result, attempts };
  }
}
