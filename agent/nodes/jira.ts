import type { AgentDeps } from "../deps";
import { createEvent, type AgentEvent } from "../events";
import { JIRA_SYSTEM, untrustedBlock } from "../prompts";
import type { AgentErrorCode } from "../errors";
import type { JiraTaskResult } from "../results";
import { JiraTaskDraftsSchema, type IssueAssessment, type JiraTaskDraft } from "../schemas";
import type { ForgeMindStateUpdate, ForgeMindStateValue } from "../state";
import { callStructured } from "../structured";
import { buildCreateIssueInput, jiraSummary, parseCreatedIssue } from "../swytchcode/jira";
import { SWYTCH_TOOLS } from "../swytchcode/tools";

const TOOL = "jiraCreateIssue";
const PRIORITY: Record<IssueAssessment["severity"], JiraTaskDraft["priority"]> = {
  critical: "Highest",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Exactly one draft per selected issue — no extras, no omissions. */
export function checkDrafts(drafts: JiraTaskDraft[], selected: number[]): string | null {
  const wanted = new Set(selected);
  const seen = new Set<number>();
  for (const draft of drafts) {
    if (!wanted.has(draft.sourceIssue)) return `draft for unselected issue #${draft.sourceIssue}`;
    if (seen.has(draft.sourceIssue)) return `duplicate draft for #${draft.sourceIssue}`;
    seen.add(draft.sourceIssue);
  }
  return seen.size === wanted.size ? null : "missing drafts for selected issues";
}

export function makeJiraNode(deps: AgentDeps) {
  return async function jira(state: ForgeMindStateValue): Promise<ForgeMindStateUpdate> {
    const selected = state.actionability?.selectedIssues ?? [];
    const assessments = new Map((state.assessments ?? []).map((a) => [a.issueNumber, a]));
    const issues = new Map((state.githubIssues ?? []).map((i) => [i.number, i]));
    const { canonicalId } = SWYTCH_TOOLS[TOOL];

    const failAll = (message: string, code: AgentErrorCode) => {
      const tasks: JiraTaskResult[] = selected.map((n) => ({
        sourceIssue: n,
        summary: `GitHub issue #${n}`,
        priority: PRIORITY[assessments.get(n)?.severity ?? "high"],
        status: "failed",
        message,
      }));
      return {
        jiraRun: "failed" as const,
        jiraTasks: tasks,
        errors: [{ stage: "jira" as const, code, message }],
        events: [
          createEvent(deps.now, {
            type: "tool_failed",
            stage: "jira",
            status: "error",
            summary: `No Jira tasks were created: ${message}`,
            tool: canonicalId,
          }),
        ],
      };
    };

    const projectKey = deps.config.jira?.projectKey;
    if (!projectKey) return failAll("The Jira project is not configured on the server.", "config_error");

    const drafted = await callStructured({
      model: deps.model,
      name: "jira_task_drafts",
      schema: JiraTaskDraftsSchema,
      system: JIRA_SYSTEM,
      prompt: [
        `Draft Jira tasks for exactly these issue numbers: ${selected.join(", ")}.`,
        untrustedBlock(
          selected.map((n) => ({
            number: n,
            title: issues.get(n)?.title,
            body: issues.get(n)?.body,
            severity: assessments.get(n)?.severity,
            impact: assessments.get(n)?.impact,
          })),
        ),
      ].join("\n\n"),
      effort: "low",
      check: (value) => checkDrafts(value.tasks, selected),
    });
    if (!drafted.ok) return failAll("Jira task content could not be generated.", drafted.code);

    const events: AgentEvent[] = [
      createEvent(deps.now, {
        type: "tool_selected",
        stage: "jira",
        status: "success",
        summary: `Jira selected to create ${selected.length} task(s) in project ${projectKey}.`,
        tool: canonicalId,
      }),
    ];
    const drafts = new Map(drafted.data.tasks.map((d) => [d.sourceIssue, d]));
    const attempted = new Set<number>(); // per-run mutation ledger: one create per source issue
    const tasks: JiraTaskResult[] = [];

    for (const number of selected) {
      const draft = drafts.get(number)!;
      if (attempted.has(number)) continue;
      attempted.add(number);

      const base = { sourceIssue: number, summary: jiraSummary(draft), priority: draft.priority };
      const result = await deps.executor.execute(TOOL, buildCreateIssueInput(draft, projectKey, deps.config.github, state.runId));
      let task: JiraTaskResult;
      if (!result.ok) {
        task = { ...base, status: "failed", message: result.error.message };
      } else {
        const created = parseCreatedIssue(result.data, projectKey);
        task = created
          ? { ...base, status: "created", key: created.key }
          : {
              ...base,
              status: "unconfirmed",
              message: "Jira responded without a task key; check the project before re-running.",
            };
      }
      tasks.push(task);
      events.push(
        createEvent(deps.now, {
          type: task.status === "created" ? "tool_completed" : "tool_failed",
          stage: "jira",
          status: task.status === "created" ? "success" : task.status === "unconfirmed" ? "warning" : "error",
          summary:
            task.status === "created"
              ? `${task.key} created for GitHub issue #${number}.`
              : `Task creation for GitHub issue #${number} ${task.status === "unconfirmed" ? "is unconfirmed" : "failed"}: ${task.message}`,
          tool: canonicalId,
        }),
      );
    }

    const created = tasks.filter((t) => t.status === "created").length;
    const notCreated = tasks.length - created;
    const jiraRun = notCreated === 0 ? "success" : created === 0 ? "failed" : "partial";
    events.push(
      createEvent(deps.now, {
        type: jiraRun === "failed" ? "tool_failed" : "tool_completed",
        stage: "jira",
        status: jiraRun === "success" ? "success" : jiraRun === "partial" ? "warning" : "error",
        summary: `${created} of ${tasks.length} Jira task(s) created.`,
        tool: canonicalId,
      }),
    );

    return {
      jiraRun,
      jiraTasks: tasks,
      errors:
        notCreated > 0
          ? [{ stage: "jira", code: "tool_error", message: `${notCreated} of ${tasks.length} Jira task(s) could not be created.` }]
          : [],
      events,
    };
  };
}
