import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_LENGTH, type AgentApiResponse, type ApiEvent } from "@/lib/api/contract";
import {
  NOTHING_ACTIONABLE_TEXT,
  NO_DOWNSTREAM_ACTIONS_TEXT,
  SYSTEM_HEALTH,
  buildWorkflow,
  describeApiError,
  downstreamLead,
  interpretHealth,
  issueJiraAction,
  jiraProjectFromKey,
  joinIssueActions,
  overviewMetrics,
  padMetric,
  promptCounter,
  runStatusChip,
  toViewModel,
  type JiraTaskView,
} from "@/lib/presentation";

/* Deterministic fixtures — the only place sample numbers may appear. */

const T0 = "2026-09-26T10:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

function event(stage: ApiEvent["stage"], status: ApiEvent["status"], summary: string, seconds: number): ApiEvent {
  return { type: "test", stage, status, summary, timestamp: at(seconds) };
}

function successResponse(): AgentApiResponse {
  return {
    runId: "run-success",
    status: "success",
    issuesReviewed: 5,
    actionableIssues: 3,
    jiraTasksCreated: 3,
    jiraTasksFailed: 0,
    slackNotified: true,
    summary: "Reviewed 5 issues; created 3 Jira tasks; notified Slack.",
    intent: "Triage open issues",
    plan: ["Retrieve open issues", "Create Jira tasks", "Notify team"],
    decision: { action: "continue", reason: "Needs GitHub, Jira and Slack." },
    repository: "acme/app",
    stages: { github: "success", analysis: "success", jira: "success", verification: "success", slack: "success" },
    issues: [
      { number: 101, title: "Payments fail", url: "https://github.com/acme/app/issues/101", severity: "critical", impact: "Revenue", actionable: true, selected: true, reason: "Blocking" },
      { number: 102, title: "Typo", url: "https://github.com/acme/app/issues/102", severity: "low", impact: "Cosmetic", actionable: false, selected: false, reason: "Minor" },
      { number: 103, title: "Auth bypass", url: "https://github.com/acme/app/issues/103", severity: "critical", impact: "Security", actionable: true, selected: true, reason: "Security" },
      { number: 105, title: "DB timeout", url: "https://github.com/acme/app/issues/105", severity: "high", impact: "Latency", actionable: true, selected: true, reason: "Reliability" },
    ],
    jiraTasks: [
      { sourceIssue: 101, summary: "Fix payments", priority: "Highest", status: "created", key: "FORGE-1", verification: "verified" },
      { sourceIssue: 103, summary: "Fix auth", priority: "Highest", status: "created", key: "FORGE-2", verification: "verified" },
      { sourceIssue: 105, summary: "Fix DB", priority: "High", status: "created", key: "FORGE-3", verification: "unverified" },
    ],
    slack: { status: "sent", channel: "#forgemind-demo", reason: "High-impact issues tracked." },
    events: [
      event("request", "success", "Engineering request received.", 0),
      event("reasoning", "success", "Decision: continue.", 2),
      event("github", "running", "Retrieving issues.", 3),
      event("github", "success", "5 issues retrieved.", 5),
      event("analysis", "success", "3 actionable.", 15),
      event("jira", "success", "3 Jira tasks created.", 25),
      event("verification", "success", "3 verified.", 30),
      event("slack", "success", "Team notified.", 38),
      event("final", "success", "Workflow completed.", 41),
    ],
    errors: [],
    startedAt: T0,
    finishedAt: at(41),
    durationMs: 41000,
  };
}

function failedGithubResponse(): AgentApiResponse {
  return {
    ...successResponse(),
    runId: "run-failed",
    status: "failed",
    issuesReviewed: 0,
    actionableIssues: 0,
    jiraTasksCreated: 0,
    slackNotified: false,
    stages: { github: "failed", analysis: "not_run", jira: "not_run", verification: "not_run", slack: "not_run" },
    issues: [],
    jiraTasks: [],
    slack: { status: "skipped" },
    events: [
      event("request", "success", "Engineering request received.", 0),
      event("reasoning", "success", "Decision: continue.", 2),
      event("github", "error", "GitHub could not be reached.", 6),
    ],
    errors: [{ stage: "github", code: "github_unavailable", message: "GitHub issues could not be retrieved." }],
    finishedAt: at(6.5),
    durationMs: 6500,
  };
}

