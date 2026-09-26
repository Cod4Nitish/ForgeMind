import { describe, expect, it } from "vitest";
import { runForgeMind } from "@/agent/run";
import { FakeModel } from "../helpers/fake-model";
import { DEMO_GITHUB_ISSUES, makeDeps } from "../helpers/fixtures";
import { MockSwytchExecutor, toolError } from "../helpers/mock-executor";
import { demoAssessments } from "../helpers/scenario";

function reasoning() {
  return new FakeModel({
    request_understanding: { intent: "Triage open GitHub issues", requestedActions: ["inspect_github_issues"] },
    request_plan: { steps: ["Retrieve open issues"], requiredTools: { github: true, jira: false, slack: false } },
    workflow_decision: { action: "continue", reason: "Issue data is required." },
    issue_assessments: demoAssessments(),
  });
}

describe("LangGraph → Swytchcode GitHub tool", () => {
  it("retrieves issues from the configured repository into state", async () => {
    const executor = new MockSwytchExecutor({ githubListOpenIssues: { data: DEMO_GITHUB_ISSUES } });
    const result = await runForgeMind("Check open issues", makeDeps({ model: reasoning(), executor }), "r1");

    expect(result.status).toBe("success");
    expect(result.stages.github).toBe("success");
    expect(result.issuesReviewed).toBe(5);
    expect(result.repository).toBe("forgemind-demo/demo-issues");
    expect(executor.calls).toEqual([
      {
        tool: "githubListOpenIssues",
        input: { params: { owner: "forgemind-demo", repo: "demo-issues", state: "open", per_page: "30" } },
      },
    ]);
    const githubEvents = result.events.filter((e) => e.stage === "github").map((e) => [e.type, e.status, e.tool]);
    expect(githubEvents).toEqual([
      ["tool_selected", "success", "github.issue.get1"],
      ["tool_started", "running", "github.issue.get1"],
      ["tool_completed", "success", "github.issue.get1"],
    ]);
  });

  it("GitHub execution failure → safe failed result", async () => {
    const executor = new MockSwytchExecutor({ githubListOpenIssues: toolError("auth") });
    const result = await runForgeMind("Check open issues", makeDeps({ model: reasoning(), executor }), "r3");
    expect(result.status).toBe("failed");
    expect(result.stages.github).toBe("failed");
    expect(result.errors).toEqual([{ stage: "github", code: "tool_error", message: "Simulated auth failure." }]);
    expect(result.events.find((e) => e.type === "tool_failed")).toMatchObject({ stage: "github", status: "error" });
  });

  it("malformed GitHub data → invalid_response failure", async () => {
    const executor = new MockSwytchExecutor({ githubListOpenIssues: { data: { message: "API rate limit exceeded" } } });
    const result = await runForgeMind("Check open issues", makeDeps({ model: reasoning(), executor }), "r4");
    expect(result.status).toBe("failed");
    expect(result.errors[0].message).toBe("GitHub returned data in an unexpected format.");
  });
});
