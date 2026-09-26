/**
 * The complete set of external actions ForgeMind can take. Graph nodes refer
 * to tools by these fixed names; the reasoning model never supplies a tool
 * name or canonical ID, so it cannot invent a tool, call an arbitrary URL, or
 * reach anything outside this list.
 *
 * Canonical IDs are taken from the fetched provider bundles
 * (.swytchcode/integrations: GitHub.github@1.1.4, Jira.jira@v1,
 * Slack.slack@1.7.0) and enabled in .swytchcode/tooling.json with
 * `swytchcode add method <id>`. The Swytchcode kernel refuses anything that is
 * not enabled there — the second trust boundary.
 */
export const SWYTCH_TOOLS = {
  /** GET /repos/{owner}/{repo}/issues — owner/repo (path), state/per_page (query). */
  githubListOpenIssues: {
    canonicalId: "github.issue.get1",
    provider: "GitHub",
    access: "read",
  },
  /** POST /rest/api/3/issue — body: { fields }; description is Atlassian Document Format. */
  jiraCreateIssue: {
    canonicalId: "jira.api.issue.create",
    provider: "Jira",
    access: "write",
  },
  /** GET /rest/api/3/issue/{issueIdOrKey} — issueIdOrKey (path), fields (query). */
  jiraGetIssue: {
    canonicalId: "jira.api.issue.get",
    provider: "Jira",
    access: "read",
  },
  /** POST /chat.postMessage — body: { channel, text }; the token header is injected by Swytchcode. */
  slackPostMessage: {
    canonicalId: "slack.chat.postmessage.create",
    provider: "Slack",
    access: "write",
  },
} as const;

export type ToolName = keyof typeof SWYTCH_TOOLS;
export type ToolAccess = (typeof SWYTCH_TOOLS)[ToolName]["access"];

export function isToolName(value: unknown): value is ToolName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SWYTCH_TOOLS, value);
}
