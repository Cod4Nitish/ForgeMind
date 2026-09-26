import { describe, expect, it } from "vitest";
import { extractClassifiedError, normalizeSwytchError } from "@/agent/swytchcode/errors";
import { READ_MAX_ATTEMPTS, RetryPolicyExecutor } from "@/agent/swytchcode/policy";
import { SWYTCH_TOOLS, isToolName } from "@/agent/swytchcode/tools";
import { MockSwytchExecutor, toolError } from "../helpers/mock-executor";

class FakeSwytchcodeError extends Error {
  constructor(message: string, readonly details?: { category?: string; retryable?: boolean }) {
    super(message);
  }
}

describe("normalizeSwytchError", () => {
  it.each([
    ["Failed to spawn swytchcode — install it with: npm install -g swytchcode", undefined, "not_installed", false],
    ["swytchcode exec timed out after 45000ms", undefined, "timeout", true],
    ["canonical ID not found in any fetched providers", undefined, "not_enabled", false],
    ["provider not connected - run swytchcode auth connect github", { category: "auth" }, "auth", false],
    ["Blocked by policy", { category: "policy_violation" }, "policy", false],
    ["missing required param owner", { category: "validation" }, "validation", false],
    ["getaddrinfo ENOTFOUND api.github.com", undefined, "network", true],
    ["upstream returned 502", { category: "provider_error", retryable: true }, "provider", true],
    ["something odd", undefined, "unknown", false],
  ])("categorizes %j", (message, details, category, retryable) => {
    const error = normalizeSwytchError(new FakeSwytchcodeError(message, details), "GitHub");
    expect(error.category).toBe(category);
    expect(error.retryable).toBe(retryable);
  });

  it("never echoes the raw provider message", () => {
    const secret = ["xo", "xb", "FAKE", "TOKEN"].join("-");
    const error = normalizeSwytchError(new FakeSwytchcodeError(`invalid_auth token=${secret}`), "Slack");
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(error.message).toBe("The Slack connection in Swytchcode needs attention.");
  });

  // Real stderr captured from swytchcode 2.23.5 via @swytchcode/runtime: notices
  // precede the classified JSON line and mention `swytchcode login`.
  const realNotConfigured = [
    "Telemetry is disabled. Run `swytchcode login` or set SWYTCHCODE_TOKEN to enable usage tracking.",
    "Fetching github......",
    "running in demo mode (github.issue.get.1 not added yet)",
    '{"error":"tool \\"github.issue.get.1\\" is not configured in this project\'s tooling.json. Run: swytchcode get github && swytchcode add github.issue.get.1","category":"not_found","suggested_action":"run: swytchcode list methods","docs_url":"https://docs.swytchcode.com/cli/tools/"}',
  ].join("\n");
  const realMissingCredentials = [
    "Telemetry is disabled. Run `swytchcode login` or set SWYTCHCODE_TOKEN to enable usage tracking.",
    "› saved Jira/jira@v1",
    '{"error":"missing credentials for Jira - run `swytchcode auth connect Jira`","category":"auth","suggested_action":"to access registry features, run: swytchcode login - local execution works without auth","reference_id":"SWY-ERR-8D4AE8"}',
    "2026/09/26 11:48:03 [swytchcode exec] failed tool=jira.api.issue.get exit_code=3",
  ].join("\n");

  it("extracts the classified error from real CLI stderr", () => {
    expect(extractClassifiedError(realNotConfigured)).toMatchObject({ category: "not_found" });
    expect(normalizeSwytchError(new Error(realNotConfigured), "GitHub").category).toBe("not_enabled");
    expect(normalizeSwytchError(new Error(realMissingCredentials), "Jira")).toEqual({
      category: "auth",
      message: "The Jira connection in Swytchcode needs attention.",
      retryable: false,
    });
  });

  it("does not mistake the telemetry login notice for an auth failure", () => {
    const providerFailure = [
      "Telemetry is disabled. Run `swytchcode login` or set SWYTCHCODE_TOKEN to enable usage tracking.",
      '{"error":"upstream returned HTTP 502","category":"provider","retryable":true}',
    ].join("\n");
    expect(normalizeSwytchError(new Error(providerFailure), "Slack")).toMatchObject({
      category: "provider",
      retryable: true,
    });
  });

  it("recognizes Slack auth error codes", () => {
    expect(normalizeSwytchError(new Error('{"error":"invalid_auth"}'), "Slack").category).toBe("auth");
  });

  it("handles non-Error throwables", () => {
    expect(normalizeSwytchError("boom", "Jira").category).toBe("unknown");
    expect(normalizeSwytchError(undefined, "Jira").message).toBe("The Jira action failed.");
  });
});

describe("tool allowlist", () => {
  it("contains exactly the four ForgeMind actions", () => {
    expect(Object.keys(SWYTCH_TOOLS).sort()).toEqual(
      ["githubListOpenIssues", "jiraCreateIssue", "jiraGetIssue", "slackPostMessage"].sort(),
    );
    expect(SWYTCH_TOOLS.jiraCreateIssue.access).toBe("write");
    expect(SWYTCH_TOOLS.slackPostMessage.access).toBe("write");
    expect(SWYTCH_TOOLS.githubListOpenIssues.access).toBe("read");
  });

  it.each(["github.repos.delete", "shell.exec", "http.get", "__proto__", "constructor", "", null, 1])(
    "rejects invented tool %j",
    (value) => {
      expect(isToolName(value)).toBe(false);
    },
  );
});

describe("RetryPolicyExecutor", () => {
  it("retries a read-only tool once on a transient failure", async () => {
    const inner = new MockSwytchExecutor({
      githubListOpenIssues: [toolError("timeout", true), { data: [] }],
    });
    const result = await new RetryPolicyExecutor(inner).execute("githubListOpenIssues", {});
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(inner.calls).toHaveLength(2);
  });

  it(`gives up on reads after ${READ_MAX_ATTEMPTS} attempts`, async () => {
    const inner = new MockSwytchExecutor({ jiraGetIssue: toolError("network", true) });
    const result = await new RetryPolicyExecutor(inner).execute("jiraGetIssue", {});
    expect(result.ok).toBe(false);
    expect(inner.calls).toHaveLength(READ_MAX_ATTEMPTS);
  });

  it("does not retry non-retryable read failures", async () => {
    const inner = new MockSwytchExecutor({ githubListOpenIssues: toolError("auth", false) });
    await new RetryPolicyExecutor(inner).execute("githubListOpenIssues", {});
    expect(inner.calls).toHaveLength(1);
  });

  it.each(["jiraCreateIssue", "slackPostMessage"] as const)(
    "never retries the %s mutation, even when the failure looks transient",
    async (tool) => {
      const inner = new MockSwytchExecutor({ [tool]: [toolError("timeout", true), { data: { ok: true } }] });
      const result = await new RetryPolicyExecutor(inner).execute(tool, {});
      expect(result.ok).toBe(false);
      expect(result.attempts).toBe(1);
      expect(inner.calls).toHaveLength(1);
    },
  );
});
