/**
 * The POST /api/agent response contract — the only agent data the browser
 * ever receives. Type-only module: safe to import from Client Components.
 * Everything here is a sanitized summary; no credentials, raw provider
 * payloads, prompts or private model reasoning.
 */

export type RunStatus = "success" | "partial" | "failed";

export type EventStage =
  | "request"
  | "reasoning"
  | "github"
  | "analysis"
  | "jira"
  | "verification"
  | "slack"
  | "final";

export type EventStatus = "running" | "success" | "skipped" | "warning" | "error";

export type ApiEvent = {
  type: string;
  stage: EventStage;
  status: EventStatus;
  /** Short, public-safe description of what happened. */
  summary: string;
  /** ISO-8601. */
  timestamp: string;
  /** Swytchcode canonical ID when the event concerns a tool. */
  tool?: string;
};

export type Severity = "critical" | "high" | "medium" | "low";

export type ApiIssue = {
  number: number;
  /** Untrusted third-party text — render as plain text only. */
  title: string;
  url: string;
  severity: Severity;
  impact: string;
  actionable: boolean;
  /** Selected by the actionability decision for follow-up. */
  selected: boolean;
  reason: string;
};

export type ApiJiraTask = {
  sourceIssue: number;
  summary: string;
  priority: "Highest" | "High" | "Medium" | "Low";
  /** `unconfirmed`: Jira answered without a usable task key — may need a manual check. */
  status: "created" | "failed" | "unconfirmed";
  key?: string;
  verification: "verified" | "unverified" | "not_checked";
  message?: string;
};

export type ApiSlack = {
  status: "sent" | "failed" | "skipped";
  channel?: string;
  /** Why it was skipped / sent (agent decision summary). */
  reason?: string;
  /** Safe failure message. */
  message?: string;
};

/** Per-stage outcome so the UI never re-derives agent logic. */
export type StageStatus = "success" | "partial" | "failed" | "skipped" | "not_run";

export type AgentApiResponse = {
  runId: string;
  status: RunStatus;

  issuesReviewed: number;
  actionableIssues: number;
  jiraTasksCreated: number;
  jiraTasksFailed: number;
  slackNotified: boolean;
  summary: string;

  intent?: string;
  plan: string[];
  decision?: { action: "continue" | "finish"; reason: string };
  /** owner/repo the issues came from (trusted configuration). */
  repository?: string;

  stages: {
    github: StageStatus;
    analysis: StageStatus;
    jira: StageStatus;
    verification: StageStatus;
    slack: StageStatus;
  };

  issues: ApiIssue[];
  jiraTasks: ApiJiraTask[];
  slack: ApiSlack;

  events: ApiEvent[];
  errors: { stage: EventStage; code: string; message: string }[];

  startedAt: string;
  finishedAt: string;
  durationMs: number;
};

export type AgentApiErrorCode =
  | "invalid_json"
  | "invalid_request"
  | "payload_too_large"
  | "unsupported_media_type"
  | "configuration_error"
  | "internal_error";

/** Non-200 responses. */
export type AgentApiError = {
  error: { code: AgentApiErrorCode; message: string };
  runId?: string;
};

/** Request body. `prompt` is accepted as an alias of `message`. */
export type AgentApiRequest = { message: string };

export const MAX_MESSAGE_LENGTH = 4000;
