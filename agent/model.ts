import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { DEFAULT_ANTHROPIC_MODEL, type ModelConfig } from "./config";

export type ReasoningEffort = "low" | "medium" | "high";

export type StructuredRequest = {
  /** Short identifier for the output shape, e.g. "issue_assessments". */
  name: string;
  system: string;
  prompt: string;
  /** JSON Schema the model's output is constrained to. */
  jsonSchema: Record<string, unknown>;
  effort: ReasoningEffort;
};

/**
 * The only way agent nodes reach the reasoning model. Implementations return
 * the model's raw parsed JSON (`unknown`); callers must validate it — see
 * `agent/structured.ts`. Tests inject a deterministic fake.
 */
export interface StructuredModel {
  generate(request: StructuredRequest): Promise<unknown>;
}

/** The model declined the request (`stop_reason: "refusal"`). */
export class ModelRefusalError extends Error {
  constructor() {
    super("The reasoning model declined the request.");
    this.name = "ModelRefusalError";
  }
}

// Generous enough for adaptive thinking plus a structured answer on a
// non-streaming request.
const MAX_TOKENS = 16_000;
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_RETRIES = 2;

type StructuredResult = { raw?: { response_metadata?: { stop_reason?: string } }; parsed?: unknown };

export class AnthropicStructuredModel implements StructuredModel {
  private readonly clients = new Map<ReasoningEffort, ChatAnthropic>();

  constructor(private readonly config: ModelConfig) {}

  private client(effort: ReasoningEffort): ChatAnthropic {
    let client = this.clients.get(effort);
    if (!client) {
      // Server-side refusal fallback is documented for the default model; it
      // re-runs a declined request on Anthropic's recommended fallback model.
      const fallback =
        this.config.model === DEFAULT_ANTHROPIC_MODEL
          ? { betas: ["server-side-fallback-2026-07-01"], invocationKwargs: { fallbacks: "default" } }
          : {};
      client = new ChatAnthropic({
        apiKey: this.config.apiKey,
        model: this.config.model,
        maxTokens: MAX_TOKENS,
        maxRetries: MAX_RETRIES,
        clientOptions: { timeout: REQUEST_TIMEOUT_MS },
        outputConfig: { effort },
        ...fallback,
      });
      this.clients.set(effort, client);
    }
    return client;
  }

  async generate(request: StructuredRequest): Promise<unknown> {
    // Native JSON-schema structured output (output_config.format) — unlike
    // forced tool calling, it is compatible with adaptive thinking.
    const runnable = this.client(request.effort).withStructuredOutput(request.jsonSchema, {
      name: request.name,
      method: "jsonSchema",
      includeRaw: true,
    });
    const result = (await runnable.invoke([
      ["system", request.system],
      ["human", request.prompt],
    ])) as StructuredResult;

    if (result.raw?.response_metadata?.stop_reason === "refusal") {
      throw new ModelRefusalError();
    }
    return result.parsed ?? null;
  }
}
