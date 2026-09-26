import type { AgentApiResponse, ApiJiraTask, ApiSlack, StageStatus } from "@/lib/api/contract";
import type { IntegrationConfig } from "./config";
import type { ForgeMindStateValue } from "./state";
import { summarizeRun } from "./summary";

type Timing = { startedAt: Date; finishedAt: Date };

/**
 * Maps final graph state to the browser contract. Only sanitized summaries
 * cross this boundary: no raw provider payloads, prompts, issue bodies,
 * credentials or model reasoning.
 */
export function toApiResponse(
  state: ForgeMindStateValue,
  config: IntegrationConfig,
  runId: string,
  timing: Timing,
): AgentApiResponse {
  const result = state.result ?? summarizeRun(state, config);
  const selected = new Set(state.actionability?.selectedIssues ?? []);
  const urls = new Map((state.githubIssues ?? []).map((i) => [i.number, i.url]));
  const verification = new Map((state.jiraVerification?.createdTasks ?? []).map((t) => [t.sourceIssue, t.status]));
  const fallback: StageStatus = result.status === "failed" ? "not_run" : "skipped";

  const jiraTasks: ApiJiraTask[] = (state.jiraTasks ?? []).map((task) => {
    const verified = verification.get(task.sourceIssue);
    return {
      sourceIssue: task.sourceIssue,
      summary: task.summary,
      priority: task.priority,
      status: task.status,
      key: task.key,
      verification: verified === "verified" ? "verified" : verified === "unverified" ? "unverified" : "not_checked",
      message: task.message,
    };
  });

  const slackError = state.errors.find((e) => e.stage === "slack");
  const slack: ApiSlack = state.slackResult
    ? { status: state.slackResult.status, channel: state.slackResult.channel, reason: state.notification?.reason, message: state.slackResult.message }
    : {
        status: slackError ? "failed" : "skipped",
        reason: state.notification?.reason ?? (state.requestPlan?.requiredTools.slack ? undefined : "Slack notification was not requested."),
        message: slackError?.message,
      };

  const created = jiraTasks.filter((t) => t.status === "created").length;
  const verifiedCount = jiraTasks.filter((t) => t.verification === "verified").length;

  return {
    runId,
    status: result.status,
    issuesReviewed: result.issuesReviewed,
    actionableIssues: result.actionableIssues,
    jiraTasksCreated: result.jiraTasksCreated,
    jiraTasksFailed: result.jiraTasksFailed,
    slackNotified: result.slackNotified,
    summary: result.summary,

    intent: state.understanding?.intent,
    plan: state.requestPlan?.steps ?? [],
    decision: state.workflowDecision,
    repository: state.githubRun ? `${config.github.owner}/${config.github.name}` : undefined,

    stages: {
      github: state.githubRun?.status ?? fallback,
      analysis: state.analysisRun ?? fallback,
      jira: state.jiraRun ?? (state.errors.some((e) => e.stage === "jira") ? "failed" : fallback),
      verification: !state.jiraVerification
        ? fallback
        : created === 0
          ? "skipped"
          : verifiedCount === created
            ? "success"
            : verifiedCount > 0
              ? "partial"
              : "failed",
      slack: state.slackResult
        ? state.slackResult.status === "sent"
          ? "success"
          : state.slackResult.status === "failed"
            ? "failed"
            : "skipped"
        : slackError
          ? "failed"
          : fallback,
    },

    issues: (state.assessments ?? []).map((a) => ({
      number: a.issueNumber,
      title: a.title,
      url: urls.get(a.issueNumber) ?? `https://github.com/${config.github.owner}/${config.github.name}/issues/${a.issueNumber}`,
      severity: a.severity,
      impact: a.impact,
      actionable: a.actionable,
      selected: selected.has(a.issueNumber),
      reason: a.reason,
    })),
    jiraTasks,
    slack,

    events: state.events,
    errors: state.errors,

    startedAt: timing.startedAt.toISOString(),
    finishedAt: timing.finishedAt.toISOString(),
    durationMs: Math.max(0, timing.finishedAt.getTime() - timing.startedAt.getTime()),
  };
}
