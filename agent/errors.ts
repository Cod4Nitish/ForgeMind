import { z } from "zod";
import { EVENT_STAGES } from "./events";

export const AGENT_ERROR_CODES = [
  "config_error",
  "model_error",
  "model_refusal",
  "invalid_model_output",
  "graph_error",
] as const;

/** A safe, user-displayable error record kept in agent state. */
export const AgentErrorSchema = z
  .object({
    stage: z.enum(EVENT_STAGES),
    code: z.enum(AGENT_ERROR_CODES),
    message: z.string().max(300),
  })
  .strict();
export type AgentError = z.infer<typeof AgentErrorSchema>;
export type AgentErrorCode = AgentError["code"];

/** Thrown when required server configuration is missing or invalid. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