function emptyResponse(): AgentApiResponse {
  const base = successResponse();
  return {
    ...base,
    actionableIssues: 0,
    jiraTasksCreated: 0,
    slackNotified: false,
    stages: { github: "success", analysis: "success", jira: "skipped", verification: "skipped", slack: "skipped" },
    issues: base.issues.map((issue) => ({ ...issue, actionable: false, selected: false })),
    jiraTasks: [],
    slack: { status: "skipped", reason: "Nothing to report." },
    events: [
      event("request", "success", "Engineering request received.", 0),
      event("github", "success", "4 issues retrieved.", 4),
      event("analysis", "success", "No actionable issues.", 10),
      event("jira", "skipped", "Skipped — no actionable issues.", 10),
      event("slack", "skipped", "Skipped — nothing to report.", 10),
    ],
    finishedAt: at(10),
  };
}

function partialResponse(): AgentApiResponse {
  const base = successResponse();
  return {
    ...base,
    status: "partial",
    jiraTasksCreated: 1,
    jiraTasksFailed: 1,
    stages: { ...base.stages, jira: "partial", verification: "partial" },
    jiraTasks: [
      base.jiraTasks[0],
      { sourceIssue: 103, summary: "Fix auth", priority: "Highest", status: "unconfirmed", verification: "not_checked" },
      { sourceIssue: 105, summary: "Fix DB", priority: "High", status: "failed", key: "IGNORED-9", verification: "not_checked", message: "Rejected." },
    ],
  };
}

describe("padMetric", () => {
  it.each([
    [0, "00"],
    [5, "05"],
    [12, "12"],
    [120, "120"],
    [3.9, "03"],
    [-4, "00"],
    [Number.NaN, "00"],
    [Number.POSITIVE_INFINITY, "00"],
  ])("pads %d as %s", (value, label) => {
    expect(padMetric(value)).toBe(label);
  });
});

describe("jiraProjectFromKey", () => {
  it.each([
    ["SCRUM-12", "SCRUM"],
    ["FORGE-1", "FORGE"],
    ["AB2_X-900", "AB2_X"],
    ["  OPS-7  ", "OPS"],
  ])("derives the project of %s", (key, project) => {
    expect(jiraProjectFromKey(key)).toBe(project);
  });

  it.each([
    ["undefined", undefined],
    ["empty", ""],
    ["lowercase", "scrum-1"],
    ["no number", "SCRUM-"],
    ["zero id", "SCRUM-0"],
    ["two dashes", "SHOULD-NOT-SHOW"],
    ["single letter project", "A-1"],
    ["a number", 12],
  ])("returns undefined for %s", (_label, key) => {
    expect(jiraProjectFromKey(key)).toBeUndefined();
  });
});

describe("issueJiraAction / joinIssueActions", () => {
  const task = (sourceIssue: number, status: JiraTaskView["status"], key?: string): JiraTaskView => ({
    id: `${sourceIssue}-${status}`,
    sourceIssue,
    status,
    statusLabel: status,
    tone: "neutral",
    title: "t",
    priority: "High",
    ...(key ? { key } : {}),
  });

  it("joins every issue to its actual Jira key, in order", () => {
    const rows = joinIssueActions(toViewModel(successResponse()));
    expect(rows.map((row) => [row.issue.number, row.action.kind, row.action.label])).toEqual([
      [101, "key", "FORGE-1"],
      [102, "none", "No Jira task"],
      [103, "key", "FORGE-2"],
      [105, "key", "FORGE-3"],
    ]);
    expect(rows[0].action).toMatchObject({ key: "FORGE-1", tone: "success" });
  });

  it("marks unconfirmed and failed rows and never shows a failed task's key", () => {
    const rows = joinIssueActions(toViewModel(partialResponse()));
    expect(rows.map((row) => row.action.label)).toEqual(["FORGE-1", "No Jira task", "Unconfirmed", "Failed"]);
    expect(rows[2].action.tone).toBe("warning");
    expect(rows[3].action).toMatchObject({ kind: "failed", tone: "danger" });
    expect(rows[3].action.key).toBeUndefined();
  });

  it("prefers created over unconfirmed over failed for the same issue", () => {
    const issue = { number: 7, selected: true };
    expect(issueJiraAction(issue, [task(7, "failed"), task(7, "created", "OPS-1")], "partial").label).toBe("OPS-1");
    expect(issueJiraAction(issue, [task(7, "failed"), task(7, "unconfirmed")], "partial").kind).toBe("unconfirmed");
    expect(issueJiraAction(issue, [task(7, "created")], "success")).toMatchObject({ kind: "created", label: "Created" });
  });

  it("reports Skipped only for selected issues when the Jira stage did not run", () => {
    expect(issueJiraAction({ number: 1, selected: true }, [], "skipped").kind).toBe("skipped");
    expect(issueJiraAction({ number: 1, selected: true }, [], "not_run").kind).toBe("skipped");
    expect(issueJiraAction({ number: 1, selected: true }, [], "failed").kind).toBe("none");
    expect(issueJiraAction({ number: 1, selected: false }, [], "skipped").kind).toBe("none");
    expect(issueJiraAction({ number: 1, selected: true }, [], undefined).kind).toBe("none");
  });

  it("shows no Jira action for an empty (nothing actionable) run", () => {
    const rows = joinIssueActions(toViewModel(emptyResponse()));
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.action.kind === "none")).toBe(true);
  });
});

