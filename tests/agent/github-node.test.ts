import { describe, expect, it } from "vitest";
import { runForgeMind } from "@/agent/run";
import { FakeModel } from "../helpers/fake-model";
import { DEMO_GITHUB_ISSUES, makeDeps } from "../helpers/fixtures";
import { MockSwytchExecutor, toolError } from "../helpers/mock-executor";

function reasoning(action: "continue" | "finish") {
  return new FakeModel({
    request_understanding: { intent: "Triage open GitHub issues", requestedActions: ["inspect_github_issues"] },
    request_plan: { steps: ["Retrieve open issues"] },
    workflow_decision: { action, reason: "Issue data is required." },
  });
}

describe("LangGraph → Swytchcode GitHub tool", () => {
  it("continue → retrieves issues through the executor into state", async () => {
    const executor = new MockSwytchExecutor({ githubListOpenIssues: { data: DEMO_GITHUB_ISSUES } });
    const result = await runForgeMind("Check open issues", makeDeps({ model: reasoning("continue"), executor }), "r1");

    expect(result.status).toBe("completed");
    expect(result.github).toEqual({ status: "success", issueCount: 5 });
    expect(result.summary).toContain("retrieved 5 open GitHub issues from forgemind-demo/demo-issues");
    expect(executor.calls).toEqual([
      {
        tool: "githubListOpenIssues",
        input: { params: { owner: "forgemind-demo", repo: "demo-issues", state: "open", per_page: "30" } },
      },
    ]);
    const githubEvents = result.events.filter((e) => e.stage === "github").map((e) => [e.type, e.status]);
    expect(githubEvents).toEqual([
      ["tool_selected", "success"],
      ["tool_started", "running"],
      ["tool_completed", "success"],
    ]);
  });

  it("finish → never calls a tool", async () => {
    const executor = new MockSwytchExecutor();
    const result = await runForgeMind("What is ForgeMind?", makeDeps({ model: reasoning("finish"), executor }), "r2");
    expect(result.status).toBe("completed");
    expect(executor.calls).toHaveLength(0);
    expect(result.github).toBeUndefined();
  });

  it("GitHub execution failure → safe failed result", async () => {
    const executor = new MockSwytchExecutor({ githubListOpenIssues: toolError("auth") });
    const result = await runForgeMind("Check open issues", makeDeps({ model: reasoning("continue"), executor }), "r3");
    expect(result.status).toBe("failed");
    expect(result.github).toEqual({ status: "failed", issueCount: 0 });
    expect(result.errors).toEqual([{ stage: "github", code: "tool_error", message: "Simulated auth failure." }]);
    expect(result.events.at(-2)).toMatchObject({ type: "tool_failed", stage: "github", status: "error" });
  });

  it("malformed GitHub data → invalid_response failure", async () => {
    const executor = new MockSwytchExecutor({ githubListOpenIssues: { data: { message: "API rate limit exceeded" } } });
    const result = await runForgeMind("Check open issues", makeDeps({ model: reasoning("continue"), executor }), "r4");
    expect(result.status).toBe("failed");
    expect(result.errors[0].message).toBe("GitHub returned data in an unexpected format.");
  });
});
