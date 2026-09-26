import { isRecord, unwrapPayload } from "./payload";
import type { SwytchError, SwytchToolInput } from "./types";

/**
 * Escapes Slack mrkdwn control characters. Neutralizes mentions such as
 * <!channel> / <@U123> and disguised links <http://evil|click> that could
 * arrive via issue titles or model-written text.
 */
export function escapeSlack(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type SlackMessageFacts = {
  repository: string;
  headline?: string;
  issuesReviewed: number;
  actionable: { number: number; severity: string; title: string; jiraKey?: string; jiraFailed: boolean }[];
  jiraCreated: number;
  jiraFailed: number;
  jiraRequested: boolean;
  runId: string;
};

const MAX_TEXT = 3500;

/** The message is assembled from recorded results, so it cannot overstate what happened. */
export function buildSlackMessage(facts: SlackMessageFacts): string {
  const lines: string[] = [`*ForgeMind engineering triage* — ${escapeSlack(facts.repository)}`];
  if (facts.headline) lines.push(escapeSlack(facts.headline));
  lines.push("", `${facts.actionable.length} actionable of ${facts.issuesReviewed} open issue(s) reviewed.`);

  for (const issue of facts.actionable) {
    const title = escapeSlack(issue.title.length > 120 ? `${issue.title.slice(0, 119)}…` : issue.title);
    const tracking = issue.jiraKey ? ` → ${escapeSlack(issue.jiraKey)}` : issue.jiraFailed ? " → Jira task creation failed" : "";
    lines.push(`• #${issue.number} ${title} — ${issue.severity.toUpperCase()}${tracking}`);
  }

  if (facts.jiraRequested) {
    const total = facts.jiraCreated + facts.jiraFailed;
    lines.push(
      "",
      facts.jiraFailed > 0
        ? `Jira: ${facts.jiraCreated} of ${total} task(s) created, ${facts.jiraFailed} failed.`
        : `Jira: ${facts.jiraCreated} task(s) created.`,
    );
  }
  lines.push(`Run: ${escapeSlack(facts.runId)}`);

  const text = lines.join("\n");
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

/** Channel comes only from trusted configuration. */
export function buildPostMessageInput(channel: string, text: string): SwytchToolInput {
  return { body: { channel, text, unfurl_links: false, unfurl_media: false } };
}

type SlackResponse = { ok: boolean; error?: string; ts?: string };
const isSlackResponse = (value: unknown): value is SlackResponse =>
  isRecord(value) && typeof value.ok === "boolean";

const SLACK_ERRORS: Record<string, string> = {
  channel_not_found: "The configured Slack channel was not found.",
  not_in_channel: "The Slack app is not a member of the configured channel.",
  is_archived: "The configured Slack channel is archived.",
  ratelimited: "Slack rate-limited the notification.",
  invalid_auth: "The Slack connection in Swytchcode needs attention.",
  not_authed: "The Slack connection in Swytchcode needs attention.",
  token_revoked: "The Slack connection in Swytchcode needs attention.",
  missing_scope: "The Slack connection lacks permission to post messages.",
};

/**
 * Slack reports most failures as HTTP 200 with `ok: false`, so a successful
 * tool execution is not proof the message was delivered.
 */
export function parseSlackResponse(raw: unknown): { ok: true; ts?: string } | { ok: false; error: SwytchError } {
  const response = unwrapPayload(raw, isSlackResponse);
  if (!response) {
    return { ok: false, error: { category: "invalid_response", message: "Slack returned data in an unexpected format.", retryable: false } };
  }
  if (response.ok) return { ok: true, ts: typeof response.ts === "string" ? response.ts : undefined };
  const code = typeof response.error === "string" ? response.error : "";
  return {
    ok: false,
    error: {
      category: code.includes("auth") || code === "token_revoked" ? "auth" : "provider",
      message: SLACK_ERRORS[code] ?? "Slack rejected the notification.",
      retryable: false,
    },
  };
}
