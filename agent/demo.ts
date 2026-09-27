import "server-only";
import type { IntegrationConfig } from "./config";
import type { StructuredModel, StructuredRequest } from "./model";
import { SWYTCH_TOOLS, type ToolName } from "./swytchcode/tools";
import type { SwytchExecutionResult, SwytchExecutor, SwytchToolInput } from "./swytchcode/types";

/*
 * Demo mode: a self-contained sandbox used when live credentials are not
 * configured (or FORGEMIND_MODE=demo). The real LangGraph workflow, schema
 * validation, routing and safety checks all run unchanged — only the two
 * outside-world dependencies are replaced:
 *   - DemoModel returns deterministic, schema-valid reasoning.
 *   - DemoExecutor simulates GitHub, Jira and Slack; nothing leaves the server.
 */

export const DEMO_CONFIG: IntegrationConfig = {
  github: { owner: "forgemind-demo", name: "sample-service" },
  jira: { projectKey: "FORGE" },
  slack: { channel: "#forgemind-demo" },
};

type Severity = "critical" | "high" | "medium" | "low";

const DEMO_ISSUES: { number: number; title: string; body: string; labels: string[]; severity: Severity; impact: string; reason: string }[] = [
  {
    number: 101,
    title: "Payment processing fails for card checkouts",
    body: "Customers cannot complete payment; checkout returns a 500 after card submission.",
    labels: ["bug", "payments"],
    severity: "critical",
    impact: "All paying customers; direct revenue loss",
    reason: "Checkout is blocked for every card payment, stopping revenue.",
  },
  {
    number: 102,
    title: "Button alignment issue on settings page",
    body: "The Save button is slightly misaligned on narrow screens.",
    labels: ["ui"],
    severity: "low",
    impact: "Cosmetic; no functional impact",
    reason: "Visual polish only; the button still works.",
  },
  {
    number: 103,
    title: "Authentication bypass via session reuse",
    body: "A user can access another user's account by replaying an old session cookie.",
    labels: ["security"],
    severity: "critical",
    impact: "Account takeover risk for all users",
    reason: "Security vulnerability exposing other users' accounts.",
  },
  {
    number: 104,
    title: "README typo in setup section",
    body: "One spelling error in the installation instructions.",
    labels: ["docs"],
    severity: "low",
    impact: "Documentation only",
    reason: "Trivial documentation fix with no user impact.",
  },
  {
    number: 105,
    title: "Database timeouts under peak load",
    body: "Production API requests intermittently time out when traffic peaks.",
    labels: ["bug", "performance"],
    severity: "high",
    impact: "Intermittent API failures for production users",
    reason: "Recurring production reliability problem affecting users.",
  },
];

const ACTIONABLE = (s: Severity) => s === "critical" || s === "high";

const wants = (text: string, pattern: RegExp) => pattern.test(text.toLowerCase());

/** Extracts the original user request from a stage prompt ("User request:\n…"). */
function userRequest(prompt: string): string {
  const match = /User request:\n([\s\S]*?)(?:\n\n|$)/.exec(prompt);
  return match ? match[1] : prompt;
}

function toolsFor(request: string) {
  const jira = wants(request, /jira|ticket|task|engineering work|work item/);
  const slack = wants(request, /slack|notify|team|alert|message/);
  const github = jira || slack || wants(request, /github|issue|bug|triage|repo|critical|priorit/);
  return { github, jira, slack };
}

