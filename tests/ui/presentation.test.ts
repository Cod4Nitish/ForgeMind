import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_LENGTH, type AgentApiResponse, type ApiEvent } from "@/lib/api/contract";
import {
  DEFAULT_PROMPT,
  STATE_TEXT,
  canSafelyRetry,
  describeApiError,
  formatSeconds,
  parseAgentResponse,
  pendingPipeline,
  toViewModel,
  validatePrompt,
} from "@/lib/presentation";

/* Deterministic fixtures — the only place sample numbers may appear. */

const T0 = "2026-09-26T10:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

function event(stage: ApiEvent["stage"], status: ApiEvent["status"], summary: string, seconds: number, tool?: string): ApiEvent {
  return { type: "test", stage, status, summary, timestamp: at(seconds), ...(tool ? { tool } : {}) };
}

function successResponse(): AgentApiResponse {
  return {
    runId: "3f0c1a2b-0000-4000-8000-000000000001",
    status: "success",
    issuesReviewed: 5,
    actionableIssues: 3,
    jiraTasksCreated: 3,
    jiraTasksFailed: 0,
    slackNotified: true,
    summary:
      "Reviewed 5 open issues in acme/app: 3 actionable. Created 3 Jira tasks (FORGE-1, FORGE-2, FORGE-3). Engineering team notified in Slack.",
    intent: "Triage open GitHub issues and track critical/high bugs",
    plan: ["Retrieve open issues", "Assess severity", "Create Jira tasks", "Notify team"],
    decision: { action: "continue", reason: "The request needs GitHub, Jira and Slack actions." },
    repository: "acme/app",
    stages: { github: "success", analysis: "success", jira: "success", verification: "success", slack: "success" },
    issues: [
      {
        number: 101,
        title: "Payment processing fails",
        url: "https://github.com/acme/app/issues/101",
        severity: "critical",
        impact: "Customers cannot pay",
        actionable: true,
        selected: true,
        reason: "Revenue-blocking failure",
      },
      {
        number: 102,
        title: "Button alignment issue",
        url: "https://github.com/acme/app/issues/102",
        severity: "low",
        impact: "Cosmetic",
        actionable: false,
        selected: false,
        reason: "Minor visual defect",
      },
    ],
    jiraTasks: [
      { sourceIssue: 101, summary: "Fix payment processing failure", priority: "Highest", status: "created", key: "FORGE-1", verification: "verified" },
      { sourceIssue: 103, summary: "Fix authentication bypass", priority: "Highest", status: "created", key: "FORGE-2", verification: "verified" },
      { sourceIssue: 105, summary: "Fix database timeout", priority: "High", status: "created", key: "FORGE-3", verification: "unverified" },
    ],
    slack: { status: "sent", channel: "#forgemind-demo", reason: "High-impact issues were tracked in Jira." },
    events: [
      event("request", "success", "Engineering request received.", 0),
      event("reasoning", "success", "Decision: continue with GitHub, Jira and Slack.", 2),
      event("github", "running", "Retrieving open GitHub issues.", 3, "github.issue.get1"),
      event("github", "success", "5 open GitHub issues retrieved.", 5, "github.issue.get1"),
      event("analysis", "success", "3 actionable issues selected.", 15),
      event("jira", "success", "3 Jira tasks created.", 25, "jira.issue.create"),
      event("verification", "success", "3 Jira tasks verified.", 30),
      event("slack", "success", "Engineering team notified.", 38, "slack.chat.postMessage"),
      event("final", "success", "Workflow completed.", 41),
    ],
    errors: [],
    startedAt: T0,
    finishedAt: at(41),
    durationMs: 41000,
  };
}

