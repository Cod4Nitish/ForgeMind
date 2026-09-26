import { describe, expect, it } from "vitest";
import { runForgeMind } from "@/agent/run";
import { FakeModel } from "../helpers/fake-model";
import { DEMO_GITHUB_ISSUES, makeDeps, TEST_CONFIG } from "../helpers/fixtures";
import { MockSwytchExecutor, toolError } from "../helpers/mock-executor";
import { DEMO_PROMPT, demoAssessments, demoModel, jiraCreated, jiraIssue, slackOk } from "../helpers/scenario";

function demoExecutor() {
  return new MockSwytchExecutor({
    githubListOpenIssues: { data: DEMO_GITHUB_ISSUES },
    jiraCreateIssue: [jiraCreated("FORGE-1"), jiraCreated("FORGE-2"), jiraCreated("FORGE-3")],
    jiraGetIssue: (input) => jiraIssue(input.params!.issueIdOrKey),
    slackPostMessage: slackOk,
  });
}

const run = (model: FakeModel, executor: MockSwytchExecutor, config = TEST_CONFIG) =>
  runForgeMind(DEMO_PROMPT, makeDeps({ model, executor, config }), "run-test");

const toolSequence = (executor: MockSwytchExecutor) => executor.calls.map((c) => c.tool);

