import type { ReactNode } from "react";
import {
  downstreamLead,
  outcomeLines,
  overviewMetrics,
  type CommandCenterViewModel,
  type MetricView,
} from "@/lib/presentation";
import { StatusIcon } from "@/components/ui/badge";
import { DashIcon, TriangleIcon } from "@/components/ui/icons";
import { eyebrow, toneChip, toneIcon, toneText } from "@/components/ui/tone";

type RunOverviewProps = {
  view: CommandCenterViewModel;
  /** Next actions (New task / Retry) rendered by the interactive parent. */
  actions?: ReactNode;
};

/** Thin accent along the top edge, in the run's status color. */
const ACCENT: Record<CommandCenterViewModel["tone"], string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-border-strong",
  pending: "bg-border-strong",
};

function Metric({ metric }: { metric: MetricView }) {
  const { label, value, valueTone, notes } = metric;
  return (
    <div className="flex min-w-0 flex-col gap-1 px-1 py-2 sm:px-5">
      <dt className={eyebrow}>{label}</dt>
      <dd className="flex min-h-10 items-center">
        {valueTone ? (
          <span className={`inline-flex items-center gap-2 text-h1 ${toneText[valueTone]}`}>
            <StatusIcon tone={valueTone} className={`size-5 ${toneIcon[valueTone]}`} />
            {value}
          </span>
        ) : (
          <span className="text-[2.25rem] leading-[2.5rem] font-semibold tracking-[-0.02em] text-foreground tabular-nums">{value}</span>
        )}
      </dd>
      {notes.length > 0 && (
        <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption tabular-nums">
          {notes.map((note, index) => (
            <span
              key={`${index}-${note.text}`}
              title={note.mono ? note.text : undefined}
              className={`${note.mono ? "max-w-full truncate font-mono text-mono" : ""} ${
                note.tone === "neutral" ? "text-foreground-muted" : `font-medium ${toneText[note.tone]}`
              }`}
            >
              {(note.tone !== "neutral" || note.status) && (
                <StatusIcon tone={note.tone} className={`mr-1 inline size-3.5 align-text-bottom ${toneIcon[note.tone]}`} />
              )}
              {note.text}
            </span>
          ))}
        </dd>
      )}
    </div>
  );
}

/**
 * The outcome, in plain language first: headline, what happened (from the
 * run's own counters), then four large metrics. Run ID, timings and the raw
 * log live in Advanced execution details.
 */
export function RunOverview({ view, actions }: RunOverviewProps) {
  const metrics = overviewMetrics(view);
  const lines = outcomeLines(view);
  const lead = downstreamLead(view);

  return (
    <section
      aria-labelledby="overview-heading"
      className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-raised motion-safe:animate-reveal-slow"
    >
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${ACCENT[view.tone]}`} />

      <div className="flex flex-col gap-5 p-4 pt-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="flex min-w-0 gap-4">
          <span className={`grid size-11 shrink-0 place-items-center rounded-lg border ${toneChip[view.tone]}`}>
            <StatusIcon tone={view.tone} className={`size-6 ${toneIcon[view.tone]}`} />
          </span>
          <div className="min-w-0">
            <p id="overview-heading" className={eyebrow}>
              Run result
            </p>
            <h2 className="mt-1 text-display text-foreground">{view.headline}</h2>
            <p className={`mt-1 text-body font-medium ${toneText[view.tone]}`}>{view.stateText}</p>

            {lines.length > 0 && (
              <ul aria-label="What ForgeMind did" className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {lines.map((line) => (
                  <li key={line.text} className="flex items-center gap-2 text-body text-foreground">
                    <StatusIcon tone={line.tone} className={`size-4 ${toneIcon[line.tone]}`} />
                    {line.text}
                  </li>
                ))}
              </ul>
            )}

            {view.summary && (
              <p className="mt-4 max-w-4xl text-body-sm break-words text-foreground-secondary">{view.summary}</p>
            )}

            {view.errors.length > 0 && (
              <ul aria-label="What failed" className="mt-3 space-y-1">
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
              <p className="mt-3 flex gap-2 text-body-sm">
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
              <p className="mt-3 flex max-w-4xl gap-2 text-body-sm">
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

        {actions && <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">{actions}</div>}
      </div>

      <dl
        aria-label="Run metrics"
        className="grid grid-cols-2 gap-y-2 border-t border-border px-4 py-3 sm:px-1 lg:grid-cols-4 lg:divide-x lg:divide-border"
      >
        {metrics.map((metric) => (
          <Metric key={metric.key} metric={metric} />
        ))}
      </dl>
    </section>
  );
}
