import { z } from "zod";

/**
 * Structured outputs the reasoning model must return. Every schema here is
 * validated with `safeParse` before its data can influence routing or state —
 * raw model output is never trusted.
 */

export const REQUESTED_ACTIONS = [
  "inspect_github_issues",
  "triage_issues",
  "create_jira_tasks",
  "notify_slack",
  "explain",
  "other",
] as const;

export const RequestUnderstandingSchema = z
  .object({
    intent: z
      .string()
      .min(1)
      .max(300)
      .describe("One concise sentence describing the engineering intent of the request."),
    requestedActions: z
      .array(z.enum(REQUESTED_ACTIONS))
      .max(6)
      .describe("The kinds of work the request explicitly asks for."),
  })
  .strict();
export type RequestUnderstanding = z.infer<typeof RequestUnderstandingSchema>;

export const RequestPlanSchema = z
  .object({
    steps: z
      .array(z.string().min(1).max(200))
      .min(1)
      .max(8)
      .describe("Short ordered plan steps. Describe the work; do not execute it."),
  })
  .strict();
export type RequestPlan = z.infer<typeof RequestPlanSchema>;

export const DecisionSchema = z
  .object({
    action: z
      .enum(["continue", "finish"])
      .describe(
        "continue = the request needs external engineering-system actions; finish = it can be answered without them.",
      ),
    reason: z.string().min(1).max(300).describe("One-sentence public-safe reason summary."),
  })
  .strict();
export type Decision = z.infer<typeof DecisionSchema>;
