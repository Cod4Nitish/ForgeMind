import type { ReactNode } from "react";
import { STATE_TEXT, errorTone, type ApiErrorView } from "@/lib/presentation";
import { Chip, StatusIcon } from "@/components/ui/badge";
import { DotIcon } from "@/components/ui/icons";
import { eyebrow, panelSurface, toneChip, toneIcon, toneSurface } from "@/components/ui/tone";

/** IDLE — quiet invitation; never visually dominant. */
export function IdleState() {
  return (
    <section aria-labelledby="overview-heading" className="rounded-lg border border-dashed border-border p-4 sm:p-5">
      <h2 id="overview-heading" className={eyebrow}>
        Run overview
      </h2>
      <p className="mt-1 text-h3 text-foreground">{STATE_TEXT.idle}</p>
      <p className="mt-1 text-body-sm text-foreground-secondary">
        ForgeMind inspects GitHub issues, creates Jira tasks for actionable work and notifies your team in Slack —
        describe a task above and select Execute.
      </p>
    </section>
  );
}

/**
 * RUNNING — a single calm banner. The response is not streamed, so there is
 * no fake per-step progress, timer or invented event.
 */
export function RunningState({ retry }: { retry: boolean }) {
  return (
    <section aria-labelledby="overview-heading" aria-busy="true" className={`${panelSurface} p-4 sm:p-5`}>
      <div className="flex gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-primary bg-primary-subtle text-primary">
          <DotIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 id="overview-heading" className={eyebrow}>
            Run overview
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-h2 text-foreground">{STATE_TEXT.running}</span>
            {retry && <Chip>New execution</Chip>}
          </p>
          <p className="mt-1 text-body-sm text-foreground-secondary">
            The complete, real execution log appears when the run finishes.
          </p>
        </div>
      </div>
    </section>
  );
}

/** FAILED before a usable result (HTTP / network). Fixed, safe wording — no stack traces. */
export function RequestErrorState({ error, actions }: { error: ApiErrorView; actions?: ReactNode }) {
  const tone = errorTone(error);
  return (
    <section
      aria-labelledby="overview-heading"
      className={`rounded-lg border p-4 shadow-panel motion-safe:animate-reveal sm:p-5 ${toneSurface[tone]}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="flex min-w-0 gap-3">
          <span className={`grid size-8 shrink-0 place-items-center rounded-md border ${toneChip[tone]}`}>
            <StatusIcon tone={tone} className={`size-4 ${toneIcon[tone]}`} />
          </span>
          <div className="min-w-0">
            <h2 id="overview-heading" className={eyebrow}>
              Run overview
            </h2>
            <h3 className="mt-1 text-h2 text-foreground">{error.title}</h3>
            <p className="mt-1 text-body font-medium break-words text-foreground">{error.message}</p>
            {error.note && <p className="mt-2 max-w-3xl text-body-sm text-foreground-secondary">{error.note}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-3 lg:items-end">
          {error.runId && (
            <dl className="flex items-baseline gap-2 text-caption">
              <dt className="text-foreground-muted">Run ID</dt>
              <dd className="font-mono text-mono break-all text-foreground-secondary">{error.runId}</dd>
            </dl>
          )}
          {actions && <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div>}
        </div>
      </div>
    </section>
  );
}
