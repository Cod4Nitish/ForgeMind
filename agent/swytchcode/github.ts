import { z } from "zod";
import type { GitHubRepository } from "../config";
import { unwrapPayload } from "./payload";
import type { SwytchToolInput } from "./types";

export const MAX_ISSUES = 30;
const MAX_TITLE = 300;
const MAX_BODY = 2000;

/** A GitHub issue as ForgeMind keeps it: small, typed, and length-bounded. */
export const GitHubIssueSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string().max(MAX_TITLE),
    body: z.string().max(MAX_BODY),
    url: z.string().max(500),
    labels: z.array(z.string().max(100)).max(20),
  })
  .strict();
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;

/** Input for listing open issues — repository comes from trusted config only. */
export function buildListIssuesInput(repo: GitHubRepository): SwytchToolInput {
  return {
    params: {
      owner: repo.owner,
      repo: repo.name,
      state: "open",
      per_page: String(MAX_ISSUES),
    },
  };
}

const RawIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullish(),
  html_url: z.string().optional(),
  labels: z
    .array(z.union([z.string(), z.object({ name: z.string().nullish() }).passthrough()]))
    .optional(),
  pull_request: z.unknown().optional(),
  state: z.string().optional(),
});

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export type ParsedIssues =
  | { ok: true; issues: GitHubIssue[]; skipped: number }
  | { ok: false };

/**
 * Normalizes the GitHub "list issues" response. Pull requests (which GitHub's
 * issues API also returns) and malformed entries are skipped; a response that
 * is not a list at all is rejected.
 */
export function parseGitHubIssues(raw: unknown, repo: GitHubRepository): ParsedIssues {
  const list = unwrapPayload(raw, (v): v is unknown[] => Array.isArray(v));
  if (!list) return { ok: false };

  const issues: GitHubIssue[] = [];
  const seen = new Set<number>();
  let skipped = 0;
  for (const entry of list) {
    const parsed = RawIssueSchema.safeParse(entry);
    if (!parsed.success || parsed.data.pull_request !== undefined || seen.has(parsed.data.number)) {
      skipped++;
      continue;
    }
    if (parsed.data.state && parsed.data.state !== "open") {
      skipped++;
      continue;
    }
    const issue = parsed.data;
    seen.add(issue.number);
    issues.push({
      number: issue.number,
      title: truncate(issue.title, MAX_TITLE),
      body: truncate(issue.body ?? "", MAX_BODY),
      // Built from trusted config, not from the response, so a crafted
      // payload cannot point users at an arbitrary link.
      url: `https://github.com/${repo.owner}/${repo.name}/issues/${issue.number}`,
      labels: (issue.labels ?? [])
        .map((label) => (typeof label === "string" ? label : (label.name ?? "")))
        .filter(Boolean)
        .slice(0, 20)
        .map((label) => truncate(label, 100)),
    });
    if (issues.length >= MAX_ISSUES) break;
  }
  return { ok: true, issues, skipped };
}