function partialJiraResponse(): AgentApiResponse {
  const base = successResponse();
  return {
    ...base,
    status: "partial",
    jiraTasksCreated: 2,
    jiraTasksFailed: 1,
    stages: { ...base.stages, jira: "partial", verification: "partial" },
    jiraTasks: [
      base.jiraTasks[0],
      base.jiraTasks[1],
      {
        sourceIssue: 105,
        summary: "Fix database timeout",
        priority: "High",
        status: "failed",
        key: "SHOULD-NOT-SHOW",
        verification: "not_checked",
        message: "Jira rejected the request.",
      },
    ],
    events: [
      ...base.events.filter((e) => e.stage !== "jira"),
      event("jira", "success", "Jira task FORGE-1 created.", 22, "jira.issue.create"),
      event("jira", "warning", "1 of 3 Jira tasks failed.", 26, "jira.issue.create"),
    ],
    errors: [{ stage: "jira", code: "jira_create_failed", message: "1 Jira task could not be created." }],
    summary: "3 actionable issues. Created 2 Jira tasks; 1 failed. Engineering team notified.",
  };
}

function partialSlackResponse(): AgentApiResponse {
  const base = successResponse();
  return {
    ...base,
    status: "partial",
    slackNotified: false,
    stages: { ...base.stages, slack: "failed" },
    slack: { status: "failed", channel: "#forgemind-demo", message: "Slack notification could not be sent." },
    errors: [{ stage: "slack", code: "slack_failed", message: "Slack notification could not be sent." }],
  };
}

function failedGithubResponse(): AgentApiResponse {
  return {
    runId: "run-failed-github",
    status: "failed",
    issuesReviewed: 0,
    actionableIssues: 0,
    jiraTasksCreated: 0,
    jiraTasksFailed: 0,
    slackNotified: false,
    summary: "GitHub issue retrieval failed. No downstream actions were performed.",
    plan: ["Retrieve open issues"],
    decision: { action: "continue", reason: "The request needs GitHub." },
    repository: "acme/app",
    stages: { github: "failed", analysis: "not_run", jira: "not_run", verification: "not_run", slack: "not_run" },
    issues: [],
    jiraTasks: [],
    slack: { status: "skipped", reason: "No issues were retrieved." },
    events: [
      event("request", "success", "Engineering request received.", 0),
      event("github", "error", "GitHub could not be reached.", 4, "github.issue.get1"),
    ],
    errors: [{ stage: "github", code: "github_unavailable_secret_code", message: "GitHub issues could not be retrieved." }],
    startedAt: T0,
    finishedAt: at(5),
    durationMs: 5400,
  };
}

function noActionableResponse(): AgentApiResponse {
  const base = successResponse();
  return {
    ...base,
    issuesReviewed: 2,
    actionableIssues: 0,
    jiraTasksCreated: 0,
    slackNotified: false,
    stages: { github: "success", analysis: "success", jira: "skipped", verification: "skipped", slack: "skipped" },
    issues: base.issues.map((issue) => ({ ...issue, actionable: false, selected: false })),
    jiraTasks: [],
    slack: { status: "skipped", reason: "No high-impact issues to report." },
    events: [
      event("request", "success", "Engineering request received.", 0),
      event("github", "success", "2 open GitHub issues retrieved.", 4, "github.issue.get1"),
      event("analysis", "success", "No actionable issues.", 10),
      event("jira", "skipped", "Skipped — no actionable issues.", 10),
      event("slack", "skipped", "Skipped — nothing to report.", 10),
    ],
  };
}

function informationalResponse(): AgentApiResponse {
  return {
    runId: "run-info",
    status: "success",
    issuesReviewed: 0,
    actionableIssues: 0,
    jiraTasksCreated: 0,
    jiraTasksFailed: 0,
    slackNotified: false,
    summary: "ForgeMind triages GitHub issues, tracks work in Jira and notifies Slack.",
    intent: "Explain ForgeMind",
    plan: ["Explain capabilities"],
    decision: { action: "finish", reason: "No tools needed." },
    stages: { github: "not_run", analysis: "not_run", jira: "not_run", verification: "not_run", slack: "not_run" },
    issues: [],
    jiraTasks: [],
    slack: { status: "skipped" },
    events: [
      event("request", "success", "Engineering request received.", 0),
      event("reasoning", "success", "Decision: finish — no tools needed.", 3),
      event("final", "success", "Answered without external tools.", 4),
    ],
    errors: [],
    startedAt: T0,
    finishedAt: at(4),
    durationMs: 4000,
  };
}

