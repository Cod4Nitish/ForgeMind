import { describe, expect, it } from "vitest";
import { DEMO_CONFIG, DemoExecutor, DemoModel } from "@/agent/demo";
import { runForgeMind } from "@/agent/run";
import { resolveRunMode } from "@/agent/server-deps";

const deps = () => ({ model: new DemoModel(), executor: new DemoExecutor(), config: DEMO_CONFIG, now: () => new Date() });

describe("run mode", () => {
  it("falls back to demo without credentials", () => {
    expect(resolveRunMode({})).toBe("demo");
    expect(resolveRunMode({ ANTHROPIC_API_KEY: "k", VERCEL: "1" })).toBe("demo");
  });

  it("runs live when credentials are present", () => {
    expect(resolveRunMode({ ANTHROPIC_API_KEY: "k" })).toBe("live");
    expect(resolveRunMode({ ANTHROPIC_API_KEY: "k", SWYTCHCODE_TOKEN: "t", VERCEL: "1" })).toBe("live");
  });

  it("honours FORGEMIND_MODE", () => {
    expect(resolveRunMode({ FORGEMIND_MODE: "demo", ANTHROPIC_API_KEY: "k" })).toBe("demo");
    expect(resolveRunMode({ FORGEMIND_MODE: "live" })).toBe("live");
  });
});

describe("demo sandbox", () => {
  it("runs the full GitHub → Jira → Slack workflow", { timeout: 30_000 }, async () => {
    const result = await runForgeMind(
      "Check the latest open GitHub issues, create Jira tasks for critical bugs and notify the team on Slack.",
      deps(),
      "demo-run",
    );
    expect(result.status).toBe("success");
    expect(result).toMatchObject({ issuesReviewed: 5, actionableIssues: 3, jiraTasksCreated: 3, slackNotified: true });
    expect(result.jiraTasks.every((t) => t.verification === "verified")).toBe(true);
  });

  it("skips Jira and Slack when they are not requested", { timeout: 30_000 }, async () => {
    const result = await runForgeMind("Triage the open GitHub issues by severity.", deps(), "demo-run");
    expect(result.status).toBe("success");
    expect(result).toMatchObject({ issuesReviewed: 5, jiraTasksCreated: 0, slackNotified: false });
  });

  it("finishes without tools for unrelated requests", { timeout: 30_000 }, async () => {
    const result = await runForgeMind("What is the capital of France?", deps(), "demo-run");
    expect(result.issuesReviewed).toBe(0);
    expect(result.stages.github).not.toBe("success");
  });
});