describe("overviewMetrics", () => {
  it("zero-pads real counters and labels Slack", () => {
    const metrics = overviewMetrics(toViewModel(successResponse()));
    expect(metrics.map((m) => [m.key, m.label, m.value])).toEqual([
      ["issues", "Issues scanned", "05"],
      ["actionable", "Actionable", "03"],
      ["jira", "Jira tasks", "03"],
      ["slack", "Slack", "SENT"],
    ]);
    expect(metrics[0].notes).toEqual([{ text: "acme/app", tone: "neutral", mono: true }]);
    expect(metrics[3]).toMatchObject({ valueTone: "success", notes: [{ text: "#forgemind-demo", mono: true }] });
  });

  it("adds failed / unconfirmed sub-labels to the Jira metric", () => {
    const jira = overviewMetrics(toViewModel(partialResponse())).find((m) => m.key === "jira");
    expect(jira?.value).toBe("01");
    expect(jira?.notes).toEqual([
      { text: "created", tone: "neutral" },
      { text: "1 failed", tone: "danger" },
      { text: "1 unconfirmed", tone: "warning" },
    ]);
  });

  it("shows 00 counters and SKIPPED for an informational or empty run", () => {
    const metrics = overviewMetrics(toViewModel(emptyResponse()));
    expect(metrics.map((m) => m.value)).toEqual(["05", "00", "00", "SKIPPED"]);
    expect(metrics[3].notes).toEqual([]);
  });
});