describe("STATE_TEXT", () => {
  it("uses the exact required wording", () => {
    expect(STATE_TEXT).toEqual({
      idle: "Ready for an engineering request.",
      running: "Agent executing...",
      success: "Workflow completed.",
      partial: "Workflow completed with some external actions failed.",
      failed: "ForgeMind could not complete the workflow.",
      empty: "No actionable issues found.",
    });
  });

  it("exposes the default demo prompt", () => {
    expect(DEFAULT_PROMPT).toBe(
      "Check the latest open GitHub issues, identify critical/high-priority bugs, create Jira tasks for the actionable ones, and notify the engineering team on Slack.",
    );
  });
});

describe("toViewModel — success", () => {
  const view = toViewModel(successResponse());

  it("maps status, headline and counters from the response", () => {
    expect(view.status).toBe("success");
    expect(view.statusLabel).toBe("Complete");
    expect(view.tone).toBe("success");
    expect(view.headline).toBe("ForgeMind complete");
    expect(view.stateText).toBe(STATE_TEXT.success);
    expect(view.isEmpty).toBe(false);
    expect(view.metrics).toEqual({
      issuesReviewed: 5,
      actionableIssues: 3,
      jiraTasksCreated: 3,
      jiraTasksFailed: 0,
      jiraTasksUnconfirmed: 0,
      slackLabel: "Sent",
      slackTone: "success",
    });
    expect(view.summary).toContain("Created 3 Jira tasks");
    expect(view.durationLabel).toBe("41s");
    expect(view.repository).toBe("acme/app");
  });

  it("builds the six-stage pipeline from `stages`, with details from real events", () => {
    expect(view.stages.map((s) => [s.key, s.status, s.statusLabel])).toEqual([
      ["reasoning", "success", "Completed"],
      ["github", "success", "Completed"],
      ["analysis", "success", "Completed"],
      ["jira", "success", "Completed"],
      ["verification", "success", "Completed"],
      ["slack", "success", "Completed"],
    ]);
    const github = view.stages.find((s) => s.key === "github");
    expect(github?.detail).toBe("5 open GitHub issues retrieved.");
  });

  it("renders the real event log in order with labels, tools and offsets", () => {
    expect(view.timeline).toHaveLength(9);
    expect(view.timeline[0]).toMatchObject({ stageLabel: "Request", statusLabel: "Done", offsetLabel: "+0.0s" });
    expect(view.timeline[2]).toMatchObject({ stageLabel: "GitHub", statusLabel: "Started", tone: "info", tool: "github.issue.get1" });
    expect(view.timeline[3]).toMatchObject({ offsetLabel: "+5.0s", timestamp: at(5) });
    expect(view.timeline.at(-1)?.offsetLabel).toBe("+41s");
  });

  it("maps issues, Jira tasks and Slack", () => {
    expect(view.issues[0]).toMatchObject({
      number: 101,
      title: "Payment processing fails",
      url: "https://github.com/acme/app/issues/101",
      severityLabel: "Critical",
      severityTone: "danger",
      decisionLabel: "Selected",
      reason: "Revenue-blocking failure",
    });
    expect(view.issues[1]).toMatchObject({ severityLabel: "Low", decisionLabel: "Not actionable", decisionTone: "neutral" });
    expect(view.jiraTasks.map((t) => t.key)).toEqual(["FORGE-1", "FORGE-2", "FORGE-3"]);
    expect(view.jiraTasks[0]).toMatchObject({ statusLabel: "Created", verificationLabel: "Verified", priority: "Highest" });
    expect(view.jiraTasks[2]).toMatchObject({ verificationLabel: "Not verified", verificationTone: "warning" });
    expect(view.slack).toMatchObject({ status: "sent", headline: "Engineering team notified", channel: "#forgemind-demo" });
    expect(view.slack.jiraNote).toBeUndefined();
  });

  it("exposes intent, plan and decision as public summaries", () => {
    expect(view.intent).toBe("Triage open GitHub issues and track critical/high bugs");
    expect(view.plan).toHaveLength(4);
    expect(view.decision).toEqual({ actionLabel: "Continue", reason: "The request needs GitHub, Jira and Slack actions." });
  });

  it("is not safely retryable once external actions happened, but shows no warning for success", () => {
    expect(view.canSafelyRetry).toBe(false);
    expect(view.showRetry).toBe(false);
    expect(view.retryNote).toBeUndefined();
    expect(view.sideEffectsNote).toBeUndefined();
  });
});

