import {
  NOTHING_ACTIONABLE_TEXT,
  jiraOutcomeCounts,
  jiraProjectFromKey,
  type CommandCenterViewModel,
  type JiraTaskView,
} from "@/lib/presentation";
import { StatusIcon, StatusText } from "@/components/ui/badge";
import { DashIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { toneIcon, toneText } from "@/components/ui/tone";

type JiraListProps = {
  view: Pick<CommandCenterViewModel, "jiraTasks" | "jiraEmptyText" | "isEmpty" | "metrics">;
};

/** Failed / unconfirmed rows are clearly marked; created rows stay neutral. */
function rowSurface(task: JiraTaskView): string {
  if (task.status === "failed") return "border-danger-border bg-danger-background";
  if (task.status === "unconfirmed") return "border-warning-border bg-warning-background";
  return "border-border bg-surface-elevated";
}

/** Skipped / empty explanation shared by the Jira and Slack cards. */
export function SkippedNote({ headline, detail }: { headline: string; detail?: string }) {
  return (
    <div className="mt-3 flex gap-2 rounded-md border border-dashed border-border p-3">
      <span className="flex h-5 shrink-0 items-center">
        <DashIcon className="size-4 text-foreground-muted" />
      </span>
      <div className="min-w-0 text-body-sm">
        <p className="font-medium text-foreground-secondary">{headline}</p>
        {detail && detail !== headline && <p className="mt-1 break-words text-foreground-muted">{detail}</p>}
      </div>
    </div>
  );
}

/**
 * Jira outcomes, only as returned: Project (from the actual key prefix) ·
 * Key · Title · Status (+ verification).
 */
export function JiraList({ view }: JiraListProps) {
  const counts = jiraOutcomeCounts(view);
  const tasks = view.jiraTasks;

  return (
    <Panel
      headingId="jira-heading"
      title="Jira tasks"
      aside={
        <p className="flex flex-wrap gap-x-2 text-caption text-foreground-muted tabular-nums">
          <span>{counts.created} created</span>
          {counts.failed > 0 && (
            <span className={`font-medium ${toneText.danger}`}>
              <StatusIcon tone="danger" className={`mr-1 inline size-3.5 align-text-bottom ${toneIcon.danger}`} />
              {counts.failed} failed
            </span>
          )}
          {counts.unconfirmed > 0 && (
            <span className={`font-medium ${toneText.warning}`}>
              <StatusIcon tone="warning" className={`mr-1 inline size-3.5 align-text-bottom ${toneIcon.warning}`} />
              {counts.unconfirmed} unconfirmed
            </span>
          )}
        </p>
      }
    >
      {tasks.length === 0 ? (
        view.isEmpty ? (
          <SkippedNote headline={NOTHING_ACTIONABLE_TEXT} detail={view.jiraEmptyText} />
        ) : (
          <SkippedNote headline={view.jiraEmptyText ?? "No Jira tasks were created."} />
        )
      ) : (
        <ul className="mt-3 space-y-2">
          {tasks.map((task) => {
            const project = jiraProjectFromKey(task.key);
            return (
              <li key={task.id} className={`rounded-md border p-3 ${rowSurface(task)}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {task.key && <span className="font-mono text-mono font-medium text-foreground">{task.key}</span>}
                      <span className="text-body-sm break-words text-foreground">{task.title}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-caption text-foreground-muted">
                      {project && (
                        <span>
                          Project <span className="font-mono text-mono text-foreground-secondary">{project}</span>
                        </span>
                      )}
                      <span>
                        From <span className="font-mono text-mono text-foreground-secondary">#{task.sourceIssue}</span>
                      </span>
                      {task.priority && <span>{task.priority} priority</span>}
                    </p>
                    {task.message && (
                      <p className="mt-1 text-body-sm break-words text-foreground-secondary">{task.message}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <StatusText tone={task.tone} label={task.statusLabel} />
                    {task.verificationLabel && task.verificationTone && (
                      <StatusText tone={task.verificationTone} label={task.verificationLabel} />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
