import type { AgentDeps } from "../deps";
import { createEvent } from "../events";
import type { ForgeMindStateUpdate, ForgeMindStateValue } from "../state";
import { buildPostMessageInput, buildSlackMessage, parseSlackResponse } from "../swytchcode/slack";
import { SWYTCH_TOOLS } from "../swytchcode/tools";

const TOOL = "slackPostMessage";

/** Posts one summary to the configured channel. Never retried (see policy.ts). */
export function makeSlackNode(deps: AgentDeps) {
  return async function slack(state: ForgeMindStateValue): Promise<ForgeMindStateUpdate> {
    const channel = deps.config.slack?.channel;
    const { canonicalId } = SWYTCH_TOOLS[TOOL];
    if (!channel) {
      const message = "The Slack channel is not configured on the server.";
      return {
        slackResult: { status: "failed", message },
        errors: [{ stage: "slack", code: "config_error", message }],
        events: [createEvent(deps.now, { type: "tool_failed", stage: "slack", status: "error", summary: message })],
      };
    }

    const selected = new Set(state.actionability?.selectedIssues ?? []);
    const taskList = state.jiraTasks ?? [];
    const taskByIssue = new Map(taskList.map((t) => [t.sourceIssue, t]));
    const text = buildSlackMessage({
      repository: `${deps.config.github.owner}/${deps.config.github.name}`,
      headline: state.notification?.messageSummary,
      issuesReviewed: state.assessments?.length ?? 0,
      actionable: (state.assessments ?? [])
        .filter((a) => selected.has(a.issueNumber))
        .map((a) => {
          const task = taskByIssue.get(a.issueNumber);
          return {
            number: a.issueNumber,
            severity: a.severity,
            title: a.title,
            jiraKey: task?.status === "created" ? task.key : undefined,
            jiraFailed: task !== undefined && task.status !== "created",
          };
        }),
      jiraCreated: taskList.filter((t) => t.status === "created").length,
      jiraFailed: taskList.filter((t) => t.status !== "created").length,
      jiraRequested: state.proceedToJira ?? false,
      runId: state.runId,
    });

    const started = [
      createEvent(deps.now, {
        type: "tool_selected",
        stage: "slack",
        status: "success",
        summary: "Slack selected to notify the engineering team.",
        tool: canonicalId,
      }),
    ];
    const result = await deps.executor.execute(TOOL, buildPostMessageInput(channel, text));
    const delivery = result.ok ? parseSlackResponse(result.data) : { ok: false as const, error: result.error };

    if (!delivery.ok) {
      return {
        slackResult: { status: "failed", channel, message: delivery.error.message },
        errors: [{ stage: "slack", code: "tool_error", message: delivery.error.message }],
        events: [
          ...started,
          createEvent(deps.now, {
            type: "tool_failed",
            stage: "slack",
            status: "error",
            summary: `Slack notification failed: ${delivery.error.message}`,
            tool: canonicalId,
          }),
        ],
      };
    }

    return {
      slackResult: { status: "sent", channel },
      events: [
        ...started,
        createEvent(deps.now, {
          type: "tool_completed",
          stage: "slack",
          status: "success",
          summary: `Engineering team notified in ${channel}.`,
          tool: canonicalId,
        }),
      ],
    };
  };
}
