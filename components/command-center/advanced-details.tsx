import type { CommandCenterViewModel } from "@/lib/presentation";
import { ChevronDownIcon } from "@/components/ui/icons";
import { eyebrow } from "@/components/ui/tone";
import { ExecutionLog } from "./execution-log";
import { JiraList } from "./jira-list";
import { SlackCard } from "./slack-card";

/*
 * No "use client" directive: only imported by the interactive CommandCenter,
 * so it already lives in the client graph.
 */

function formatTime(iso: string): string | undefined {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC") : undefined;
}

function Meta({ label, value, mono = false }: { label: string; value?: string | number; mono?: boolean }) {
  if (value === undefined || value === "") return null;
  return (
    <div className="min-w-0">
      <dt className={eyebrow}>{label}</dt>
      <dd className={`mt-1 break-all text-foreground ${mono ? "font-mono text-mono" : "text-body-sm"}`}>{value}</dd>
    </div>
  );
}

/**
 * Everything a developer may want and a first-time viewer does not need:
 * run metadata, the agent's reasoning summary, every execution event with its
 * Swytchcode tool ID, and the per-integration Jira / Slack records.
 * Collapsed by default (native <details>, keyboard and screen-reader friendly).
 */
export function AdvancedDetails({ view }: { view: CommandCenterViewModel }) {
  const tools = [...new Set(view.timeline.flatMap((event) => (event.tool ? [event.tool] : [])))];

  return (
    <details className="group rounded-xl border border-border bg-surface shadow-panel">
      <summary className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-4 transition-colors select-none hover:bg-surface-hover sm:px-5">
        <span className="min-w-0 flex-1">
          <span className="block text-h2 text-foreground">Advanced execution details</span>
          <span className="block text-caption text-foreground-muted">
            Run ID, timings, tools used, the full event log and integration records
          </span>
        </span>
        <ChevronDownIcon className="size-5 shrink-0 text-foreground-muted transition-transform duration-base group-open:rotate-180" />
      </summary>

      <div className="space-y-4 border-t border-border p-4 sm:p-5">
        <dl className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface-elevated p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Run ID" value={view.runId} mono />
          <Meta label="Duration" value={view.durationLabel} mono />
          <Meta label="Started" value={formatTime(view.startedAt)} mono />
          <Meta label="Finished" value={formatTime(view.finishedAt)} mono />
          <Meta label="Repository" value={view.repository} mono />
          <Meta label="Execution events" value={view.timeline.length} mono />
          <Meta label="Status" value={view.statusLabel} />
          {tools.length > 0 && (
            <div className="min-w-0 sm:col-span-2 lg:col-span-4">
              <dt className={eyebrow}>Swytchcode tools used</dt>
              <dd className="mt-1 flex flex-wrap gap-2">
                {tools.map((tool) => (
                  <code
                    key={tool}
                    className="rounded-xs border border-border bg-surface px-1.5 py-0.5 font-mono text-mono break-all text-foreground-secondary"
                  >
                    {tool}
                  </code>
                ))}
              </dd>
            </div>
          )}
        </dl>

        <div className="grid items-start gap-4 lg:grid-cols-12">
          <ExecutionLog view={view} className="lg:col-span-7" />
          <div className="space-y-4 lg:col-span-5">
            <JiraList view={view} />
            <SlackCard view={view} />
          </div>
        </div>
      </div>
    </details>
  );
}