describe("toViewModel — partial with a failed Jira task", () => {
  const view = toViewModel(partialJiraResponse());

  it("is visibly partial, never success", () => {
    expect(view.status).toBe("partial");
    expect(view.statusLabel).toBe("Partial");
    expect(view.tone).toBe("warning");
    expect(view.headline).toBe("ForgeMind partially complete");
    expect(view.stateText).toBe(STATE_TEXT.partial);
  });

  it("marks the failed row explicitly and shows only actual keys", () => {
    expect(view.jiraTasks.map((t) => t.key)).toEqual(["FORGE-1", "FORGE-2", undefined]);
    expect(view.jiraTasks[2]).toMatchObject({
      status: "failed",
      statusLabel: "Failed",
      tone: "danger",
      title: "Task creation failed for #105",
      message: "Jira rejected the request.",
    });
    expect(view.metrics.jiraTasksCreated).toBe(2);
    expect(view.metrics.jiraTasksFailed).toBe(1);
  });

  it("reports the partial Jira stage with its warning event as detail", () => {
    const jira = view.stages.find((s) => s.key === "jira");
    expect(jira).toMatchObject({ status: "partial", statusLabel: "Partial", tone: "warning", detail: "1 of 3 Jira tasks failed." });
  });

  it("surfaces safe error messages without internal codes", () => {
    expect(view.errors).toEqual([{ id: "0-jira", stageLabel: "Jira", message: "1 Jira task could not be created." }]);
    expect(JSON.stringify(view)).not.toContain("jira_create_failed");
  });

  it("blocks Retry and warns about duplicates", () => {
    expect(view.canSafelyRetry).toBe(false);
    expect(view.showRetry).toBe(false);
    expect(view.retryNote).toMatch(/duplicate/i);
  });
});

describe("toViewModel — partial with Slack failure", () => {
  const view = toViewModel(partialSlackResponse());

  it("shows the Slack failure and that created Jira tasks remain", () => {
    expect(view.stateText).toBe(STATE_TEXT.partial);
    expect(view.slack).toMatchObject({
      status: "failed",
      statusLabel: "Failed",
      tone: "danger",
      headline: "Notification failed",
      message: "Slack notification could not be sent.",
    });
    expect(view.slack.channel).toBeUndefined();
    expect(view.slack.jiraNote).toMatch(/remain created/);
    expect(view.metrics.slackLabel).toBe("Failed");
    expect(view.stages.find((s) => s.key === "slack")?.status).toBe("failed");
  });

  it("is not retryable because Jira tasks were created", () => {
    expect(view.canSafelyRetry).toBe(false);
    expect(view.showRetry).toBe(false);
    expect(view.retryNote).toBeDefined();
  });
});