describe("buildWorkflow", () => {
  const KEYS = ["request", "reason", "github", "analyze", "jira", "verify", "slack", "result"];

  it("lists the eight nodes in order with fixed names and descriptions", () => {
    const nodes = buildWorkflow({ phase: "idle" });
    expect(nodes.map((n) => n.key)).toEqual(KEYS);
    expect(nodes.map((n) => [n.label, n.description])).toEqual([
      ["Request", "Engineering request"],
      ["Reason", "Understand & plan"],
      ["GitHub", "Inspect repository issues"],
      ["Analyze", "Evaluate severity & impact"],
      ["Jira", "Create engineering work"],
      ["Verify", "Confirm tasks exist"],
      ["Slack", "Notify the team"],
      ["Result", "Final outcome"],
    ]);
  });

  it("idle: every node is Waiting, none active, no durations", () => {
    const nodes = buildWorkflow({ phase: "idle" });
    expect(nodes.every((n) => n.status === "waiting" && n.statusLabel === "Waiting" && n.tone === "pending")).toBe(true);
    expect(nodes.some((n) => n.active || n.durationLabel)).toBe(false);
  });

  it("running: only Request is active; nothing else is claimed", () => {
    const nodes = buildWorkflow({ phase: "running" });
    expect(nodes[0]).toMatchObject({ status: "running", statusLabel: "Running", tone: "running", active: true });
    expect(nodes.slice(1).every((n) => n.status === "waiting" && !n.active)).toBe(true);
    expect(nodes.filter((n) => n.active)).toHaveLength(1);
    expect(nodes.some((n) => n.durationMs !== undefined)).toBe(false);
  });

  it("success: every node done, Result Complete, durations from real timestamps", () => {
    const nodes = buildWorkflow({ phase: "done", view: toViewModel(successResponse()) });
    expect(nodes.map((n) => [n.key, n.status, n.statusLabel])).toEqual([
      ["request", "done", "Complete"],
      ["reason", "done", "Complete"],
      ["github", "done", "Complete"],
      ["analyze", "done", "Complete"],
      ["jira", "done", "Complete"],
      ["verify", "done", "Complete"],
      ["slack", "done", "Complete"],
      ["result", "done", "Complete"],
    ]);
    expect(nodes.map((n) => n.durationLabel)).toEqual(["0.0s", "2.0s", "3.0s", "10s", "10s", "5.0s", "8.0s", "41s"]);
    expect(nodes.some((n) => n.active)).toBe(false);
  });

  it("failed at GitHub: downstream not run, Result Failed, no durations for nodes that never ran", () => {
    const nodes = buildWorkflow({ phase: "done", view: toViewModel(failedGithubResponse()) });
    expect(nodes.map((n) => [n.status, n.statusLabel, n.tone])).toEqual([
      ["done", "Complete", "success"],
      ["done", "Complete", "success"],
      ["failed", "Failed", "danger"],
      ["not_run", "Not run", "neutral"],
      ["not_run", "Not run", "neutral"],
      ["not_run", "Not run", "neutral"],
      ["not_run", "Not run", "neutral"],
      ["failed", "Failed", "danger"],
    ]);
    expect(nodes[2].durationLabel).toBe("4.0s");
    expect(nodes[7].durationLabel).toBe("6.5s");
    expect(nodes.slice(3, 7).every((n) => n.durationMs === undefined)).toBe(true);
  });

  it("empty run: skipped stages carry no duration", () => {
    const nodes = buildWorkflow({ phase: "done", view: toViewModel(emptyResponse()) });
    expect(nodes.map((n) => n.status)).toEqual(["done", "done", "done", "done", "skipped", "skipped", "skipped", "done"]);
    expect(nodes.slice(4, 7).every((n) => n.statusLabel === "Skipped" && n.durationLabel === undefined)).toBe(true);
  });

  it("partial run: Jira/Verify partial and Result Partial", () => {
    const nodes = buildWorkflow({ phase: "done", view: toViewModel(partialResponse()) });
    expect(nodes.find((n) => n.key === "jira")).toMatchObject({ status: "partial", statusLabel: "Partial", tone: "warning" });
    expect(nodes.find((n) => n.key === "result")).toMatchObject({ status: "partial", statusLabel: "Partial" });
  });

  it("omits durations when timestamps are unreadable or out of order", () => {
    const base = successResponse();
    const view = toViewModel({
      ...base,
      startedAt: "not-a-date",
      finishedAt: "",
      events: [
        { ...base.events[0], timestamp: "garbage" },
        event("github", "success", "Issues retrieved.", 9),
        event("analysis", "success", "Analyzed.", 4),
      ],
    });
    const nodes = buildWorkflow({ phase: "done", view });
    expect(nodes.find((n) => n.key === "request")?.durationMs).toBeUndefined();
    expect(nodes.find((n) => n.key === "github")?.durationMs).toBeUndefined();
    expect(nodes.find((n) => n.key === "analyze")?.durationMs).toBeUndefined();
    expect(nodes.find((n) => n.key === "result")?.durationMs).toBeUndefined();
    // No events for a completed stage → no duration either.
    expect(nodes.find((n) => n.key === "jira")).toMatchObject({ status: "done" });
    expect(nodes.find((n) => n.key === "jira")?.durationMs).toBeUndefined();
  });

  it("HTTP errors: downstream is Not run only when the server confirmed nothing started", () => {
    const config = buildWorkflow({ phase: "error", error: describeApiError(503, { error: { code: "configuration_error", message: "x" } }) });
    expect(config[0]).toMatchObject({ status: "failed", statusLabel: "Error", tone: "danger" });
    expect(config.slice(1, 7).every((n) => n.statusLabel === "Not run")).toBe(true);
    expect(config[7]).toMatchObject({ statusLabel: "Error", tone: "danger" });

    for (const error of [describeApiError(500, { error: { code: "internal_error", message: "x" } }), describeApiError(0, null)]) {
      const nodes = buildWorkflow({ phase: "error", error });
      expect(nodes.slice(1, 7).every((n) => n.status === "unknown" && n.statusLabel === "Not reported")).toBe(true);
    }

    const validation = buildWorkflow({ phase: "error", error: describeApiError(400, { error: { code: "invalid_request", message: "bad" } }) });
    expect(validation[0]).toMatchObject({ statusLabel: "Not accepted", tone: "warning" });
    expect(validation[7]).toMatchObject({ status: "not_run", statusLabel: "Not run" });
  });
});

