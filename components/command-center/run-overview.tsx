import type { ReactNode } from "react";
import { downstreamLead, overviewMetrics, type CommandCenterViewModel } from "@/lib/presentation";
import { StatusIcon } from "@/components/ui/badge";
import { DashIcon, TriangleIcon } from "@/components/ui/icons";
import { Metric } from "@/components/ui/metric";
import { eyebrow, toneChip, toneIcon, toneSurface, toneText } from "@/components/ui/tone";

type RunOverviewProps = {
  view: CommandCenterViewModel;
  /** Next actions (New task / Retry) rendered by the interactive parent. */
  actions?: ReactNode;
};

/**
 * After a run: a status banner (headline, exact state text, server summary,
 * what failed, retry safety, duration, run ID, next actions) and four metrics.
 */
export function RunOverview({ view, actions }: RunOverviewProps) {
  const metrics = overviewMetrics(view);
  const lead = downstreamLead(view);

  return (
    <section aria-labelledby="overview-heading" className="space-y-3 motion-safe:animate-reveal-slow">
      <div className={`rounded-lg border p-4 shadow-panel sm:p-5 ${toneSurface[view.tone]}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          <div className="flex min-w-0 gap-3 lg:flex-1">
            <span className={`grid size-8 shrink-0 place-items-center rounded-md border ${toneChip[view.tone]}`}>
              <StatusIcon tone={view.tone} className={`size-4 ${toneIcon[view.tone]}`} />
            </span>
            <div className="min-w-0">
              <h2 id="overview-heading" className={eyebrow}>
                Run overview
              </h2>
              <h3 className="mt-1 text-h2 text-foreground">{view.headline}</h3>
              <p className={`mt-1 text-body font-medium ${toneText[view.tone]}`}>{view.stateText}</p>
              {view.summary && (
                <p className="mt-2 max-w-4xl text-body-sm break-words text-foreground-secondary">{view.summary}</p>
              )}

              {view.errors.length > 0 && (
                <ul aria-label="What failed" className="mt-2 space-y-1">
                  {view.errors.map((error) => (
                    <li key={error.id} className="flex gap-2 text-body-sm break-words">
                      <span className="flex h-5 shrink-0 items-center">
                        <StatusIcon tone="danger" className="size-4 text-danger" />
                      </span>
                      <span className="text-foreground-secondary">
                        <span className="font-medium text-foreground">{error.stageLabel}:</span> {error.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {view.sideEffectsNote && (
                <p className="mt-2 flex gap-2 text-body-sm">
                  <span className="flex h-5 shrink-0 items-center">
                    <DashIcon className="size-4 text-foreground-muted" />
                  </span>
                  <span className="text-foreground-secondary">
                    {lead && <span className="font-medium text-foreground">{lead} </span>}
                    {view.sideEffectsNote}
                  </span>
                </p>
              )}

              {view.retryNote && (
                <p className="mt-2 flex max-w-4xl gap-2 text-body-sm">
                  <span className="flex h-5 shrink-0 items-center">
                    <TriangleIcon className="size-4 text-warning" />
                  </span>
                  <span className="text-foreground-secondary">
                    <span className="font-medium text-warning-foreground">Duplicate risk.</span> {view.retryNote}
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3 lg:items-end">
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-caption lg:justify-end">
              {view.durationLabel && (
                <div className="flex items-baseline gap-2">
                  <dt className="text-foreground-muted">Duration</dt>
                  <dd className="font-mono text-mono text-foreground tabular-nums">{view.durationLabel}</dd>
                </div>
              )}
              {view.runId && (
                <div className="flex min-w-0 items-baseline gap-2">
                  <dt className="text-foreground-muted">Run ID</dt>
                  <dd className="font-mono text-mono break-all text-foreground-secondary">{view.runId}</dd>
                </div>
              )}
            </dl>
            {actions && <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div>}
          </div>
        </div>
      </div>

      <dl aria-label="Run metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Metric key={metric.key} metric={metric} />
        ))}
      </dl>
    </section>
  );
}
