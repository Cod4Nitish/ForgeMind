import type { StructuredRequest } from "@/agent/model";
import { FakeModel } from "./fake-model";
import { DEMO_GITHUB_ISSUES } from "./fixtures";

export const DEMO_PROMPT =
  "Check the latest open GitHub issues, identify critical/high-priority bugs, create Jira tasks for the actionable ones, and notify the engineering team on Slack.";

type Tools = { github: boolean; jira: boolean; slack: boolean };

const SEVERITY: Record<number, "critical" | "high" | "medium" | "low"> = {
  101: "critical",
  102: "low",
  103: "critical",
  104: "low",
  105: "high",
};

/** A valid assessment for every demo issue (101, 103, 105 actionable). */
export function demoAssessments(numbers = DEMO_GITHUB_ISSUES.map((i) => i.number)) {
  return {
    assessments: numbers.map((n) => {
      const severity = SEVERITY[n] ?? "low";
      const actionable = severity === "critical" || severity === "high";
      const title = DEMO_GITHUB_ISSUES.find((i) => i.number === n)?.title ?? `Issue ${n}`;
      return {
        issueNumber: n,
        title,
        severity,
        impact: actionable ? "Production users affected" : "Minor",
        actionable,
        recommendedAction: actionable ? "create_jira_task" : "no_action",
        reason: actionable ? "High business impact." : "Low impact.",
      };
    }),
  };
}

export function draftsFor(selected: number[]) {
  return {
    tasks: selected.map((n) => ({
      sourceIssue: n,
      summary: `Fix issue ${n}`,
      description: `Resolve the problem reported in GitHub issue ${n}.`,
      priority: SEVERITY[n] === "critical" ? "Highest" : "High",
      acceptanceCriteria: ["Root cause identified", "Regression test added"],
    })),
  };
}

/**
 * Scripted reasoning for the locked demo scenario. Jira drafts and the
 * notification summary adapt to the selected issues passed to the model.
 */
export function demoModel(tools: Tools = { github: true, jira: true, slack: true }) {
  return new FakeModel({
    request_understanding: {
      intent: "Triage open GitHub issues, track critical/high bugs in Jira and notify the team",
      requestedActions: ["inspect_github_issues", "triage_issues", "create_jira_tasks", "notify_slack"],
    },
    request_plan: {
      steps: ["Retrieve open issues", "Assess severity", "Create Jira tasks", "Notify the engineering team"],
      requiredTools: tools,
    },
    workflow_decision: { action: "continue", reason: "The request needs GitHub, Jira and Slack actions." },
    issue_assessments: demoAssessments(),
    actionability_decision: {
      shouldCreateJira: true,
      selectedIssues: [101, 103, 105],
      reason: "Three issues have high technical or business impact.",
    },
    jira_task_drafts: (request: StructuredRequest) => {
      const match = /issue numbers: ([\d, ]+)\./.exec(request.prompt);
      const selected = match ? match[1].split(",").map((s) => Number(s.trim())) : [];
      return draftsFor(selected);
    },
    notification_decision: {
      shouldNotify: true,
      reason: "High-impact issues were triaged.",
      messageSummary: "Critical and high-priority issues were triaged.",
    },
  });
}

export const jiraCreated = (key: string) => ({ data: { id: "10001", key, self: `https://example.atlassian.net/rest/api/3/issue/${key}` } });
export const jiraIssue = (key: string, project = "FORGE") => ({ data: { id: "10001", key, fields: { summary: "x", project: { key: project } } } });
export const slackOk = { data: { ok: true, channel: "C0FORGE01", ts: "1727344800.000100" } };
