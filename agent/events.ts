import { z } from "zod";

export const EVENT_STAGES = [
  "request",
  "reasoning",
  "github",
  "analysis",
  "jira",
  "verification",
  "slack",
  "final",
] as const;

export const EVENT_STATUSES = ["running", "success", "skipped", "warning", "error"] as const;

export const EVENT_TYPES = [
  "request_received",
  "decision_made",
  "tool_selected",
  "tool_started",
  "tool_completed",
  "tool_failed",
  "analysis_completed",
  "step_skipped",
  "finalized",
] as const;

/**
 * A browser-safe execution event. `summary` is a short public description —
 * never raw provider payloads, credentials, or model reasoning.
 */
export const AgentEventSchema = z
  .object({
    type: z.enum(EVENT_TYPES),
    stage: z.enum(EVENT_STAGES),
    status: z.enum(EVENT_STATUSES),
    summary: z.string().max(500),
    timestamp: z.string(),
    tool: z.string().optional(),
  })
  .strict();
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type EventStage = AgentEvent["stage"];
export type EventStatus = AgentEvent["status"];

export function createEvent(
  now: () => Date,
  event: Omit<AgentEvent, "timestamp">,
): AgentEvent {
  return { ...event, timestamp: now().toISOString() };
}
