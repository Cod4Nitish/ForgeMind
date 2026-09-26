import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "./contract";

export { MAX_MESSAGE_LENGTH };
export const MAX_REQUEST_BYTES = 16 * 1024;

const MessageText = z
  .string({ error: "message must be a string." })
  .trim()
  .min(1, { error: "message must be a non-empty string." })
  .max(MAX_MESSAGE_LENGTH, { error: `message must be at most ${MAX_MESSAGE_LENGTH} characters.` });

/**
 * POST /api/agent body. `message` is canonical; `prompt` is accepted as an
 * alias. Unknown fields are rejected so the browser cannot smuggle
 * configuration (repository, channel, model, tools) into a run.
 */
export const AgentRequestSchema = z
  .object({
    message: MessageText.optional(),
    prompt: MessageText.optional(),
  })
  .strict()
  .refine((body) => (body.message === undefined) !== (body.prompt === undefined), {
    error: "Provide exactly one of message or prompt.",
  })
  .transform((body) => ({ message: (body.message ?? body.prompt) as string }));

export type AgentRequest = z.output<typeof AgentRequestSchema>;
