import type { IntegrationConfig } from "./config";
import type { ForgeMindResult } from "./results";
import type { ForgeMindStateValue } from "./state";

const MAX_KEYS_LISTED = 10;

/**
 * Computes the run's final status and summary from recorded state only.
 *
 * - failed:  no useful result — reasoning, GitHub retrieval or issue analysis failed.
 * - partial: useful work was done but at least one downstream action failed
 *            (any error recorded after analysis). Never reported as success.
 * - success: everything the run decided to do succeeded.
 */
export function summarizeRun(state: ForgeMindStateValue, config: IntegrationConfig): ForgeMindResult {
  const repo = `${config.github.owner}/${config.github.name}`;
  const assessments = state.assessments ?? [];
  const tasks = state.jiraTasks ?? [];
  const createdTasks = tasks.filter((t) => t.status === "created");
  const actionableIssues = state.actionability
    ? state.actionability.selectedIssues.length
    : assessments.filter((a) => a.actionable).length;

  const reasoningFailed = !state.understanding || !state.requestPlan || !state.workflowDecision;
  const failed = reasoningFailed || state.githubRun?.status === "failed" || state.analysisRun === "failed";
  const status: ForgeMindResult["status"] = failed ? "failed" : state.errors.length > 0 ? "partial" : "success";

  const counts = {
    issuesReviewed: assessments.length,
    actionableIssues,
    jiraTasksCreated: createdTasks.length,
    jiraTasksFailed: tasks.length - createdTasks.length,
    slackNotified: state.slackResult?.status === "sent",
  };

  const firstError = state.errors[0]?.message ?? "An internal step did not complete.";
  let summary: string;

  if (failed) {
    if (state.githubRun?.status === "failed") {
      summary = `ForgeMind could not retrieve GitHub issues from ${repo}. ${firstError} No downstream actions were performed.`;
    } else if (state.analysisRun === "failed") {
      summary = `ForgeMind retrieved ${state.githubRun?.issueCount ?? 0} issue(s) but could not analyze them safely. No Jira tasks or Slack messages were created.`;
    } else {
      summary = `ForgeMind could not complete the request. ${firstError}`;
    }
  } else if (!state.githubRun) {
    summary = `ForgeMind analyzed the request and determined that no external engineering action is required. ${state.workflowDecision?.reason ?? ""}`.trim();
  } else {
    const parts: string[] = [];
    parts.push(
      assessments.length === 0
        ? `No open issues were found in ${repo}.`
        : `Reviewed ${assessments.length} open issue(s) in ${repo}: ${
            actionableIssues === 0 ? "none require engineering action" : `${actionableIssues} actionable`
          }.`,
    );

    const tools = state.requestPlan?.requiredTools;
    if (state.proceedToJira) {
      const keys = createdTasks.map((t) => t.key).filter(Boolean) as string[];
      const listed = keys.slice(0, MAX_KEYS_LISTED).join(", ") + (keys.length > MAX_KEYS_LISTED ? ", …" : "");
      if (counts.jiraTasksFailed === 0) {
        parts.push(`Created ${createdTasks.length} Jira task(s) (${listed}).`);
      } else {
        parts.push(
          `Created ${createdTasks.length} of ${tasks.length} Jira task(s)${keys.length ? ` (${listed})` : ""}; ${counts.jiraTasksFailed} failed.`,
        );
      }
      const unverified = state.jiraVerification?.createdTasks.filter((t) => t.status === "unverified").length ?? 0;
      if (unverified > 0) parts.push(`${unverified} created task(s) could not be verified.`);
    } else if (tools?.jira) {
      parts.push("No Jira tasks were created.");
    }

    if (state.slackResult?.status === "sent") {
      parts.push("Engineering team notified in Slack.");
    } else if (state.slackResult?.status === "failed") {
      parts.push(`Slack notification failed: ${state.slackResult.message ?? "unknown error"}`);
    } else if (tools?.slack && state.notification && !state.notification.shouldNotify) {
      parts.push(`No Slack notification was sent: ${state.notification.reason}`);
    }

    // Surface any failure the sentences above do not already describe
    // (e.g. a failed actionability or notification decision).
    const describedStages = new Set<string>(["jira", "verification"]);
    if (state.slackResult || state.notification) describedStages.add("slack");
    const undescribed = state.errors.find((e) => !describedStages.has(e.stage));
    if (undescribed) parts.push(undescribed.message);

    summary = parts.join(" ");
  }

  return { status, ...counts, summary: summary.slice(0, 1000) };
}
