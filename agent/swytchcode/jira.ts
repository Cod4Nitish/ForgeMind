import type { GitHubRepository } from "../config";
import type { JiraTaskDraft } from "../schemas";
import { isRecord, unwrapPayload } from "./payload";
import type { SwytchToolInput } from "./types";

const MAX_SUMMARY = 255;

type AdfText = { type: "text"; text: string; marks?: { type: "link"; attrs: { href: string } }[] };
type AdfParagraph = { type: "paragraph"; content: AdfText[] };
type AdfNode =
  | AdfParagraph
  | { type: "heading"; attrs: { level: number }; content: AdfText[] }
  | { type: "bulletList"; content: { type: "listItem"; content: AdfParagraph[] }[] };

const text = (value: string): AdfText => ({ type: "text", text: value.trim() || "-" });
const paragraph = (...content: AdfText[]): AdfParagraph => ({ type: "paragraph", content });

export function jiraSummary(draft: JiraTaskDraft): string {
  const summary = `[GH #${draft.sourceIssue}] ${draft.summary}`.replace(/\s+/g, " ").trim();
  return summary.length > MAX_SUMMARY ? `${summary.slice(0, MAX_SUMMARY - 1)}…` : summary;
}

/**
 * Jira REST v3 (`jira.api.issue.create`) requires the description in
 * Atlassian Document Format. The source link is built from trusted config.
 */
export function buildIssueDescription(draft: JiraTaskDraft, repo: GitHubRepository, runId: string) {
  const sourceUrl = `https://github.com/${repo.owner}/${repo.name}/issues/${draft.sourceIssue}`;
  const content: AdfNode[] = [
    paragraph(text(draft.description)),
    paragraph(text(`ForgeMind priority assessment: ${draft.priority}`)),
    { type: "heading", attrs: { level: 3 }, content: [text("Acceptance criteria")] },
    {
      type: "bulletList",
      content: draft.acceptanceCriteria.map((criterion) => ({
        type: "listItem" as const,
        content: [paragraph(text(criterion))],
      })),
    },
    paragraph(text("Source: "), {
      type: "text",
      text: `${repo.owner}/${repo.name}#${draft.sourceIssue}`,
      marks: [{ type: "link", attrs: { href: sourceUrl } }],
    }),
    paragraph(text(`Created by ForgeMind (run ${runId}).`)),
  ];
  return { type: "doc", version: 1, content };
}

/** Destination (project, issue type) comes only from trusted configuration. */
export function buildCreateIssueInput(
  draft: JiraTaskDraft,
  projectKey: string,
  repo: GitHubRepository,
  runId: string,
): SwytchToolInput {
  return {
    body: {
      fields: {
        project: { key: projectKey },
        issuetype: { name: "Task" },
        summary: jiraSummary(draft),
        description: buildIssueDescription(draft, repo, runId),
      },
    },
  };
}

type CreatedIssue = { key: string; id?: string };

const isCreatedIssue = (value: unknown): value is CreatedIssue =>
  isRecord(value) && typeof value.key === "string";

/**
 * Extracts the created key. It must look like a Jira key in the configured
 * project; anything else is "unconfirmed", never assumed created.
 */
export function parseCreatedIssue(raw: unknown, projectKey: string): { key: string } | undefined {
  const created = unwrapPayload(raw, isCreatedIssue);
  if (!created) return undefined;
  const key = created.key.trim().toUpperCase();
  return new RegExp(`^${projectKey}-\\d+$`).test(key) ? { key } : undefined;
}

export function buildGetIssueInput(key: string): SwytchToolInput {
  return { params: { issueIdOrKey: key, fields: "summary,status,project" } };
}

type IssueBean = { key: string; fields?: { project?: { key?: string } } };
const isIssueBean = (value: unknown): value is IssueBean => isRecord(value) && typeof value.key === "string";

/** Verified only when Jira returns the same key in the configured project. */
export function isVerifiedIssue(raw: unknown, key: string, projectKey: string): boolean {
  const issue = unwrapPayload(raw, isIssueBean);
  if (!issue || issue.key.toUpperCase() !== key.toUpperCase()) return false;
  const project = issue.fields?.project?.key;
  return project === undefined || project.toUpperCase() === projectKey;
}
