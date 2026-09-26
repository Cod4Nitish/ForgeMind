import { SWYTCH_TOOLS, type ToolName } from "@/agent/swytchcode/tools";
import type { SwytchError, SwytchExecutionResult, SwytchExecutor, SwytchToolInput } from "@/agent/swytchcode/types";

type Scripted = { data: unknown } | { error: SwytchError } | ((input: SwytchToolInput) => { data: unknown } | { error: SwytchError });

/**
 * Deterministic Swytchcode executor for tests — no CLI, no network.
 * Responses are scripted per tool; an array is consumed one per call.
 */
export class MockSwytchExecutor implements SwytchExecutor {
  readonly calls: { tool: ToolName; input: SwytchToolInput }[] = [];
  private readonly queues = new Map<ToolName, Scripted[]>();

  constructor(script: Partial<Record<ToolName, Scripted | Scripted[]>> = {}) {
    for (const [tool, value] of Object.entries(script) as [ToolName, Scripted | Scripted[]][]) {
      this.set(tool, value);
    }
  }

  set(tool: ToolName, value: Scripted | Scripted[]): this {
    this.queues.set(tool, Array.isArray(value) ? [...value] : [value]);
    return this;
  }

  callsFor(tool: ToolName) {
    return this.calls.filter((call) => call.tool === tool);
  }

  async execute(tool: ToolName, input: SwytchToolInput): Promise<SwytchExecutionResult> {
    this.calls.push({ tool, input });
    const canonicalId = SWYTCH_TOOLS[tool].canonicalId;
    const queue = this.queues.get(tool);
    if (!queue || queue.length === 0) {
      throw new Error(`MockSwytchExecutor: no scripted response for ${tool}`);
    }
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    const outcome = typeof next === "function" ? next(input) : next;
    return "error" in outcome
      ? { ok: false, tool, canonicalId, error: outcome.error, attempts: 1 }
      : { ok: true, tool, canonicalId, data: outcome.data, attempts: 1 };
  }
}

export const toolError = (category: SwytchError["category"], retryable = false): { error: SwytchError } => ({
  error: { category, message: `Simulated ${category} failure.`, retryable },
});
