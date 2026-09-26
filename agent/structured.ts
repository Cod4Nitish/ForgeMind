import { z } from "zod";
import type { AgentErrorCode } from "./errors";
import { ModelRefusalError, type ReasoningEffort, type StructuredModel } from "./model";

export type StructuredCall<T> = {
  model: StructuredModel;
  name: string;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  effort: ReasoningEffort;
  /**
   * Extra semantic checks after schema validation (e.g. "every issue number
   * must come from the fetched set"). Return an error string to reject.
   */
  check?: (value: T) => string | null;
};

export type StructuredOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; code: AgentErrorCode; message: string };

/**
 * One invalid answer is re-requested once — model calls have no external side
 * effects, so this retry is always safe. A second invalid answer is a safe
 * failure; unvalidated output never reaches routing or tools.
 */
const MAX_ATTEMPTS = 2;

export async function callStructured<T>(call: StructuredCall<T>): Promise<StructuredOutcome<T>> {
  const jsonSchema = z.toJSONSchema(call.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw: unknown;
    try {
      raw = await call.model.generate({
        name: call.name,
        system: call.system,
        prompt: call.prompt,
        jsonSchema,
        effort: call.effort,
      });
    } catch (error) {
      if (error instanceof ModelRefusalError) {
        return { ok: false, code: "model_refusal", message: "The reasoning model declined this request." };
      }
      return { ok: false, code: "model_error", message: "The reasoning model request failed." };
    }

    const parsed = call.schema.safeParse(raw);
    if (parsed.success && !call.check?.(parsed.data)) {
      return { ok: true, data: parsed.data };
    }
  }

  return {
    ok: false,
    code: "invalid_model_output",
    message: "The reasoning model returned output that failed validation.",
  };
}