describe("toViewModel — failed at GitHub", () => {
  const view = toViewModel(failedGithubResponse());

  it("is failed with the required text and honest downstream stages", () => {
    expect(view.status).toBe("failed");
    expect(view.headline).toBe("ForgeMind failed");
    expect(view.stateText).toBe(STATE_TEXT.failed);
    expect(view.stages.map((s) => s.status)).toEqual(["success", "failed", "not_run", "not_run", "not_run", "not_run"]);
    expect(view.stages[1]).toMatchObject({ statusLabel: "Failed", tone: "danger", detail: "GitHub could not be reached." });
    expect(view.stages[2]).toMatchObject({ statusLabel: "Not run", tone: "neutral" });
    expect(view.stages[2].detail).toBeUndefined();
  });

  it("explains the empty issue list and lists safe errors only", () => {
    expect(view.issues).toEqual([]);
    expect(view.issuesEmptyText).toBe("GitHub issues could not be retrieved.");
    expect(view.jiraEmptyText).toBe("Jira was not used in this run.");
    expect(view.errors).toEqual([{ id: "0-github", stageLabel: "GitHub", message: "GitHub issues could not be retrieved." }]);
    expect(JSON.stringify(view)).not.toContain("secret_code");
  });

  it("allows Retry because no external mutation happened", () => {
    expect(view.canSafelyRetry).toBe(true);
    expect(view.showRetry).toBe(true);
    expect(view.retryNote).toBeUndefined();
    expect(view.sideEffectsNote).toBe("No Jira tasks were created and no Slack notification was sent.");
    expect(view.durationLabel).toBe("5.4s");
  });
});

describe("toViewModel — no actionable issues (empty)", () => {
  const view = toViewModel(noActionableResponse());

  it("uses the empty state text for a successful run with nothing actionable", () => {
    expect(view.status).toBe("success");
    expect(view.isEmpty).toBe(true);
    expect(view.stateText).toBe(STATE_TEXT.empty);
    expect(view.headline).toBe("ForgeMind complete");
  });

  it("shows why skipped stages were skipped, from the agent's own events", () => {
    const jira = view.stages.find((s) => s.key === "jira");
    expect(jira).toMatchObject({ status: "skipped", statusLabel: "Skipped", detail: "Skipped — no actionable issues." });
    expect(view.stages.find((s) => s.key === "verification")).toMatchObject({ status: "skipped" });
    expect(view.jiraEmptyText).toBe("Skipped — no actionable issues.");
    expect(view.slack).toMatchObject({ status: "skipped", headline: "Notification skipped", reason: "No high-impact issues to report." });
    expect(view.issues.every((issue) => issue.decisionLabel === "Not actionable")).toBe(true);
  });

  it("is safe to retry but offers no Retry on success", () => {
    expect(view.canSafelyRetry).toBe(true);
    expect(view.showRetry).toBe(false);
  });
});

describe("toViewModel — informational finish run with no tools", () => {
  const view = toViewModel(informationalResponse());

  it("completes without claiming an issue triage happened", () => {
    expect(view.status).toBe("success");
    expect(view.isEmpty).toBe(false);
    expect(view.stateText).toBe(STATE_TEXT.success);
    expect(view.decision).toEqual({ actionLabel: "Finish", reason: "No tools needed." });
  });

  it("reports tool stages as not run", () => {
    expect(view.stages.map((s) => [s.key, s.status])).toEqual([
      ["reasoning", "success"],
      ["github", "not_run"],
      ["analysis", "not_run"],
      ["jira", "not_run"],
      ["verification", "not_run"],
      ["slack", "not_run"],
    ]);
    expect(view.stages[0].detail).toBe("Decision: finish — no tools needed.");
    expect(view.issuesEmptyText).toBe("GitHub was not queried for this request.");
    expect(view.jiraEmptyText).toBe("Jira was not used in this run.");
    expect(view.slack.headline).toBe("Notification skipped");
    expect(view.canSafelyRetry).toBe(true);
  });
});

