import { z } from "zod";
import { JIRA_PRIORITIES } from "./schemas";

/** Records of what external actions actually did — built from tool results, never from the model. */

export const StageRunSchema = z.enum(["success", "partial", "failed", "skipped"]);
export type StageRun = z.infer<typeof StageRunSchema>;

export const JiraTaskResultSchema = z
  .object({
    sourceIssue: z.number().int().positive(),
    summary: z.string().max(255),
    priority: z.enum(JIRA_PRIORITIES),
    /** `unconfirmed`: the create call returned no usable key; it may exist and is never retried. */
    status: z.enum(["created", "failed", "unconfirmed"]),
    key: z.string().max(50).optional(),
    message: z.string().max(300).optional(),
  })
  .strict();
export type JiraTaskResult = z.infer<typeof JiraTaskResultSchema>;

export const JiraVerificationResultSchema = z
  .object({
    verified: z.boolean(),
    createdTasks: z.array(
      z
        .object({
          sourceIssue: z.number().int().positive(),
          jiraKey: z.string().max(50).optional(),
          status: z.enum(["verified", "unverified", "failed"]),
        })
        .strict(),
    ),
    summary: z.string().max(300),
  })
  .strict();
export type JiraVerificationResult = z.infer<typeof JiraVerificationResultSchema>;

export const SlackResultSchema = z
  .object({
    status: z.enum(["sent", "failed", "skipped"]),
    channel: z.string().max(100).optional(),
    message: z.string().max(300).optional(),
  })
  .strict();
export type SlackResult = z.infer<typeof SlackResultSchema>;

export const ForgeMindResultSchema = z
  .object({
    status: z.enum(["success", "partial", "failed"]),
    issuesReviewed: z.number().int().nonnegative(),
    actionableIssues: z.number().int().nonnegative(),
    jiraTasksCreated: z.number().int().nonnegative(),
    jiraTasksFailed: z.number().int().nonnegative(),
    slackNotified: z.boolean(),
    summary: z.string().max(1000),
  })
  .strict();
export type ForgeMindResult = z.infer<typeof ForgeMindResultSchema>;
