import "server-only";
import { exec } from "@swytchcode/runtime";
import { logger, redact } from "@/lib/logger";
import { errorDetailForLog, normalizeSwytchError } from "./errors";
import { SWYTCH_TOOLS, isToolName, type ToolName } from "./tools";
import type { SwytchExecutionResult, SwytchExecutor, SwytchToolInput } from "./types";

export type CliExecutorOptions = {
  /** Directory containing `.swytchcode/tooling.json`. */
  cwd: string;
  /**
   * Backstop for a hung CLI process. Must exceed the kernel's own total
   * timeout (90s in the provider execution policy) so an in-flight mutation is
   * never killed mid-retry, leaving its outcome unknown.
   */
  timeoutMs: number;
};

/**
 * Executes enabled Swytchcode tools through `@swytchcode/runtime`'s `exec`,
 * which runs the Swytchcode CLI kernel. Provider authentication lives in the
 * Swytchcode session (`swytchcode login` locally, `SWYTCHCODE_TOKEN` in
 * headless environments) — ForgeMind never handles provider credentials.
 */
export class SwytchcodeCliExecutor implements SwytchExecutor {
  constructor(private readonly options: CliExecutorOptions) {}

  async execute(tool: ToolName, input: SwytchToolInput): Promise<SwytchExecutionResult> {
    if (!isToolName(tool)) {
      throw new Error("Unknown ForgeMind tool.");
    }
    const { canonicalId, provider } = SWYTCH_TOOLS[tool];
    try {
      const data = await exec(canonicalId, input, {
        cwd: this.options.cwd,
        timeoutMs: this.options.timeoutMs,
      });
      return { ok: true, tool, canonicalId, data, attempts: 1 };
    } catch (error) {
      const normalized = normalizeSwytchError(error, provider);
      logger.warn("swytchcode.exec_failed", {
        tool,
        canonicalId,
        category: normalized.category,
        detail: redact(errorDetailForLog(error)).slice(0, 300),
      });
      return { ok: false, tool, canonicalId, error: normalized, attempts: 1 };
    }
  }
}
