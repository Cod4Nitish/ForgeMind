import { describe, expect, it } from "vitest";
import type { AgentApiResponse, AgentStreamMessage, ApiEvent } from "@/lib/api/contract";
import {
  EMPTY_PROGRESS,
  EXAMPLE_PROMPTS,
  NOT_REQUIRED_TEXT,
  applyStreamMessage,
  buildWorkflow,
  latestActivity,
  outcomeLines,
  parseStreamLine,
  toViewModel,
  type LiveProgress,
} from "@/lib/presentation";

const T0 = "2026-09-26T10:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

function ev(stage: ApiEvent["stage"], status: ApiEvent["status"], summary: string, type = "analysis_completed"): ApiEvent {
  return { type, stage, status, summary, timestamp: T0 };
}

function play(messages: AgentStreamMessage[]): LiveProgress {
  return messages.reduce(applyStreamMessage, EMPTY_PROGRESS);
}

const nodes = (progress: LiveProgress) => buildWorkflow({ phase: "running", progress });
const statusOf = (progress: LiveProgress) => Object.fromEntries(nodes(progress).map((n) => [n.key, n.status]));

describe("live workflow from the progress stream", () => {
  it("before the server confirms the run, only Request is in flight", () => {
    const list = nodes(EMPTY_PROGRESS);
    expect(list[0]).toMatchObject({ key: "request", status: "running" });
    expect(list.slice(1).every((n) => n.status === "waiting")).toBe(true);
  });

  it("marks exactly the stage the agent started as Running, with what it is doing", () => {
    const progress = play([
      { type: "run_started", runId: "r" },
      { type: "event", event: ev("request", "success", "Engineering request received.", "request_received") },
      { type: "stage_started", stage: "reasoning" },
    ]);
    const list = nodes(progress);
    expect(list.find((n) => n.key === "request")).toMatchObject({ status: "done", statusLabel: "Complete" });
    expect(list.find((n) => n.key === "reason")).toMatchObject({ status: "running", active: true });
    expect(list.find((n) => n.key === "reason")?.detail).toBe("Understanding and planning the request");
    expect(list.filter((n) => n.active)).toHaveLength(1);
    expect(list.slice(2).every((n) => n.status === "waiting" && n.detail === undefined)).toBe(true);
    expect(list.some((n) => n.durationMs !== undefined)).toBe(false);
  });

  it("completes a stage only from its own events and shows its real outcome line", () => {
    const progress = play([
      { type: "run_started", runId: "r" },
      { type: "stage_started", stage: "reasoning" },
      { type: "event", event: ev("reasoning", "success", "Plan prepared (4 step(s)); tools: github, jira.") },
      { type: "event", event: ev("reasoning", "success", "Decision: continue.", "decision_made") },
      { type: "stage_started", stage: "github" },
    ]);
    const list = nodes(progress);
    expect(list.find((n) => n.key === "reason")).toMatchObject({
      status: "done",
      detail: "Plan prepared (4 step(s)); tools: github, jira.",
    });
    expect(list.find((n) => n.key === "github")).toMatchObject({ status: "running", active: true });
  });

  it("never claims completion for a started stage that reported nothing", () => {
    const progress = play([
      { type: "run_started", runId: "r" },
      { type: "stage_started", stage: "reasoning" },
      { type: "stage_started", stage: "github" },
    ]);
    expect(statusOf(progress).reason).toBe("waiting");
  });

  it("shows skipped and failed stages from their events while later stages run", () => {
    const progress = play([
      { type: "run_started", runId: "r" },
      { type: "stage_started", stage: "analysis" },
      { type: "event", event: ev("analysis", "success", "5 issue(s) analyzed; 0 actionable.") },
      { type: "event", event: ev("jira", "skipped", "Jira skipped: no actionable issues.", "step_skipped") },
      { type: "event", event: ev("github", "error", "GitHub could not be reached.", "tool_failed") },
    ]);
    const list = nodes(progress);
    expect(list.find((n) => n.key === "analyze")?.status).toBe("running");
    expect(list.find((n) => n.key === "jira")).toMatchObject({ status: "skipped", detail: "Jira skipped: no actionable issues." });
    expect(list.find((n) => n.key === "github")).toMatchObject({ status: "failed", tone: "danger" });
  });

  it("ignores a repeated start of the stage already running", () => {
    const progress = play([
      { type: "stage_started", stage: "reasoning" },
      { type: "stage_started", stage: "reasoning" },
      { type: "stage_started", stage: "reasoning" },
    ]);
    expect(progress.stages).toEqual(["reasoning"]);
  });

  it("reports the latest real event summary, or nothing", () => {
    expect(latestActivity(undefined)).toBeUndefined();
    expect(latestActivity(EMPTY_PROGRESS)).toBeUndefined();
    expect(latestActivity(play([{ type: "event", event: ev("github", "success", "5 open GitHub issues retrieved.") }]))).toBe(
      "5 open GitHub issues retrieved.",
    );
  });
});

