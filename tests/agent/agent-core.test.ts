import { describe, expect, it } from "vitest";
import {
  routeAfterActionability,
  routeAfterAnalysis,
  routeAfterDecision,
  routeAfterGitHub,
  routeAfterNotification,
  routeAfterPlan,
  routeAfterUnderstand,
} from "@/agent/routing";
import { runForgeMind } from "@/agent/run";
import type { ForgeMindStateValue } from "@/agent/state";
import { FakeModel } from "../helpers/fake-model";
import { DEMO_GITHUB_ISSUES, makeDeps } from "../helpers/fixtures";
import { MockSwytchExecutor } from "../helpers/mock-executor";
import { demoAssessments } from "../helpers/scenario";

const state = (overrides: Partial<ForgeMindStateValue> = {}): ForgeMindStateValue =>
  ({ runId: "r", userRequest: "x", events: [], errors: [], ...overrides }) as ForgeMindStateValue;

const tools = (github: boolean, jira = false, slack = false) => ({
  steps: ["s"],
  requiredTools: { github, jira, slack },
});

describe("routing", () => {
  it("stops at finalize when a reasoning stage produced nothing", () => {
    expect(routeAfterUnderstand(state())).toBe("finalize");
    expect(routeAfterUnderstand(state({ understanding: { intent: "i", requestedActions: [] } }))).toBe("plan");
    expect(routeAfterPlan(state())).toBe("finalize");
    expect(routeAfterPlan(state({ requestPlan: tools(true) }))).toBe("decision");
  });

  it("continues only when the decision and the tool plan agree", () => {
    const decision = (action: "continue" | "finish") => ({ action, reason: "r" });
    expect(routeAfterDecision(state({ workflowDecision: decision("continue"), requestPlan: tools(true) }))).toBe("continue");
    expect(routeAfterDecision(state({ workflowDecision: decision("continue"), requestPlan: tools(false) }))).toBe("finish");
    expect(routeAfterDecision(state({ workflowDecision: decision("finish"), requestPlan: tools(true) }))).toBe("finish");
    expect(routeAfterDecision(state())).toBe("finish");
  });

  it("routes on the GitHub result", () => {
    const run = (status: "success" | "failed") => ({ status, issueCount: 0, skippedCount: 0 });
    expect(routeAfterGitHub(state({ githubRun: run("success") }))).toBe("analyzeIssues");
    expect(routeAfterGitHub(state({ githubRun: run("failed") }))).toBe("finalize");
  });

  it("asks for follow-up decisions only when Jira or Slack was requested", () => {
    expect(routeAfterAnalysis(state({ analysisRun: "success", requestPlan: tools(true, true) }))).toBe("actionabilityDecision");
    expect(routeAfterAnalysis(state({ analysisRun: "success", requestPlan: tools(true, false, true) }))).toBe("actionabilityDecision");
    expect(routeAfterAnalysis(state({ analysisRun: "success", requestPlan: tools(true) }))).toBe("finalize");
    expect(routeAfterAnalysis(state({ analysisRun: "failed", requestPlan: tools(true, true) }))).toBe("finalize");
  });

  it("routes the actionability decision to Jira, Slack or finalize", () => {
    const decision = (selectedIssues: number[]) => ({
      shouldCreateJira: selectedIssues.length > 0,
      selectedIssues,
      reason: "r",
    });
    expect(routeAfterActionability(state({ actionability: decision([1]), proceedToJira: true }))).toBe("jira");
    expect(
      routeAfterActionability(
        state({ actionability: decision([1]), proceedToJira: false, requestPlan: tools(true, false, true) }),
      ),
    ).toBe("notificationDecision");
    expect(
      routeAfterActionability(state({ actionability: decision([]), proceedToJira: false, requestPlan: tools(true, true, true) })),
    ).toBe("finalize");
    expect(routeAfterActionability(state())).toBe("finalize");
  });

  it("routes the notification decision", () => {
    expect(routeAfterNotification(state({ notification: { shouldNotify: true, reason: "r" } }))).toBe("slack");
    expect(routeAfterNotification(state({ notification: { shouldNotify: false, reason: "r" } }))).toBe("finalize");
    expect(routeAfterNotification(state())).toBe("finalize");
  });
});

function reasoning(action: "continue" | "finish") {
  return new FakeModel({
    request_understanding: { intent: "Triage GitHub bugs", requestedActions: ["inspect_github_issues"] },
    request_plan: {
      steps: ["Inspect repository issues", "Analyze issue severity"],
      requiredTools: { github: true, jira: false, slack: false },
    },
    workflow_decision: { action, reason: action === "continue" ? "External systems are required." : "No tools needed." },
    issue_assessments: demoAssessments(),
  });
}

describe("agent core graph", () => {
  it("Test A — actionable engineering request continues to the tools", async () => {
    const model = reasoning("continue");
    const executor = new MockSwytchExecutor({ githubListOpenIssues: { data: DEMO_GITHUB_ISSUES } });
    const result = await runForgeMind(
      "Check the latest open GitHub issues and identify critical bugs.",
      makeDeps({ model, executor }),
      "run-a",
    );
    expect(result.status).toBe("success");
    expect(result.decision).toEqual({ action: "continue", reason: "External systems are required." });
    expect(result.plan).toHaveLength(2);
    expect(executor.calls).toHaveLength(1);
    expect(result.events[0].stage).toBe("request");
    expect(result.events.at(-1)?.stage).toBe("final");
  });

  it("Test B — informational request finishes", async () => {
    const result = await runForgeMind("Explain what ForgeMind does.", makeDeps({ model: reasoning("finish") }), "run-b");
    expect(result.status).toBe("success");
    expect(result.decision?.action).toBe("finish");
    expect(result.summary).toMatch(/no external engineering action is required/);
  });

  it("stops at the failing node and reports a safe failure", async () => {
    const model = new FakeModel({ request_understanding: new Error("Claude 529 overloaded") });
    const result = await runForgeMind("Check issues", makeDeps({ model }), "run-c");
    expect(result.status).toBe("failed");
    expect(model.calls).toHaveLength(1);
    expect(result.errors).toEqual([
      { stage: "reasoning", code: "model_error", message: "The reasoning model request failed." },
    ]);
    expect(JSON.stringify(result)).not.toContain("529");
  });

  it("invalid model output never produces a decision", async () => {
    const model = reasoning("continue").set("workflow_decision", { action: "YES, CONTINUE!!!", reason: "" });
    const result = await runForgeMind("Check issues", makeDeps({ model }), "run-d");
    expect(result.status).toBe("failed");
    expect(result.decision).toBeUndefined();
    expect(result.errors[0].code).toBe("invalid_model_output");
  });
});
