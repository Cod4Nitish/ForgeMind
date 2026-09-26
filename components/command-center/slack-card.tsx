import { NOTHING_ACTIONABLE_TEXT, type CommandCenterViewModel } from "@/lib/presentation";
import { StatusText } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { SkippedNote } from "./jira-list";

/** Slack outcome exactly as reported by the run — never assumed. */
export function SlackCard({ view }: { view: Pick<CommandCenterViewModel, "slack" | "isEmpty"> }) {
  const { slack } = view;
  const skipped = slack.status === "skipped";

  return (
    <Panel
      headingId="slack-heading"
      title="Slack notification"
      aside={<StatusText tone={slack.tone} label={slack.statusLabel} />}
    >
      {skipped ? (
        <SkippedNote
          headline={view.isEmpty ? NOTHING_ACTIONABLE_TEXT : slack.headline}
          detail={slack.reason ?? slack.message}
        />
      ) : (
        <dl className="mt-3 space-y-2 text-body-sm">
          {slack.channel && (
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="text-caption text-foreground-muted">Channel</dt>
              <dd className="font-mono text-mono break-all text-foreground">{slack.channel}</dd>
            </div>
          )}
          <div className="flex flex-wrap items-baseline gap-x-3">
            <dt className="text-caption text-foreground-muted">Outcome</dt>
            <dd className="font-medium text-foreground">{slack.headline}</dd>
          </div>
          {(slack.message || slack.reason) && (
            <div>
              <dt className="sr-only">Details</dt>
              {slack.message && <dd className="break-words text-foreground-secondary">{slack.message}</dd>}
              {slack.reason && <dd className="break-words text-foreground-muted">{slack.reason}</dd>}
            </div>
          )}
          {slack.jiraNote && (
            <div>
              <dt className="sr-only">Jira</dt>
              <dd className="break-words font-medium text-foreground">{slack.jiraNote}</dd>
            </div>
          )}
        </dl>
      )}
    </Panel>
  );
}