describe("parseStreamLine", () => {
  it("accepts well-formed messages", () => {
    expect(parseStreamLine('{"type":"run_started","runId":"abc"}')).toEqual({ type: "run_started", runId: "abc" });
    expect(parseStreamLine('{"type":"stage_started","stage":"github"}')).toEqual({ type: "stage_started", stage: "github" });
    const event = ev("github", "success", "ok");
    expect(parseStreamLine(JSON.stringify({ type: "event", event }))).toEqual({ type: "event", event });
  });

  it("rejects garbage, unknown stages and malformed events", () => {
    expect(parseStreamLine("not json")).toBeNull();
    expect(parseStreamLine("[]")).toBeNull();
    expect(parseStreamLine('{"type":"stage_started","stage":"deploy"}')).toBeNull();
    expect(parseStreamLine('{"type":"event","event":{"stage":"github"}}')).toBeNull();
    expect(parseStreamLine('{"type":"result","result":{"nope":true}}')).toBeNull();
    expect(parseStreamLine('{"type":"surprise"}')).toBeNull();
  });

  it("never passes server error text through", () => {
    expect(parseStreamLine('{"type":"error","error":{"code":"x","message":"stack trace here"},"runId":"r1"}')).toEqual({
      type: "error",
      error: { code: "internal_error", message: "Agent workflow failed." },
      runId: "r1",
    });
  });
});

function emptyRun(): AgentApiResponse {
  return {
    runId: "run-empty",
    status: "success",
    issuesReviewed: 4,
    actionableIssues: 0,
    jiraTasksCreated: 0,
    jiraTasksFailed: 0,
    slackNotified: false,
    summary: "Reviewed 4 issues; nothing actionable.",
    plan: [],
    stages: { github: "success", analysis: "success", jira: "skipped", verification: "skipped", slack: "not_run" },
    issues: [],
    jiraTasks: [],
    slack: { status: "skipped" },
    events: [
      ev("request", "success", "Engineering request received.", "request_received"),
      { ...ev("github", "success", "4 open GitHub issues retrieved.", "tool_completed"), timestamp: at(2) },
      { ...ev("analysis", "success", "4 issue(s) analyzed; 0 actionable."), timestamp: at(4) },
      { ...ev("jira", "skipped", "Jira skipped: nothing actionable.", "step_skipped"), timestamp: at(4) },
    ],
    errors: [],
    startedAt: T0,
    finishedAt: at(5),
    durationMs: 5000,
  };
}

describe("finished workflow details", () => {
  it("uses each stage's own outcome line and explains bypassed stages", () => {
    const list = buildWorkflow({ phase: "done", view: toViewModel(emptyRun()) });
    const byKey = Object.fromEntries(list.map((n) => [n.key, n]));
    expect(byKey.github.detail).toBe("4 open GitHub issues retrieved.");
    expect(byKey.jira).toMatchObject({ status: "skipped", detail: "Jira skipped: nothing actionable." });
    expect(byKey.verify).toMatchObject({ status: "skipped", detail: NOT_REQUIRED_TEXT });
    expect(byKey.slack).toMatchObject({ status: "not_run", detail: NOT_REQUIRED_TEXT });
  });
});

describe("outcomeLines", () => {
  it("states only what the counters and stages report", () => {
    expect(outcomeLines(toViewModel(emptyRun())).map((l) => l.text)).toEqual([
      "Reviewed 4 open issues",
      "Nothing required engineering action",
    ]);
  });
});

describe("EXAMPLE_PROMPTS", () => {
  it("offers five distinct, valid example requests", () => {
    expect(EXAMPLE_PROMPTS).toHaveLength(5);
    expect(new Set(EXAMPLE_PROMPTS.map((e) => e.prompt)).size).toBe(5);
    expect(EXAMPLE_PROMPTS.every((e) => e.prompt.length > 20 && e.tools.includes("github"))).toBe(true);
  });
});
