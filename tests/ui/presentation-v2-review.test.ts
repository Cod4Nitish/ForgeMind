import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_LENGTH, type AgentApiResponse, type ApiEvent, type ApiIssue } from "@/lib/api/contract";
import {
  NO_DOWNSTREAM_ACTIONS_TEXT,
  buildWorkflow,
  describeApiError,
  downstreamLead,
  errorTone,
  jiraOutcomeCounts,
  joinIssueActions,
  overviewMetrics,
  padMetric,
  promptCounter,
  runStatusChip,
  toViewModel,
} from "@/lib/presentation";

/*
 * Review follow-ups for the v2 helpers. Fixtures here follow the server's own
 * counter semantics (agent/summary.ts): `issuesReviewed` is the number of
 * assessed issues and `jiraTasksFailed` is every task that was NOT created
 * (so it includes unconfirmed tasks).
 */

const T0 = "2026-09-26T10:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

function event(stage: ApiEvent["stage"], status: ApiEvent["status"], summary: string, seconds: number): ApiEvent {
  return { type: "test", stage, status, summary, timestamp: at(seconds) };
}

function issue(number: number, selected = true): ApiIssue {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://github.com/acme/app/issues/${number}`,
    severity: selected ? "critical" : "low",
    impact: selected ? "Customers blocked" : "Cosmetic",
    actionable: selected,
    selected,
    reason: selected ? "Blocking" : "Minor",
  };
}

function base(): AgentApiResponse {
  const issues = [issue(101), issue(102, false), issue(103), issue(105)];
  return {
    runId: "run-review",
    status: "success",
    issuesReviewed: issues.length,
    actionableIssues: 3,
    jiraTasksCreated: 3,
    jiraTasksFailed: 0,
    slackNotified: true,
    summary: "Reviewed 4 issues; created 3 Jira tasks; notified Slack.",
    plan: ["Retrieve open issues", "Create Jira tasks", "Notify team"],
    decision: { action: "continue", reason: "Needs GitHub, Jira and Slack." },
    repository: "acme/app",
    stages: { github: "success", analysis: "success", jira: "success", verification: "success", slack: "success" },
    issues,
    jiraTasks: [
      { sourceIssue: 101, summary: "Fix 101", priority: "Highest", status: "created", key: "FORGE-1", verification: "verified" },
      { sourceIssue: 103, summary: "Fix 103", priority: "Highest", status: "created", key: "FORGE-2", verification: "verified" },
      { sourceIssue: 105, summary: "Fix 105", priority: "High", status: "created", key: "FORGE-3", verification: "verified" },
    ],
    slack: { status: "sent", channel: "#eng", reason: "Tracked." },
    events: [
      event("request", "success", "Engineering request received.", 0),
      event("reasoning", "success", "Decision: continue.", 2),
      event("github", "success", "4 issues retrieved.", 5),
      event("analysis", "success", "3 actionable.", 9),
      event("jira", "success", "3 Jira tasks created.", 15),
      event("verification", "success", "3 verified.", 18),
      event("slack", "success", "Team notified.", 21),
      event("final", "success", "Workflow completed.", 22),
    ],
    errors: [],
    startedAt: T0,
    finishedAt: at(22),
    durationMs: 22000,
  };
}

/** 1 created, 1 unconfirmed, 1 failed → the server reports jiraTasksFailed: 2. */
function partialServerShaped(): AgentApiResponse {
  const response = base();
  return {
    ...response,
    status: "partial",
    jiraTasksCreated: 1,
    jiraTasksFailed: 2,
    stages: { ...response.stages, jira: "partial", verification: "partial" },
    jiraTasks: [
      response.jiraTasks[0],
      { sourceIssue: 103, summary: "Fix 103", priority: "Highest", status: "unconfirmed", verification: "not_checked" },
      { sourceIssue: 105, summary: "Fix 105", priority: "High", status: "failed", verification: "not_checked", message: "Rejected." },
    ],
    errors: [{ stage: "jira", code: "jira_create_failed", message: "1 of 3 Jira task(s) could not be created." }],
  };
}

/** Nothing failed: one task is unconfirmed, so the server still reports jiraTasksFailed: 1. */
function unconfirmedOnly(): AgentApiResponse {
  const response = base();
  return {
    ...response,
    status: "partial",
    actionableIssues: 1,
    jiraTasksCreated: 0,
    jiraTasksFailed: 1,
    slackNotified: false,
    stages: { ...response.stages, jira: "partial", verification: "skipped", slack: "skipped" },
    jiraTasks: [{ sourceIssue: 101, summary: "Fix 101", priority: "Highest", status: "unconfirmed", verification: "not_checked" }],
    slack: { status: "skipped" },
    errors: [{ stage: "jira", code: "jira_unconfirmed", message: "1 Jira task could not be confirmed." }],
  };
}

