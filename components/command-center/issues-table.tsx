import { joinIssueActions, type CommandCenterViewModel, type IssueActionView, type IssueView } from "@/lib/presentation";
import { SeverityBadge, StatusText } from "@/components/ui/badge";
import { ExternalIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { useScrollable } from "@/components/ui/use-scrollable";

/*
 * No "use client" directive: only imported by the interactive CommandCenter,
 * so it already lives in the client graph (it measures its scroll region).
 */

type IssuesTableProps = {
  view: Pick<CommandCenterViewModel, "issues" | "jiraTasks" | "stages" | "repository" | "metrics" | "issuesEmptyText">;
};

const th = "border-b border-border-strong bg-surface px-3 py-2 text-left align-bottom text-label font-medium text-foreground-muted uppercase";
const td = "h-10 border-b border-border px-3 py-1 align-middle";

/**
 * "#n title", clamped to two lines. The clamp lives on the text itself, never
 * on an ancestor of the link, so the link's focus ring is never clipped; the
 * new-tab icon sits outside the clamped text so it is never cut off.
 */
function IssueTitle({ issue }: { issue: IssueView }) {
  const text = (
    <span className="line-clamp-2 min-w-0 break-words">
      <span className="mr-2 font-mono text-mono text-foreground-secondary">#{issue.number}</span>
      {issue.title}
    </span>
  );
  if (!issue.url) {
    return (
      <p title={issue.title} className="flex text-foreground">
        {text}
      </p>
    );
  }
  return (
    <p className="flex">
      <a
        title={issue.title}
        href={issue.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 items-start gap-1 rounded-xs text-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
      >
        {text}
        <span className="flex h-5 shrink-0 items-center">
          <ExternalIcon className="size-3.5 text-foreground-muted" />
        </span>
        <span className="sr-only"> (opens GitHub in a new tab)</span>
      </a>
    </p>
  );
}

/**
 * The Jira outcome for one issue. `bare` drops the screen-reader "Jira task"
 * context where a visible "Jira" prefix already provides it.
 */
function Action({ action, bare = false }: { action: IssueActionView; bare?: boolean }) {
  switch (action.kind) {
    case "key":
      return (
        <span className="font-mono text-mono font-medium text-foreground">
          {!bare && <span className="sr-only">Jira task </span>}
          {action.key}
        </span>
      );
    case "none":
      return (
        <span className="text-foreground-muted">
          <span aria-hidden="true">—</span>
          <span className="sr-only">{bare ? "none" : action.label}</span>
        </span>
      );
    default:
      return <StatusText tone={action.tone} label={action.label} />;
  }
}

/**
 * Compact GitHub issue table: Issue | Severity | Impact | Decision | Action.
 * Titles are untrusted third-party text — plain text links only. On sm+ it
 * scrolls internally (sticky header) beyond ~12 rows; on phones the rows stay
 * in the page flow so touch scrolling is never trapped. Impact gets its own
 * column only where the table is wide enough (2xl); elsewhere it is shown
 * under the title so neither is cut to a few characters.
 */
export function IssuesTable({ view }: IssuesTableProps) {
  const rows = joinIssueActions(view);
  const { issuesReviewed, actionableIssues } = view.metrics;
  const [regionRef, scrollable] = useScrollable<HTMLDivElement>();

  return (
    <Panel
      headingId="issues-heading"
      title="Decisions & actions"
      aside={
        <p className="flex flex-wrap items-center gap-x-2 text-caption text-foreground-muted">
          {view.repository && <span className="font-mono text-mono break-all text-foreground-secondary">{view.repository}</span>}
          <span className="tabular-nums">
            {issuesReviewed} reviewed · {actionableIssues} actionable
          </span>
        </p>
      }
    >
      {rows.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border px-3 py-3 text-body-sm text-foreground-secondary">
          {view.issuesEmptyText}
        </p>
      ) : (
        <div
          ref={regionRef}
          // A focusable, named region only while there is something to scroll.
          role={scrollable ? "region" : undefined}
          aria-label={scrollable ? "GitHub issues table" : undefined}
          tabIndex={scrollable ? 0 : undefined}
          // scroll-pt-10 keeps focused rows clear of the sticky header.
          className="scroll-region mt-3 scroll-pt-10 rounded-md sm:max-h-120"
        >
          <table className="w-full table-fixed border-separate border-spacing-0 text-body-sm">
            <caption className="sr-only">
              GitHub issues reviewed by ForgeMind, with severity, impact, the agent&apos;s decision and the resulting Jira
              action
            </caption>
            <thead className="sticky top-0 z-10">
              <tr>
                <th scope="col" className={th}>
                  Issue
                </th>
                <th scope="col" className={`${th} hidden w-28 sm:table-cell`}>
                  Severity
                </th>
                <th scope="col" className={`${th} hidden w-32 2xl:table-cell`}>
                  Impact
                </th>
                <th scope="col" className={`${th} hidden w-32 sm:table-cell`}>
                  Decision
                </th>
                <th scope="col" className={`${th} hidden w-30 sm:table-cell`}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ issue, action }) => (
                <tr key={issue.number} className="transition-colors hover:bg-surface-hover">
                  <td className={td}>
                    <IssueTitle issue={issue} />
                    {/* xs: the other columns collapse into one meta row. */}
                    <div className="mt-2 mb-1 flex flex-wrap items-center gap-x-3 gap-y-2 sm:hidden">
                      <SeverityBadge tone={issue.severityTone} label={issue.severityLabel} />
                      <StatusText tone={issue.decisionTone} label={issue.decisionLabel} />
                      <span className="text-caption text-foreground-muted">
                        Jira <Action action={action} bare />
                      </span>
                    </div>
                    {issue.impact && (
                      <p className="mt-1 mb-1 text-caption break-words text-foreground-muted 2xl:hidden">
                        <span className="font-medium">Impact:</span> {issue.impact}
                      </p>
                    )}
                  </td>
                  <td className={`${td} hidden sm:table-cell`}>
                    <SeverityBadge tone={issue.severityTone} label={issue.severityLabel} />
                  </td>
                  <td className={`${td} hidden text-foreground-secondary 2xl:table-cell`}>
                    <p title={issue.impact || undefined} className="line-clamp-2 break-words">
                      {issue.impact || "—"}
                    </p>
                  </td>
                  <td className={`${td} hidden sm:table-cell`}>
                    <div className="flex min-h-6 items-center">
                      <StatusText tone={issue.decisionTone} label={issue.decisionLabel} />
                    </div>
                  </td>
                  <td className={`${td} hidden sm:table-cell`}>
                    <div className="flex min-h-6 items-center">
                      <Action action={action} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
