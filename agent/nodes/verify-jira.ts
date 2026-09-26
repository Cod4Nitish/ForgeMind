import type { AgentDeps } from "../deps";
import { createEvent, type AgentEvent } from "../events";
import type { JiraVerificationResult } from "../results";
import type { ForgeMindStateUpdate, ForgeMindStateValue } from "../state";
import { buildGetIssueInput, isVerifiedIssue } from "../swytchcode/jira";
import { SWYTCH_TOOLS } from "../swytchcode/tools";

const TOOL = "jiraGetIssue";

/**
 * Reads each created task back from Jira. A task counts as verified only when
 * Jira returns the same key in the configured project — never assumed.
 */
export function makeVerifyJiraNode(deps: AgentDeps) {
  return async function verifyJira(state: ForgeMindStateValue): Promise<ForgeMindStateUpdate> {
    const tasks = state.jiraTasks ?? [];
    const projectKey = deps.config.jira?.projectKey;
    const { canonicalId } = SWYTCH_TOOLS[TOOL];
    const createdTasks: JiraVerificationResult["createdTasks"] = [];
    const events: AgentEvent[] = [];

    for (const task of tasks) {
      if (task.status !== "created" || !task.key || !projectKey) {
        createdTasks.push({ sourceIssue: task.sourceIssue, jiraKey: task.key, status: "failed" });
        continue;
      }
      const result = await deps.executor.execute(TOOL, buildGetIssueInput(task.key));
      const verified = result.ok && isVerifiedIssue(result.data, task.key, projectKey);
      createdTasks.push({ sourceIssue: task.sourceIssue, jiraKey: task.key, status: verified ? "verified" : "unverified" });
    }

    const createdCount = tasks.filter((t) => t.status === "created").length;
    const verifiedCount = createdTasks.filter((t) => t.status === "verified").length;
    const unverified = createdCount - verifiedCount;

    const summary =
      createdCount === 0
        ? "No created Jira tasks to verify."
        : `${verifiedCount} of ${createdCount} created Jira task(s) verified.`;
    events.push(
      createEvent(deps.now, {
        type: createdCount === 0 ? "step_skipped" : unverified === 0 ? "tool_completed" : "tool_failed",
        stage: "verification",
        status: createdCount === 0 ? "skipped" : unverified === 0 ? "success" : "warning",
        summary,
        tool: createdCount === 0 ? undefined : canonicalId,
      }),
    );

    return {
      jiraVerification: {
        verified: createdCount > 0 && unverified === 0,
        createdTasks,
        summary,
      },
      errors:
        unverified > 0
          ? [{ stage: "verification", code: "tool_error", message: `${unverified} created Jira task(s) could not be verified.` }]
          : [],
      events,
    };
  };
}
