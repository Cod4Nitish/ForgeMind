import { describe, expect, it } from "vitest";
import { runForgeMind } from "@/agent/run";
import { getServerDeps } from "@/agent/server-deps";

const DEMO_PROMPT =
  "Check the latest open GitHub issues, identify critical/high-priority bugs, create Jira tasks for the actionable ones, and notify the engineering team on Slack.";

/**
 * Real end-to-end run: Claude + Swytchcode → GitHub, Jira (creates tasks) and
 * Slack (posts a message). Mutates the configured TEST project/channel, so it
 * only runs when FORGEMIND_LIVE_E2E=1 is set explicitly.
 */
describe.skipIf(process.env.FORGEMIND_LIVE_E2E !== "1")("live: full ForgeMind workflow", () => {
  it("runs the demo prompt against the configured test systems", async () => {
    const result = await runForgeMind(DEMO_PROMPT, getServerDeps(), `live-${Date.now()}`);

    console.info(
      JSON.stringify(
        {
          status: result.status,
          issuesReviewed: result.issuesReviewed,
          actionableIssues: result.actionableIssues,
          jiraTasks: result.jiraTasks.map((t) => ({ issue: t.sourceIssue, key: t.key, status: t.status, verification: t.verification })),
          slack: result.slack,
          stages: result.stages,
          summary: result.summary,
          errors: result.errors,
          durationMs: result.durationMs,
        },
        null,
        2,
      ),
    );

    // Internal consistency of the reported result — no invented numbers.
    expect(result.jiraTasksCreated).toBe(result.jiraTasks.filter((t) => t.status === "created").length);
    expect(result.jiraTasksCreated + result.jiraTasksFailed).toBe(result.jiraTasks.length);
    expect(result.slackNotified).toBe(result.slack.status === "sent");
    for (const task of result.jiraTasks.filter((t) => t.status === "created")) {
      expect(task.key).toMatch(/^[A-Z][A-Z0-9_]+-\d+$/);
    }
    if (result.status === "success") expect(result.errors).toEqual([]);
  }, 300_000);
});
