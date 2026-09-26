import { ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { AgentErrorSchema } from "./errors";
import { AgentEventSchema } from "./events";
import {
  ForgeMindResultSchema,
  JiraTaskResultSchema,
  JiraVerificationResultSchema,
  SlackResultSchema,
  StageRunSchema,
} from "./results";
import {
  ActionabilityDecisionSchema,
  DecisionSchema,
  IssueAssessmentSchema,
  NotificationDecisionSchema,
  RequestPlanSchema,
  RequestUnderstandingSchema,
} from "./schemas";
import { GitHubIssueSchema } from "./swytchcode/github";
import { SWYTCH_ERROR_CATEGORIES } from "./swytchcode/types";

export const ToolRunSchema = z
  .object({
    status: z.enum(["success", "failed"]),
    issueCount: z.number().int().nonnegative(),
    skippedCount: z.number().int().nonnegative(),
    errorCategory: z.enum(SWYTCH_ERROR_CATEGORIES).optional(),
  })
  .strict();

const appendOnly = <T extends z.ZodType>(item: T) =>
  new ReducedValue(z.array(item).default(() => []), {
    inputSchema: z.array(item),
    reducer: (current: z.infer<T>[], next: z.infer<T>[]) => [...current, ...next],
  });

/**
 * ForgeMind's explicit graph state. Every field is typed, serializable and
 * validated by LangGraph on update. It carries each stage's validated output
 * and the recorded result of every external action — never credentials or
 * private model reasoning.
 */
export const ForgeMindState = new StateSchema({
  runId: z.string(),
  userRequest: z.string(),

  understanding: RequestUnderstandingSchema.optional(),
  requestPlan: RequestPlanSchema.optional(),
  workflowDecision: DecisionSchema.optional(),

  githubRun: ToolRunSchema.optional(),
  githubIssues: z.array(GitHubIssueSchema).optional(),

  analysisRun: StageRunSchema.optional(),
  assessments: z.array(IssueAssessmentSchema).optional(),

  actionability: ActionabilityDecisionSchema.optional(),
  /** Effective gate: the model chose Jira AND the user asked for it. */
  proceedToJira: z.boolean().optional(),

  jiraRun: StageRunSchema.optional(),
  jiraTasks: z.array(JiraTaskResultSchema).optional(),
  jiraVerification: JiraVerificationResultSchema.optional(),

  notification: NotificationDecisionSchema.optional(),
  slackResult: SlackResultSchema.optional(),

  result: ForgeMindResultSchema.optional(),

  events: appendOnly(AgentEventSchema),
  errors: appendOnly(AgentErrorSchema),
});

export type ForgeMindStateValue = typeof ForgeMindState.State;
export type ForgeMindStateUpdate = typeof ForgeMindState.Update;