/** Deterministic stand-in for the reasoning model. Every answer passes the real schemas. */
export class DemoModel implements StructuredModel {
  async generate(request: StructuredRequest): Promise<unknown> {
    await pause(250, 500);
    // Only the first three stages see the raw request; later stages get facts.
    const tools = toolsFor(userRequest(request.prompt));

    switch (request.name) {
      case "request_understanding":
        return tools.github
          ? {
              intent: "Triage open GitHub issues" +
                (tools.jira ? ", track the actionable ones in Jira" : "") +
                (tools.slack ? " and notify the engineering team in Slack" : "") + ".",
              requestedActions: [
                "inspect_github_issues",
                "triage_issues",
                ...(tools.jira ? (["create_jira_tasks"] as const) : []),
                ...(tools.slack ? (["notify_slack"] as const) : []),
              ],
            }
          : { intent: "General question that does not need engineering-system actions.", requestedActions: ["explain"] };

      case "request_plan":
        return {
          steps: tools.github
            ? [
                "Retrieve open GitHub issues",
                "Assess severity and business impact",
                ...(tools.jira ? ["Create Jira tasks for actionable issues", "Verify the created tasks"] : []),
                ...(tools.slack ? ["Notify the engineering team in Slack"] : []),
              ]
            : ["Answer without calling external systems"],
          requiredTools: tools,
        };

      case "workflow_decision":
        return tools.github
          ? { action: "continue", reason: "The request needs live engineering-system data and actions." }
          : { action: "finish", reason: "Nothing in the request requires GitHub, Jira or Slack." };

      case "issue_assessments": {
        const numbers = [...request.prompt.matchAll(/"number": (\d+)/g)].map((m) => Number(m[1]));
        const provided = new Set(numbers);
        return {
          assessments: DEMO_ISSUES.filter((i) => provided.size === 0 || provided.has(i.number)).map((i) => ({
            issueNumber: i.number,
            title: i.title,
            severity: i.severity,
            impact: i.impact,
            actionable: ACTIONABLE(i.severity),
            recommendedAction: ACTIONABLE(i.severity) ? "create_jira_task" : "no_action",
            reason: i.reason,
          })),
        };
      }

      case "actionability_decision": {
        const selected = DEMO_ISSUES.filter((i) => ACTIONABLE(i.severity)).map((i) => i.number);
        return {
          shouldCreateJira: /The user asked for Jira/.test(request.prompt),
          selectedIssues: selected,
          reason: "Two critical issues and one high-severity issue affect production users.",
        };
      }

      case "jira_task_drafts": {
        const match = /issue numbers: ([\d, ]+)\./.exec(request.prompt);
        const selected = match ? match[1].split(",").map((s) => Number(s.trim())) : [];
        return {
          tasks: selected.map((n) => {
            const issue = DEMO_ISSUES.find((i) => i.number === n);
            return {
              sourceIssue: n,
              summary: issue ? `Fix: ${issue.title}` : `Resolve GitHub issue #${n}`,
              description: issue ? `${issue.body} Impact: ${issue.impact}.` : `Resolve the problem reported in GitHub issue #${n}.`,
              priority: issue?.severity === "critical" ? "Highest" : "High",
              acceptanceCriteria: ["Root cause identified and fixed", "Regression test added", "Verified in staging"],
            };
          }),
        };
      }

      case "notification_decision":
        return {
          shouldNotify: true,
          reason: "High-impact issues were triaged and the team should know.",
          messageSummary: "Critical and high-priority issues were triaged and routed for engineering action.",
        };

      default:
        throw new Error(`DemoModel: unsupported structured output "${request.name}"`);
    }
  }
}

let jiraSequence = 100 + Math.floor(Math.random() * 800);

/** Simulated GitHub/Jira/Slack. Shapes match the real provider responses the parsers expect. */
export class DemoExecutor implements SwytchExecutor {
  async execute(tool: ToolName, input: SwytchToolInput): Promise<SwytchExecutionResult> {
    await pause(300, 700);
    const canonicalId = SWYTCH_TOOLS[tool].canonicalId;
    const ok = (data: unknown): SwytchExecutionResult => ({ ok: true, tool, canonicalId, data, attempts: 1 });

    switch (tool) {
      case "githubListOpenIssues":
        return ok(
          DEMO_ISSUES.map((i) => ({
            number: i.number,
            title: i.title,
            body: i.body,
            state: "open",
            labels: i.labels.map((name) => ({ name })),
          })),
        );
      case "jiraCreateIssue": {
        const fields = (input.body?.fields ?? {}) as { project?: { key?: string } };
        const key = `${fields.project?.key ?? DEMO_CONFIG.jira!.projectKey}-${++jiraSequence}`;
        return ok({ id: String(10000 + jiraSequence), key, self: `https://demo.atlassian.net/rest/api/3/issue/${key}` });
      }
      case "jiraGetIssue": {
        const key = input.params?.issueIdOrKey ?? "";
        return ok({ key, fields: { summary: "Demo task", status: { name: "To Do" }, project: { key: key.split("-")[0] } } });
      }
      case "slackPostMessage":
        return ok({ ok: true, channel: input.body?.channel, ts: `${Date.now() / 1000}` });
    }
  }
}

function pause(min: number, max: number) {
  return new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));
}