describe("Step 7 decision engine — mocked end-to-end", () => {
  it("Test A — actionable issues: GitHub → analyze → Jira → verify → Slack → success", async () => {
    const model = demoModel();
    const executor = demoExecutor();
    const result = await run(model, executor);

    expect(result.status).toBe("success");
    expect(result).toMatchObject({
      issuesReviewed: 5,
      actionableIssues: 3,
      jiraTasksCreated: 3,
      jiraTasksFailed: 0,
      slackNotified: true,
    });
    expect(toolSequence(executor)).toEqual([
      "githubListOpenIssues",
      "jiraCreateIssue",
      "jiraCreateIssue",
      "jiraCreateIssue",
      "jiraGetIssue",
      "jiraGetIssue",
      "jiraGetIssue",
      "slackPostMessage",
    ]);
    expect(model.calls.map((c) => c.name)).toEqual([
      "request_understanding",
      "request_plan",
      "workflow_decision",
      "issue_assessments",
      "actionability_decision",
      "jira_task_drafts",
      "notification_decision",
    ]);
    expect(result.jiraTasks.map((t) => [t.sourceIssue, t.key, t.status, t.verification])).toEqual([
      [101, "FORGE-1", "created", "verified"],
      [103, "FORGE-2", "created", "verified"],
      [105, "FORGE-3", "created", "verified"],
    ]);
    expect(result.issues.filter((i) => i.selected).map((i) => i.number)).toEqual([101, 103, 105]);
    expect(result.stages).toEqual({
      github: "success",
      analysis: "success",
      jira: "success",
      verification: "success",
      slack: "success",
    });
    expect(result.summary).toBe(
      "Reviewed 5 open issue(s) in forgemind-demo/demo-issues: 3 actionable. Created 3 Jira task(s) (FORGE-1, FORGE-2, FORGE-3). Engineering team notified in Slack.",
    );
    expect(result.slack).toMatchObject({ status: "sent", channel: "#forgemind-demo" });
  });

  it("uses only trusted configuration for every destination", async () => {
    const executor = demoExecutor();
    await run(demoModel(), executor);
    for (const call of executor.callsFor("jiraCreateIssue")) {
      const fields = (call.input.body as { fields: Record<string, { key?: string; name?: string }> }).fields;
      expect(fields.project).toEqual({ key: "FORGE" });
      expect(fields.issuetype).toEqual({ name: "Task" });
    }
    const slack = executor.callsFor("slackPostMessage")[0].input.body as { channel: string; text: string };
    expect(slack.channel).toBe("#forgemind-demo");
    expect(slack.text).toContain("FORGE-1");
    expect(slack.text).toContain("3 actionable of 5 open issue(s) reviewed.");
    expect(executor.callsFor("githubListOpenIssues")[0].input.params).toMatchObject({
      owner: "forgemind-demo",
      repo: "demo-issues",
    });
  });

  it("Test B — no actionable issues: finalize without Jira or Slack", async () => {
    const model = demoModel().set("issue_assessments", {
      assessments: demoAssessments().assessments.map((a) => ({
        ...a,
        severity: "low",
        actionable: false,
        recommendedAction: "no_action",
      })),
    });
    const executor = demoExecutor();
    const result = await run(model, executor);

    expect(result.status).toBe("success");
    expect(toolSequence(executor)).toEqual(["githubListOpenIssues"]);
    expect(model.callsFor("actionability_decision")).toHaveLength(0);
    expect(model.callsFor("jira_task_drafts")).toHaveLength(0);
    expect(result).toMatchObject({ actionableIssues: 0, jiraTasksCreated: 0, slackNotified: false });
    expect(result.summary).toContain("none require engineering action");
    expect(result.stages).toMatchObject({ jira: "skipped", slack: "skipped" });
  });

  it("GitHub returns no open issues: nothing to analyze, success", async () => {
    const model = demoModel();
    const executor = demoExecutor().set("githubListOpenIssues", { data: [] });
    const result = await run(model, executor);
    expect(result.status).toBe("success");
    expect(result.issuesReviewed).toBe(0);
    expect(model.callsFor("issue_assessments")).toHaveLength(0);
    expect(toolSequence(executor)).toEqual(["githubListOpenIssues"]);
    expect(result.summary).toContain("No open issues were found");
  });

  it("Test C — Jira partial failure is preserved and the team is still informed", async () => {
    const executor = demoExecutor().set("jiraCreateIssue", [
      jiraCreated("FORGE-1"),
      jiraCreated("FORGE-2"),
      toolError("validation"),
    ]);
    const result = await run(demoModel(), executor);

    expect(result.status).toBe("partial");
    expect(result).toMatchObject({ jiraTasksCreated: 2, jiraTasksFailed: 1, slackNotified: true });
    expect(result.jiraTasks[2]).toMatchObject({ sourceIssue: 105, status: "failed", verification: "not_checked" });
    expect(executor.callsFor("jiraGetIssue")).toHaveLength(2); // only created tasks are verified
    expect(result.stages.jira).toBe("partial");
    expect(result.summary).toContain("Created 2 of 3 Jira task(s) (FORGE-1, FORGE-2); 1 failed.");
    expect(result.summary).not.toMatch(/Created 3 Jira/);
    const slackText = (executor.callsFor("slackPostMessage")[0].input.body as { text: string }).text;
    expect(slackText).toContain("Jira: 2 of 3 task(s) created, 1 failed.");
    expect(slackText).toContain("#105");
    expect(slackText).toContain("Jira task creation failed");
  });

  it("Jira total failure never reports success", async () => {
    const executor = demoExecutor().set("jiraCreateIssue", toolError("auth"));
    const result = await run(demoModel(), executor);
    expect(result.status).toBe("partial");
    expect(result.jiraTasksCreated).toBe(0);
    expect(result.jiraTasksFailed).toBe(3);
    expect(result.stages.jira).toBe("failed");
    expect(result.stages.verification).toBe("skipped");
    expect(result.summary).toContain("Created 0 of 3 Jira task(s); 3 failed.");
  });

  it("a Jira create with no usable key is 'unconfirmed', not created, and never retried", async () => {
    const executor = demoExecutor().set("jiraCreateIssue", [
      jiraCreated("FORGE-1"),
      { data: { message: "accepted" } },
      jiraCreated("OTHER-9"), // wrong project → not accepted as evidence
    ]);
    const result = await run(demoModel(), executor);
    expect(executor.callsFor("jiraCreateIssue")).toHaveLength(3);
    expect(result.jiraTasks.map((t) => t.status)).toEqual(["created", "unconfirmed", "unconfirmed"]);
    expect(result.jiraTasksCreated).toBe(1);
    expect(result.status).toBe("partial");
  });

  it("Jira verification failure → created but unverified → partial", async () => {
    const executor = demoExecutor().set("jiraGetIssue", [jiraIssue("FORGE-1"), toolError("provider"), jiraIssue("FORGE-9")]);
    const result = await run(demoModel(), executor);
    expect(result.jiraTasks.map((t) => t.verification)).toEqual(["verified", "unverified", "unverified"]);
    expect(result.stages.verification).toBe("partial");
    expect(result.status).toBe("partial");
    expect(result.jiraTasksCreated).toBe(3);
    expect(result.summary).toContain("2 created task(s) could not be verified.");
  });

  it("Test D — Slack failure keeps Jira results and reports partial", async () => {
    const executor = demoExecutor().set("slackPostMessage", toolError("network", true));
    const result = await run(demoModel(), executor);
    expect(result.status).toBe("partial");
    expect(result.jiraTasksCreated).toBe(3);
    expect(result.slackNotified).toBe(false);
    expect(result.slack.status).toBe("failed");
    expect(result.stages.slack).toBe("failed");
    expect(executor.callsFor("slackPostMessage")).toHaveLength(1);
    expect(result.summary).toContain("Created 3 Jira task(s)");
    expect(result.summary).toContain("Slack notification failed");
  });

  it("Slack ok:false (HTTP 200) is treated as a failure", async () => {
    const executor = demoExecutor().set("slackPostMessage", { data: { ok: false, error: "channel_not_found" } });
    const result = await run(demoModel(), executor);
    expect(result.status).toBe("partial");
    expect(result.slack).toMatchObject({ status: "failed", message: "The configured Slack channel was not found." });
  });

  it("Test E — GitHub failure stops every downstream action", async () => {
    const model = demoModel();
    const executor = demoExecutor().set("githubListOpenIssues", toolError("auth"));
    const result = await run(model, executor);
    expect(result.status).toBe("failed");
    expect(toolSequence(executor)).toEqual(["githubListOpenIssues"]);
    expect(model.callsFor("issue_assessments")).toHaveLength(0);
    expect(result.stages).toEqual({
      github: "failed",
      analysis: "not_run",
      jira: "not_run",
      verification: "not_run",
      slack: "not_run",
    });
    expect(result.summary).toContain("No downstream actions were performed.");
  });

  it("Test F — invalid issue analysis → no unsafe tool call, safe failure", async () => {
    const model = demoModel().set("issue_assessments", [
      { assessments: [{ issueNumber: 101, severity: "catastrophic" }] },
      demoAssessments([101, 999]), // invents an issue
    ]);
    const executor = demoExecutor();
    const result = await run(model, executor);
    expect(result.status).toBe("failed");
    expect(model.callsFor("issue_assessments")).toHaveLength(2);
    expect(toolSequence(executor)).toEqual(["githubListOpenIssues"]);
    expect(result.errors).toEqual([
      { stage: "analysis", code: "invalid_model_output", message: "The reasoning model returned output that failed validation." },
    ]);
    expect(result.issues).toEqual([]);
  });

  it("rejects assessments whose flags disagree or that skip an issue", async () => {
    const inconsistent = demoAssessments();
    inconsistent.assessments[0] = { ...inconsistent.assessments[0], actionable: false };
    const missing = demoAssessments([101, 102, 103, 104]);
    const executor = demoExecutor();
    const result = await run(demoModel().set("issue_assessments", [inconsistent, missing]), executor);
    expect(result.status).toBe("failed");
    expect(toolSequence(executor)).toEqual(["githubListOpenIssues"]);
  });

  it("an actionability decision selecting a non-actionable issue is rejected — no Jira mutation", async () => {
    const model = demoModel().set("actionability_decision", {
      shouldCreateJira: true,
      selectedIssues: [101, 102],
      reason: "Escalate everything.",
    });
    const executor = demoExecutor();
    const result = await run(model, executor);
    expect(model.callsFor("actionability_decision")).toHaveLength(2);
    expect(executor.callsFor("jiraCreateIssue")).toHaveLength(0);
    expect(executor.callsFor("slackPostMessage")).toHaveLength(0);
    expect(result.status).toBe("partial"); // triage succeeded, the follow-up decision did not
    expect(result.summary).toContain("failed validation");
  });

  it("Jira drafts for unselected issues are rejected before any mutation", async () => {
    const model = demoModel().set("jira_task_drafts", {
      tasks: [101, 103, 105, 104].map((n) => ({
        sourceIssue: n,
        summary: "x",
        description: "y",
        priority: "High",
        acceptanceCriteria: ["z"],
      })),
    });
    const executor = demoExecutor();
    const result = await run(model, executor);
    expect(executor.callsFor("jiraCreateIssue")).toHaveLength(0);
    expect(result.status).toBe("partial");
    expect(result.jiraTasks.every((t) => t.status === "failed")).toBe(true);
    expect(result.jiraTasksFailed).toBe(3);
  });

  it("notification decision 'no' skips Slack", async () => {
    const model = demoModel().set("notification_decision", { shouldNotify: false, reason: "Nothing new to report." });
    const executor = demoExecutor();
    const result = await run(model, executor);
    expect(executor.callsFor("slackPostMessage")).toHaveLength(0);
    expect(result.status).toBe("success");
    expect(result.slack).toMatchObject({ status: "skipped", reason: "Nothing new to report." });
    expect(result.summary).toContain("No Slack notification was sent: Nothing new to report.");
  });

  it("a notification summary citing a Jira key that was never created is rejected", async () => {
    const model = demoModel().set("notification_decision", {
      shouldNotify: true,
      reason: "r",
      messageSummary: "Created PROD-999 for the outage.",
    });
    const executor = demoExecutor();
    const result = await run(model, executor);
    expect(executor.callsFor("slackPostMessage")).toHaveLength(0);
    expect(result.status).toBe("partial");
    expect(result.stages.slack).toBe("failed");
  });

  it("Stage 0 case A — 'show critical issues' reads GitHub and analyzes only", async () => {
    const model = demoModel({ github: true, jira: false, slack: false });
    const executor = demoExecutor();
    const result = await run(model, executor);
    expect(toolSequence(executor)).toEqual(["githubListOpenIssues"]);
    expect(model.callsFor("actionability_decision")).toHaveLength(0);
    expect(result.status).toBe("success");
    expect(result.actionableIssues).toBe(3);
    expect(result.stages).toMatchObject({ github: "success", analysis: "success", jira: "skipped", slack: "skipped" });
  });

  it("Slack-only request notifies without creating Jira tasks", async () => {
    const model = demoModel({ github: true, jira: false, slack: true });
    const executor = demoExecutor();
    const result = await run(model, executor);
    expect(toolSequence(executor)).toEqual(["githubListOpenIssues", "slackPostMessage"]);
    expect(result.status).toBe("success");
    expect(result.jiraTasksCreated).toBe(0);
    expect(result.events.some((e) => e.type === "step_skipped" && e.stage === "jira")).toBe(true);
  });

  it("a requested integration without configuration fails safely as partial", async () => {
    const executor = demoExecutor();
    const result = await run(demoModel(), executor, { github: TEST_CONFIG.github });
    expect(executor.callsFor("jiraCreateIssue")).toHaveLength(0);
    expect(executor.callsFor("slackPostMessage")).toHaveLength(0);
    expect(result.status).toBe("partial");
    expect(result.errors.map((e) => [e.stage, e.code])).toEqual([
      ["jira", "config_error"],
      ["slack", "config_error"],
    ]);
  });

  it("informational request finishes without any tool", async () => {
    const model = demoModel().set("workflow_decision", { action: "finish", reason: "A capability question." });
    const executor = demoExecutor();
    const result = await run(model, executor);
    expect(executor.calls).toHaveLength(0);
    expect(result.status).toBe("success");
    expect(result.decision?.action).toBe("finish");
    expect(result.stages.github).toBe("skipped");
  });

  it("plans that want Jira/Slack without GitHub are rejected", async () => {
    const model = demoModel().set("request_plan", {
      steps: ["Create tasks"],
      requiredTools: { github: false, jira: true, slack: false },
    });
    const executor = demoExecutor();
    const result = await run(model, executor);
    expect(result.status).toBe("failed");
    expect(executor.calls).toHaveLength(0);
  });

  it("events form an ordered, real execution log", async () => {
    const result = await run(demoModel(), demoExecutor());
    const stages = result.events.map((e) => e.stage);
    expect(stages[0]).toBe("request");
    expect(stages.at(-1)).toBe("final");
    const firstIndex = (stage: string) => stages.indexOf(stage as (typeof stages)[number]);
    expect(firstIndex("github")).toBeLessThan(firstIndex("analysis"));
    expect(firstIndex("analysis")).toBeLessThan(firstIndex("jira"));
    expect(firstIndex("jira")).toBeLessThan(firstIndex("verification"));
    expect(firstIndex("verification")).toBeLessThan(firstIndex("slack"));
  });
});
