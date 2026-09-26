import { describe, expect, it } from "vitest";
import {
  buildCreateIssueInput,
  buildGetIssueInput,
  isVerifiedIssue,
  jiraSummary,
  parseCreatedIssue,
} from "@/agent/swytchcode/jira";
import { buildPostMessageInput, buildSlackMessage, escapeSlack, parseSlackResponse } from "@/agent/swytchcode/slack";
import type { JiraTaskDraft } from "@/agent/schemas";

const repo = { owner: "forgemind-demo", name: "demo-issues" };
const draft: JiraTaskDraft = {
  sourceIssue: 101,
  summary: "Fix payment processing failure",
  description: "Customers cannot complete payment.",
  priority: "Highest",
  acceptanceCriteria: ["Payments succeed", "Regression test added"],
};

describe("Jira adapter", () => {
  it("builds a v3 create payload with trusted project, Task type and ADF description", () => {
    const input = buildCreateIssueInput(draft, "FORGE", repo, "run-1");
    const fields = (input.body as { fields: Record<string, unknown> }).fields;
    expect(fields.project).toEqual({ key: "FORGE" });
    expect(fields.issuetype).toEqual({ name: "Task" });
    expect(fields.summary).toBe("[GH #101] Fix payment processing failure");
    const description = fields.description as { type: string; version: number; content: { type: string }[] };
    expect(description).toMatchObject({ type: "doc", version: 1 });
    expect(description.content.map((n) => n.type)).toEqual([
      "paragraph",
      "paragraph",
      "heading",
      "bulletList",
      "paragraph",
      "paragraph",
    ]);
    expect(JSON.stringify(description)).toContain("https://github.com/forgemind-demo/demo-issues/issues/101");
    expect(input.params).toBeUndefined();
  });

  it("never emits empty ADF text nodes", () => {
    const input = buildCreateIssueInput({ ...draft, acceptanceCriteria: ["   "] }, "FORGE", repo, "r");
    expect(JSON.stringify(input)).not.toContain('"text":""');
  });

  it("bounds the summary to Jira's 255 characters", () => {
    expect(jiraSummary({ ...draft, summary: "x".repeat(200) }).length).toBeLessThanOrEqual(255);
    expect(jiraSummary({ ...draft, summary: "a\n\n  b" })).toBe("[GH #101] a b");
  });

  it("accepts only a key in the configured project as creation evidence", () => {
    expect(parseCreatedIssue({ id: "1", key: "FORGE-12" }, "FORGE")).toEqual({ key: "FORGE-12" });
    expect(parseCreatedIssue({ status: 201, body: { id: "1", key: "forge-3" } }, "FORGE")).toEqual({ key: "FORGE-3" });
    expect(parseCreatedIssue({ key: "PROD-1" }, "FORGE")).toBeUndefined();
    expect(parseCreatedIssue({ key: "FORGE-" }, "FORGE")).toBeUndefined();
    expect(parseCreatedIssue({ errorMessages: ["Field 'priority' cannot be set"] }, "FORGE")).toBeUndefined();
    expect(parseCreatedIssue(null, "FORGE")).toBeUndefined();
  });

  it("verifies only the same key in the same project", () => {
    expect(buildGetIssueInput("FORGE-1")).toEqual({ params: { issueIdOrKey: "FORGE-1", fields: "summary,status,project" } });
    expect(isVerifiedIssue({ key: "FORGE-1", fields: { project: { key: "FORGE" } } }, "FORGE-1", "FORGE")).toBe(true);
    expect(isVerifiedIssue({ data: { key: "FORGE-1" } }, "FORGE-1", "FORGE")).toBe(true);
    expect(isVerifiedIssue({ key: "FORGE-2" }, "FORGE-1", "FORGE")).toBe(false);
    expect(isVerifiedIssue({ key: "FORGE-1", fields: { project: { key: "OTHER" } } }, "FORGE-1", "FORGE")).toBe(false);
    expect(isVerifiedIssue({ errorMessages: ["Issue does not exist"] }, "FORGE-1", "FORGE")).toBe(false);
  });
});

describe("Slack adapter", () => {
  it("escapes mentions and disguised links", () => {
    expect(escapeSlack("<!channel> <@U123> <https://evil.example|click> a & b")).toBe(
      "&lt;!channel&gt; &lt;@U123&gt; &lt;https://evil.example|click&gt; a &amp; b",
    );
  });

  it("builds the message from recorded facts only", () => {
    const text = buildSlackMessage({
      repository: "forgemind-demo/demo-issues",
      headline: "Critical issues were triaged. <!here>",
      issuesReviewed: 5,
      actionable: [
        { number: 101, severity: "critical", title: "Payment <script>", jiraKey: "FORGE-1", jiraFailed: false },
        { number: 105, severity: "high", title: "Database timeout", jiraFailed: true },
      ],
      jiraCreated: 1,
      jiraFailed: 1,
      jiraRequested: true,
      runId: "run-1",
    });
    expect(text).toContain("2 actionable of 5 open issue(s) reviewed.");
    expect(text).toContain("• #101 Payment &lt;script&gt; — CRITICAL → FORGE-1");
    expect(text).toContain("• #105 Database timeout — HIGH → Jira task creation failed");
    expect(text).toContain("Jira: 1 of 2 task(s) created, 1 failed.");
    expect(text).not.toContain("<!here>");
    expect(text).toContain("Run: run-1");
  });

  it("posts to the trusted channel without unfurling", () => {
    expect(buildPostMessageInput("#forgemind-demo", "hi")).toEqual({
      body: { channel: "#forgemind-demo", text: "hi", unfurl_links: false, unfurl_media: false },
    });
  });

  it("treats ok:false as failure and maps error codes to safe messages", () => {
    expect(parseSlackResponse({ ok: true, ts: "1.2" })).toEqual({ ok: true, ts: "1.2" });
    expect(parseSlackResponse({ body: { ok: true } })).toEqual({ ok: true, ts: undefined });
    expect(parseSlackResponse({ ok: false, error: "not_in_channel" })).toMatchObject({
      ok: false,
      error: { category: "provider", message: "The Slack app is not a member of the configured channel." },
    });
    expect(parseSlackResponse({ ok: false, error: "invalid_auth" })).toMatchObject({ ok: false, error: { category: "auth" } });
    expect(parseSlackResponse({ ok: false, error: "weird_new_error" })).toMatchObject({
      ok: false,
      error: { message: "Slack rejected the notification." },
    });
    expect(parseSlackResponse("<html>")).toMatchObject({ ok: false, error: { category: "invalid_response" } });
  });
});