/** Every Jira create failed and Slack failed: nothing external exists, but actions were attempted. */
function allDownstreamFailed(): AgentApiResponse {
  const response = base();
  return {
    ...response,
    status: "partial",
    jiraTasksCreated: 0,
    jiraTasksFailed: 1,
    slackNotified: false,
    summary: "Jira: 1 of 1 Jira task(s) could not be created. Slack failed.",
    stages: { ...response.stages, jira: "failed", verification: "skipped", slack: "failed" },
    jiraTasks: [{ sourceIssue: 101, summary: "Fix 101", priority: "Highest", status: "failed", verification: "not_checked", message: "Rejected." }],
    slack: { status: "failed", message: "Slack rejected the message." },
    errors: [
      { stage: "jira", code: "jira_create_failed", message: "1 of 1 Jira task(s) could not be created." },
      { stage: "slack", code: "slack_failed", message: "Slack failed." },
    ],
  };
}

function failedAtGithub(): AgentApiResponse {
  return {
    ...base(),
    status: "failed",
    issuesReviewed: 0,
    actionableIssues: 0,
    jiraTasksCreated: 0,
    jiraTasksFailed: 0,
    slackNotified: false,
    summary: "GitHub issue retrieval failed.",
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

/** Nothing actionable; server-accurate: issuesReviewed equals the returned issues. */
function emptyServerShaped(): AgentApiResponse {
  const response = base();
  return {
    ...response,
    actionableIssues: 0,
    jiraTasksCreated: 0,
    slackNotified: false,
    stages: { github: "success", analysis: "success", jira: "skipped", verification: "skipped", slack: "skipped" },
    issues: response.issues.map((item) => ({ ...item, actionable: false, selected: false })),
    jiraTasks: [],
    slack: { status: "skipped", reason: "Nothing to report." },
  };
}

function twentyIssues(): AgentApiResponse {
  const issues = Array.from({ length: 20 }, (_, index) => issue(200 + index, index % 2 === 0));
  const selected = issues.filter((item) => item.selected);
  return {
    ...base(),
    issuesReviewed: issues.length,
    actionableIssues: selected.length,
    jiraTasksCreated: selected.length,
    issues,
    jiraTasks: selected.map((item, index) => ({
      sourceIssue: item.number,
      summary: `Fix ${item.number}`,
      priority: "High",
      status: "created",
      key: `OPS-${index + 1}`,
      verification: "verified",
    })),
  };
}

describe("jiraOutcomeCounts", () => {
  it("does not count unconfirmed tasks as failed (server jiraTasksFailed includes them)", () => {
    expect(jiraOutcomeCounts(toViewModel(partialServerShaped()))).toEqual({ created: 1, failed: 1, unconfirmed: 1 });
  });

  it("reports no failures when the only non-created task is unconfirmed", () => {
    expect(jiraOutcomeCounts(toViewModel(unconfirmedOnly()))).toEqual({ created: 0, failed: 0, unconfirmed: 1 });
  });

  it("never reports fewer failures than the failed rows returned", () => {
    const view = toViewModel({ ...partialServerShaped(), jiraTasksFailed: 1 });
    expect(jiraOutcomeCounts(view).failed).toBe(1);
  });

  it("falls back to the server counter when no rows were returned", () => {
    const view = toViewModel({ ...base(), status: "partial", jiraTasksCreated: 0, jiraTasksFailed: 2, jiraTasks: [] });
    expect(jiraOutcomeCounts(view)).toEqual({ created: 0, failed: 2, unconfirmed: 0 });
  });
});

describe("overviewMetrics — review cases", () => {
  it("Jira sub-labels do not double-count unconfirmed tasks", () => {
    const jira = overviewMetrics(toViewModel(partialServerShaped())).find((m) => m.key === "jira");
    expect(jira?.notes).toEqual([
      { text: "created", tone: "neutral" },
      { text: "1 failed", tone: "danger" },
      { text: "1 unconfirmed", tone: "warning" },
    ]);
  });

  it("shows no 'failed' note when only unconfirmed tasks exist", () => {
    const jira = overviewMetrics(toViewModel(unconfirmedOnly())).find((m) => m.key === "jira");
    expect(jira?.notes.map((note) => note.text)).toEqual(["created", "1 unconfirmed"]);
  });

  it("failed at GitHub: 00 counters are qualified as unmeasured, never 'scanned and found nothing'", () => {
    const metrics = overviewMetrics(toViewModel(failedAtGithub()));
    expect(metrics.map((m) => m.value)).toEqual(["00", "00", "00", "SKIPPED"]);
    expect(metrics[0].notes).toEqual([
      { text: "acme/app", tone: "neutral", mono: true },
      { text: "GitHub failed", tone: "danger", status: true },
    ]);
    expect(metrics[1].notes).toEqual([{ text: "Not run", tone: "neutral", status: true }]);
  });

  it("marks a skipped or unreached GitHub stage on the issues counter", () => {
    const response = { ...base(), stages: { ...base().stages, github: "skipped" as const, analysis: "skipped" as const } };
    const metrics = overviewMetrics(toViewModel(response));
    expect(metrics[0].notes.at(-1)).toEqual({ text: "Skipped", tone: "neutral", status: true });
    expect(metrics[1].notes).toEqual([{ text: "Skipped", tone: "neutral", status: true }]);
  });

  it("keeps the plain qualifiers when every stage ran", () => {
    const metrics = overviewMetrics(toViewModel(base()));
    expect(metrics[0].notes).toEqual([{ text: "acme/app", tone: "neutral", mono: true }]);
    expect(metrics[1].notes).toEqual([{ text: "need engineering action", tone: "neutral" }]);
  });

  it("empty run with server-accurate counters shows what was reviewed", () => {
    const metrics = overviewMetrics(toViewModel(emptyServerShaped()));
    expect(metrics.map((m) => m.value)).toEqual(["04", "00", "00", "SKIPPED"]);
  });

  it("pads and reports 20+ issues", () => {
    const metrics = overviewMetrics(toViewModel(twentyIssues()));
    expect(metrics.map((m) => m.value)).toEqual(["20", "10", "10", "SENT"]);
    expect(padMetric(20)).toBe("20");
  });
});

describe("joinIssueActions — size edge cases", () => {
  it("returns no rows for a run with 0 issues", () => {
    expect(joinIssueActions(toViewModel(failedAtGithub()))).toEqual([]);
  });

  it("keeps all 20 rows in the agent's order with their own keys", () => {
    const rows = joinIssueActions(toViewModel(twentyIssues()));
    expect(rows).toHaveLength(20);
    expect(rows.map((row) => row.issue.number)).toEqual(Array.from({ length: 20 }, (_, index) => 200 + index));
    expect(rows[0].action).toMatchObject({ kind: "key", key: "OPS-1" });
    expect(rows[1].action.kind).toBe("none");
    expect(rows[18].action).toMatchObject({ kind: "key", key: "OPS-10" });
  });
});

describe("downstreamLead — only when no downstream action was attempted", () => {
  it("is absent when Jira and Slack were attempted and failed, even though nothing external exists", () => {
    const view = toViewModel(allDownstreamFailed());
    expect(view.canSafelyRetry).toBe(true);
    expect(view.sideEffectsNote).toBeDefined();
    expect(downstreamLead(view)).toBeUndefined();
  });

  it("is absent when any Jira task row exists", () => {
    const view = toViewModel(failedAtGithub());
    const withRow = { ...view, jiraTasks: toViewModel(allDownstreamFailed()).jiraTasks };
    expect(downstreamLead(withRow)).toBeUndefined();
  });

  it("is present when the run failed before Jira / Slack", () => {
    expect(downstreamLead(toViewModel(failedAtGithub()))).toBe(NO_DOWNSTREAM_ACTIONS_TEXT);
  });
});

describe("errorTone", () => {
  it("is a warning only for a rejected request, danger for everything else", () => {
    expect(errorTone(describeApiError(400, { error: { code: "invalid_request", message: "bad" } }))).toBe("warning");
    expect(errorTone(describeApiError(503, { error: { code: "configuration_error", message: "x" } }))).toBe("danger");
    expect(errorTone(describeApiError(500, { error: { code: "internal_error", message: "x" } }))).toBe("danger");
    expect(errorTone(describeApiError(200, null))).toBe("danger");
    expect(errorTone(describeApiError(0, null))).toBe("danger");
  });
});

describe("runStatusChip — error branches", () => {
  it("a rejected request is 'Not accepted' (warning); an unreadable answer is an Error", () => {
    const validation = describeApiError(400, { error: { code: "invalid_request", message: "bad" } });
    expect(runStatusChip({ phase: "error", error: validation })).toEqual({ label: "Not accepted", tone: "warning" });
    expect(runStatusChip({ phase: "error", error: describeApiError(200, null) })).toEqual({ label: "Error", tone: "danger" });
  });
});

describe("buildWorkflow — review cases", () => {
  it("unreadable 2xx: the server accepted the request, so Request is Done and Result is Unreadable (not Error)", () => {
    const error = describeApiError(200, null);
    expect(error.kind).toBe("unreadable");
    const nodes = buildWorkflow({ phase: "error", error });
    expect(nodes[0]).toMatchObject({ key: "request", status: "done", statusLabel: "Done", tone: "success" });
    expect(nodes.slice(1, 7).every((n) => n.status === "unknown" && n.statusLabel === "Not reported")).toBe(true);
    expect(nodes[7]).toMatchObject({ key: "result", status: "unknown", statusLabel: "Unreadable", tone: "warning" });
    expect(nodes.some((n) => n.active || n.durationMs !== undefined)).toBe(false);
  });

  it("Result carries the total run time and says so; step nodes do not", () => {
    const nodes = buildWorkflow({ phase: "done", view: toViewModel(base()) });
    expect(nodes[7]).toMatchObject({ durationLabel: "22s", durationScope: "run" });
    expect(nodes.slice(0, 7).every((n) => n.durationScope === undefined)).toBe(true);
  });

  it("Result has no total when the run's timestamps are unreadable", () => {
    const nodes = buildWorkflow({ phase: "done", view: toViewModel({ ...base(), finishedAt: "not-a-date" }) });
    expect(nodes[7].durationMs).toBeUndefined();
    expect(nodes[7].durationScope).toBeUndefined();
  });

  it("unrecognised or missing stage values render as Not run", () => {
    const response = base();
    const stages = { github: "bogus", analysis: undefined, jira: "success" } as unknown as AgentApiResponse["stages"];
    const nodes = buildWorkflow({ phase: "done", view: toViewModel({ ...response, stages }) });
    const byKey = Object.fromEntries(nodes.map((n) => [n.key, n]));
    expect(byKey.github).toMatchObject({ status: "not_run", statusLabel: "Not run", tone: "neutral" });
    expect(byKey.analyze).toMatchObject({ status: "not_run", statusLabel: "Not run" });
    expect(byKey.verify).toMatchObject({ status: "not_run" });
    expect(byKey.jira).toMatchObject({ status: "done" });
    // Not-run nodes never show a duration, even when events exist for them.
    expect(byKey.github.durationMs).toBeUndefined();
  });

  it("ignores events with an unknown status instead of inventing an outcome", () => {
    const response = base();
    const events = [...response.events, { ...event("slack", "success", "x", 30), status: "exploded" }] as ApiEvent[];
    const view = toViewModel({ ...response, events });
    expect(view.timeline).toHaveLength(response.events.length);
    const nodes = buildWorkflow({ phase: "done", view });
    expect(nodes.find((n) => n.key === "slack")?.durationLabel).toBe("3.0s");
  });

  it("an event with no timestamp key gets no offset and its stage no duration", () => {
    const response = base();
    const { timestamp: _dropped, ...githubNoTime } = event("github", "success", "4 issues retrieved.", 5);
    void _dropped;
    const events = response.events.map((e) => (e.stage === "github" ? (githubNoTime as ApiEvent) : e));
    const view = toViewModel({ ...response, events });
    const github = view.timeline.find((e) => e.stage === "github");
    expect(github?.offsetLabel).toBeUndefined();
    expect(github?.timestamp).toBe("");
    const nodes = buildWorkflow({ phase: "done", view });
    expect(nodes.find((n) => n.key === "github")).toMatchObject({ status: "done" });
    expect(nodes.find((n) => n.key === "github")?.durationMs).toBeUndefined();
  });

  it("done phase: a request event with status error marks Request Failed", () => {
    const response = failedAtGithub();
    const events = [event("request", "error", "Request rejected.", 0)];
    const nodes = buildWorkflow({ phase: "done", view: toViewModel({ ...response, events }) });
    expect(nodes[0]).toMatchObject({ key: "request", status: "failed", statusLabel: "Failed", tone: "danger" });
    expect(nodes[0].durationLabel).toBe("0.0s");
  });
});

describe("promptCounter — state is never color alone", () => {
  it("names the warning and danger states; neutral has no note", () => {
    expect(promptCounter("fix the bug").note).toBeUndefined();
    expect(promptCounter("x".repeat(3600)).note).toBe("Approaching the limit");
    expect(promptCounter("x".repeat(MAX_MESSAGE_LENGTH + 1)).note).toBe("Over the limit");
  });
});
