import { describe, expect, it } from "vitest";
import { routeAfterDecision, routeOnError } from "@/agent/routing";
import { runForgeMind } from "@/agent/run";
import type { ForgeMindStateValue } from "@/agent/state";
import { FakeModel } from "../helpers/fake-model";
import { DEMO_GITHUB_ISSUES, makeDeps } from "../helpers/fixtures";
import { MockSwytchExecutor } from "../helpers/mock-executor";

const baseState = (overrides: Partial<ForgeMindStateValue> = {}): ForgeMindStateValue =>
  ({ runId: "r", userRequest: "x", events: [], errors: [], ...overrides }) as ForgeMindStateValue;

function scriptedModel(action: "continue" | "finish") {
  return new FakeModel({
    request_understanding: { intent: "Triage GitHub bugs", requestedActions: ["inspect_github_issues"] },
    request_plan: { steps: ["Inspect repository issues", "Analyze issue severity"] },
    workflow_decision: { action, reason: action === "continue" ? "External systems are required." : "No tools needed." },
  });
}

describe("routing", () => {
  it("routes continue/finish from the validated decision", () => {
    expect(routeAfterDecision(baseState({ workflowDecision: { action: "continue", reason: "r" } }))).toBe("continue");
    expect(routeAfterDecision(baseState({ workflowDecision: { action: "finish", reason: "r" } }))).toBe("finish");
  });

  it("finishes when there is no decision or an error was recorded", () => {
    expect(routeAfterDecision(baseState())).toBe("finish");
    expect(
      routeAfterDecision(
        baseState({
          workflowDecision: { action: "continue", reason: "r" },
          errors: [{ stage: "reasoning", code: "model_error", message: "m" }],
        }),
      ),
    ).toBe("finish");
  });

  it("stops the dependent workflow on error", () => {
    const route = routeOnError("plan");
    expect(route(baseState())).toBe("plan");
    expect(route(baseState({ errors: [{ stage: "reasoning", code: "model_error", message: "m" }] }))).toBe("finalize");
  });
});

describe("agent core graph", () => {
  it("Test A — actionable engineering request continues", async () => {
    const model = scriptedModel("continue");
    const executor = new MockSwytchExecutor({ githubListOpenIssues: { data: DEMO_GITHUB_ISSUES } });
    const result = await runForgeMind(
      "Check the latest open GitHub issues and identify critical bugs.",
      makeDeps({ model, executor }),
      "run-a",
    );
    expect(result.status).toBe("completed");
    expect(result.decision).toEqual({ action: "continue", reason: "External systems are required." });
    expect(result.plan).toHaveLength(2);
    expect(model.calls.map((c) => c.name)).toEqual(["request_understanding", "request_plan", "workflow_decision"]);
    expect(executor.calls).toHaveLength(1);
    expect(result.events[0].stage).toBe("request");
    expect(result.events.at(-1)?.stage).toBe("final");
  });

  it("Test B — informational request finishes", async () => {
    const result = await runForgeMind("Explain what ForgeMind does.", makeDeps({ model: scriptedModel("finish") }), "run-b");
    expect(result.status).toBe("completed");
    expect(result.decision?.action).toBe("finish");
    expect(result.summary).toMatch(/no external engineering action is required/);
  });

  it("stops at the failing node and reports a safe failure", async () => {
    const model = new FakeModel({ request_understanding: new Error("Claude 529 overloaded") });
    const result = await runForgeMind("Check issues", makeDeps({ model }), "run-c");
    expect(result.status).toBe("failed");
    expect(model.calls).toHaveLength(1); // plan/decision never ran
    expect(result.errors).toEqual([
      { stage: "reasoning", code: "model_error", message: "The reasoning model request failed." },
    ]);
    expect(JSON.stringify(result)).not.toContain("529");
  });

  it("invalid model output never produces a decision", async () => {
    const model = scriptedModel("continue").set("workflow_decision", { action: "YES, CONTINUE!!!", reason: "" });
    const result = await runForgeMind("Check issues", makeDeps({ model }), "run-d");
    expect(result.status).toBe("failed");
    expect(result.decision).toBeUndefined();
    expect(result.errors[0].code).toBe("invalid_model_output");
  });
});