describe("retry safety", () => {
  it("treats an unconfirmed Jira task as a possible mutation", () => {
    const response: AgentApiResponse = {
      ...failedGithubResponse(),
      status: "partial",
      stages: { github: "success", analysis: "success", jira: "partial", verification: "not_run", slack: "skipped" },
      jiraTasks: [
        { sourceIssue: 101, summary: "Fix payment", priority: "Highest", status: "unconfirmed", key: "MAYBE-1", verification: "not_checked" },
      ],
    };
    const view = toViewModel(response);
    expect(canSafelyRetry(response)).toBe(false);
    expect(view.canSafelyRetry).toBe(false);
    expect(view.showRetry).toBe(false);
    expect(view.retryNote).toMatch(/duplicate/i);
    expect(view.metrics.jiraTasksUnconfirmed).toBe(1);
    expect(view.jiraTasks[0]).toMatchObject({ status: "unconfirmed", statusLabel: "Unconfirmed", tone: "warning" });
    expect(view.jiraTasks[0].key).toBeUndefined();
    expect(view.jiraTasks[0].message).toMatch(/check Jira/i);
  });

  it("is unsafe when Slack was notified even with no Jira tasks", () => {
    expect(canSafelyRetry({ ...failedGithubResponse(), slackNotified: true })).toBe(false);
    expect(canSafelyRetry({ ...failedGithubResponse(), slack: { status: "sent" } })).toBe(false);
  });

  it("is unsafe when any Jira task was created", () => {
    expect(canSafelyRetry({ ...failedGithubResponse(), jiraTasksCreated: 1 })).toBe(false);
  });

  it("is safe only when nothing external happened", () => {
    expect(canSafelyRetry(failedGithubResponse())).toBe(true);
  });
});

describe("untrusted and malformed content", () => {
  it("drops non-http(s) issue URLs and normalizes whitespace in titles", () => {
    const base = successResponse();
    const view = toViewModel({
      ...base,
      issues: [{ ...base.issues[0], url: "javascript:alert(1)", title: "  <img src=x onerror=alert(1)>\n\n  Pay  " }],
    });
    expect(view.issues[0].url).toBeUndefined();
    expect(view.issues[0].title).toBe("<img src=x onerror=alert(1)> Pay");
  });

  it("ignores malformed events instead of crashing", () => {
    const base = successResponse();
    const view = toViewModel({
      ...base,
      events: [
        base.events[0],
        { type: "x", stage: "unknown", status: "success", summary: "bad", timestamp: T0 } as unknown as ApiEvent,
        null as unknown as ApiEvent,
      ],
    });
    expect(view.timeline).toHaveLength(1);
  });
});

describe("parseAgentResponse", () => {
  it("accepts a contract-shaped body", () => {
    expect(parseAgentResponse(successResponse())).not.toBeNull();
  });

  it.each([
    ["null", null],
    ["a string", "ok"],
    ["an unknown status", { ...successResponse(), status: "completed" }],
    ["missing arrays", { ...successResponse(), events: undefined }],
    ["missing stages", { ...successResponse(), stages: null }],
  ])("rejects %s", (_label, body) => {
    expect(parseAgentResponse(body)).toBeNull();
  });
});

describe("pendingPipeline", () => {
  it("lists all six stages as pending, in order", () => {
    const stages = pendingPipeline();
    expect(stages.map((s) => s.label)).toEqual(["Reasoning", "GitHub", "Analysis", "Jira", "Verification", "Slack"]);
    expect(stages.every((s) => s.status === "pending" && s.statusLabel === "Pending" && s.detail === undefined)).toBe(true);
  });
});

describe("formatSeconds", () => {
  it.each([
    [0, "0.0s"],
    [5400, "5.4s"],
    [41000, "41s"],
    [65000, "1m 05s"],
    [-10, "0.0s"],
  ])("formats %d ms as %s", (ms, label) => {
    expect(formatSeconds(ms)).toBe(label);
  });
});

