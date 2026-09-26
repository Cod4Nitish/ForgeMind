import type { AgentDeps } from "../deps";
import { createEvent } from "../events";
import { NOTIFICATION_SYSTEM, untrustedBlock } from "../prompts";
import { NotificationDecisionSchema, type NotificationDecision } from "../schemas";
import type { ForgeMindStateUpdate, ForgeMindStateValue } from "../state";
import { callStructured } from "../structured";

/**
 * The model's summary line may only reference Jira keys that were actually
 * created and issues that were actually selected.
 */
export function checkNotification(decision: NotificationDecision, createdKeys: string[], selected: number[]): string | null {
  const text = decision.messageSummary ?? "";
  const keys = new Set(createdKeys.map((k) => k.toUpperCase()));
  for (const match of text.matchAll(/\b[A-Z][A-Z0-9_]{1,9}-\d+\b/g)) {
    if (!keys.has(match[0].toUpperCase())) return `unknown Jira key ${match[0]}`;
  }
  const issues = new Set(selected);
  for (const match of text.matchAll(/#(\d+)/g)) {
    if (!issues.has(Number(match[1]))) return `unknown issue #${match[1]}`;
  }
  return null;
}

export function makeNotificationNode(deps: AgentDeps) {
  return async function notificationDecision(state: ForgeMindStateValue): Promise<ForgeMindStateUpdate> {
    const slackRequested = state.requestPlan?.requiredTools.slack ?? false;

    if (!slackRequested) {
      return {
        notification: { shouldNotify: false, reason: "Slack notification was not requested." },
        events: [
          createEvent(deps.now, {
            type: "step_skipped",
            stage: "slack",
            status: "skipped",
            summary: "Slack notification was not requested.",
          }),
        ],
      };
    }

    if (!deps.config.slack) {
      const message = "The Slack channel is not configured on the server.";
      return {
        notification: { shouldNotify: false, reason: message },
        errors: [{ stage: "slack", code: "config_error", message }],
        events: [createEvent(deps.now, { type: "decision_made", stage: "slack", status: "error", summary: message })],
      };
    }

    const tasks = state.jiraTasks ?? [];
    const selected = state.actionability?.selectedIssues ?? [];
    const createdKeys = tasks.flatMap((t) => (t.status === "created" && t.key ? [t.key] : []));
    const facts = {
      issuesReviewed: state.assessments?.length ?? 0,
      actionableIssues: (state.assessments ?? [])
        .filter((a) => selected.includes(a.issueNumber))
        .map((a) => ({ number: a.issueNumber, severity: a.severity, title: a.title })),
      jira: state.proceedToJira
        ? {
            created: tasks.filter((t) => t.status === "created").map((t) => ({ issue: t.sourceIssue, key: t.key })),
            notCreated: tasks.filter((t) => t.status !== "created").map((t) => t.sourceIssue),
            verified: state.jiraVerification?.verified ?? false,
          }
        : "Jira task creation was not part of this run.",
    };

    const outcome = await callStructured({
      model: deps.model,
      name: "notification_decision",
      schema: NotificationDecisionSchema,
      system: NOTIFICATION_SYSTEM,
      prompt: ["Actual workflow results:", untrustedBlock(facts)].join("\n\n"),
      effort: "low",
      check: (value) => checkNotification(value, createdKeys, selected),
    });

    if (!outcome.ok) {
      return {
        errors: [{ stage: "slack", code: outcome.code, message: outcome.message }],
        events: [
          createEvent(deps.now, {
            type: "decision_made",
            stage: "slack",
            status: "error",
            summary: "The notification decision failed validation; no Slack message was sent.",
          }),
        ],
      };
    }

    return {
      notification: outcome.data,
      events: [
        createEvent(deps.now, {
          type: "decision_made",
          stage: "slack",
          status: outcome.data.shouldNotify ? "success" : "skipped",
          summary: outcome.data.shouldNotify
            ? `Decision: notify the engineering team. ${outcome.data.reason}`
            : `Decision: no Slack notification. ${outcome.data.reason}`,
        }),
      ],
    };
  };
}