describe("runStatusChip", () => {
  it("maps every lifecycle phase to Ready / Executing / Complete / Partial / Failed / Error", () => {
    expect(runStatusChip({ phase: "idle" })).toEqual({ label: "Ready", tone: "neutral" });
    expect(runStatusChip({ phase: "running" })).toEqual({ label: "Executing", tone: "running" });
    expect(runStatusChip({ phase: "done", view: toViewModel(successResponse()) })).toEqual({ label: "Complete", tone: "success" });
    expect(runStatusChip({ phase: "done", view: toViewModel(partialResponse()) })).toEqual({ label: "Partial", tone: "warning" });
    expect(runStatusChip({ phase: "done", view: toViewModel(failedGithubResponse()) })).toEqual({ label: "Failed", tone: "danger" });
    expect(runStatusChip({ phase: "error", error: describeApiError(0, null) })).toEqual({ label: "Error", tone: "danger" });
  });
});

describe("system health", () => {
  it("is online only for an ok answer with status ok", () => {
    expect(interpretHealth(true, { status: "ok", service: "ForgeMind" })).toBe("online");
    expect(interpretHealth(true, { status: "degraded" })).toBe("unreachable");
    expect(interpretHealth(false, { status: "ok" })).toBe("unreachable");
    expect(interpretHealth(true, null)).toBe("unreachable");
  });

  it("uses fixed chip labels", () => {
    expect(SYSTEM_HEALTH).toEqual({
      checking: { label: "Checking…", tone: "pending" },
      online: { label: "Online", tone: "success" },
      unreachable: { label: "Unreachable", tone: "danger" },
    });
  });
});

describe("promptCounter", () => {
  it("counts trimmed characters and formats against the limit", () => {
    expect(promptCounter("  fix bugs  ")).toEqual({ length: 8, label: "8 / 4,000", tone: "neutral" });
    expect(promptCounter("")).toMatchObject({ length: 0, label: "0 / 4,000", tone: "neutral" });
  });

  it("warns near the limit and turns danger over it", () => {
    expect(promptCounter("x".repeat(3599)).tone).toBe("neutral");
    expect(promptCounter("x".repeat(3600)).tone).toBe("warning");
    expect(promptCounter("x".repeat(MAX_MESSAGE_LENGTH)).tone).toBe("warning");
    expect(promptCounter("x".repeat(MAX_MESSAGE_LENGTH + 1))).toMatchObject({ label: "4,001 / 4,000", tone: "danger" });
  });
});

describe("downstreamLead", () => {
  it("leads the side-effects note only when the server summary does not already say it", () => {
    const failed = toViewModel(failedGithubResponse());
    expect(failed.sideEffectsNote).toBeDefined();
    expect(downstreamLead({ ...failed, summary: "GitHub issue retrieval failed." })).toBe(NO_DOWNSTREAM_ACTIONS_TEXT);
    expect(downstreamLead({ ...failed, summary: "Retrieval failed. No downstream actions were performed." })).toBeUndefined();
  });

  it("is absent when external actions happened or the run succeeded", () => {
    expect(downstreamLead(toViewModel(partialResponse()))).toBeUndefined();
    expect(downstreamLead(toViewModel(successResponse()))).toBeUndefined();
  });
});

describe("fixed v2 copy", () => {
  it("uses the exact spec wording", () => {
    expect(NOTHING_ACTIONABLE_TEXT).toBe("Skipped — nothing actionable");
    expect(NO_DOWNSTREAM_ACTIONS_TEXT).toBe("No downstream actions were performed.");
  });
});