describe("describeApiError", () => {
  it.each([
    [400, "invalid_request", "message must be a non-empty string."],
    [400, "invalid_json", "Request body must be valid JSON."],
    [413, "payload_too_large", "Request body must be at most 16384 bytes."],
    [415, "unsupported_media_type", "Content-Type must be application/json."],
  ])("uses the server's safe message for %d %s", (status, code, message) => {
    const view = describeApiError(status, { error: { code, message } });
    expect(view).toMatchObject({ kind: "validation", message, canSafelyRetry: true, showRetry: false });
  });

  it("maps configuration_error to fixed copy and allows Retry", () => {
    const view = describeApiError(503, {
      error: { code: "configuration_error", message: "ANTHROPIC_API_KEY missing" },
      runId: "abc-123",
    });
    expect(view).toMatchObject({
      kind: "configuration",
      message: "ForgeMind is not fully configured on the server.",
      runId: "abc-123",
      canSafelyRetry: true,
      showRetry: true,
    });
    expect(JSON.stringify(view)).not.toContain("ANTHROPIC");
  });

  it("maps internal_error to fixed copy, never the raw server text, and blocks Retry", () => {
    const view = describeApiError(500, {
      error: { code: "internal_error", message: "TypeError: x is undefined\n    at run (agent/run.ts:12)" },
    });
    expect(view).toMatchObject({
      kind: "internal",
      message: "ForgeMind could not complete the workflow.",
      canSafelyRetry: false,
      showRetry: false,
    });
    expect(view.note).toMatch(/duplicate/i);
    expect(JSON.stringify(view)).not.toContain("TypeError");
  });

  it.each([
    ["a network failure", 0, null],
    ["an HTML gateway error", 502, "<html>Bad gateway</html>"],
    ["an unknown error code", 418, { error: { code: "teapot", message: "I am a teapot" } }],
  ])("maps %s to 'could not be reached'", (_label, status, body) => {
    const view = describeApiError(status, body);
    expect(view).toMatchObject({ kind: "network", message: "ForgeMind could not be reached.", showRetry: false });
    expect(JSON.stringify(view)).not.toContain("teapot");
  });

  it("treats an unreadable 200 body as a possibly-completed run", () => {
    const view = describeApiError(200, { unexpected: true });
    expect(view).toMatchObject({ kind: "unreadable", canSafelyRetry: false, showRetry: false });
  });

  it("falls back to the run-id header and drops unsafe run ids", () => {
    expect(describeApiError(500, { error: { code: "internal_error", message: "x" } }, "hdr-1").runId).toBe("hdr-1");
    expect(describeApiError(500, { error: { code: "internal_error", message: "x" } }, "<script>").runId).toBeUndefined();
  });

  it("caps long validation messages", () => {
    const view = describeApiError(400, { error: { code: "invalid_request", message: "x".repeat(1000) } });
    expect(view.message.length).toBeLessThanOrEqual(300);
  });
});

describe("validatePrompt", () => {
  it.each([
    ["", "empty"],
    ["   \n\t ", "empty"],
    ["fix bug", "too_short"],
    ["x".repeat(MAX_MESSAGE_LENGTH + 1), "too_long"],
  ])("rejects %j as %s", (text, reason) => {
    const result = validatePrompt(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(reason);
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("accepts the boundaries and trims", () => {
    expect(validatePrompt("  fix bugs  ")).toEqual({ ok: true, message: "fix bugs" });
    expect(validatePrompt("x".repeat(MAX_MESSAGE_LENGTH)).ok).toBe(true);
    expect(validatePrompt(`  ${"x".repeat(MAX_MESSAGE_LENGTH)}  `).ok).toBe(true);
    expect(validatePrompt(DEFAULT_PROMPT).ok).toBe(true);
  });

  it("reports the current length for over-long input", () => {
    const result = validatePrompt("x".repeat(4321));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("4,321");
  });
});
