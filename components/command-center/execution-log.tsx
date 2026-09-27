import type { CommandCenterViewModel, TimelineEventView } from "@/lib/presentation";
import { StatusIcon } from "@/components/ui/badge";
import { ChevronRightIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { eyebrow, toneChip, toneIcon, toneText } from "@/components/ui/tone";
import { useScrollable } from "@/components/ui/use-scrollable";

/*
 * No "use client" directive: only imported by the interactive CommandCenter,
 * so it already lives in the client graph (it measures its scroll region).
 */

type ExecutionLogProps = {
  view: Pick<CommandCenterViewModel, "timeline" | "intent" | "plan" | "decision">;
  className?: string;
};

/** "Started" events are historical here (the run is over): an arrow, never a spinner. */
function glyphFor(event: TimelineEventView) {
  return event.tone === "info" ? "start" : undefined;
}

function ReasoningSummary({ intent, plan, decision }: Pick<CommandCenterViewModel, "intent" | "plan" | "decision">) {
  if (!intent && plan.length === 0 && !decision) return null;
  return (
    <details className="group mt-4 rounded-md border border-border bg-surface-elevated">
      <summary className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 text-body-sm font-medium text-foreground transition-colors select-none group-open:rounded-b-none hover:bg-surface-hover">
        <ChevronRightIcon className="size-4 text-foreground-muted transition-transform duration-fast group-open:rotate-90" />
        Agent reasoning summary
        <span className="ml-auto text-caption font-normal text-foreground-muted max-sm:hidden">Public-safe summary</span>
      </summary>
      <dl className="space-y-3 border-t border-border px-3 py-3 text-body-sm">
        {intent && (
          <div>
            <dt className={eyebrow}>Understood intent</dt>
            <dd className="mt-1 break-words text-foreground">{intent}</dd>
          </div>
        )}
        {plan.length > 0 && (
          <div>
            <dt className={eyebrow}>Plan</dt>
            <dd className="mt-1">
              <ol className="list-decimal space-y-1 pl-5 text-foreground-secondary marker:text-foreground-muted">
                {plan.map((step, index) => (
                  <li key={`${index}-${step}`} className="break-words">
                    {step}
                  </li>
                ))}
              </ol>
            </dd>
          </div>
        )}
        {decision && (
          <div>
            <dt className={eyebrow}>Decision</dt>
            <dd className="mt-1 break-words text-foreground-secondary">
              <span className="font-medium text-foreground">{decision.actionLabel}</span>
              {decision.reason && <> — {decision.reason}</>}
            </dd>
          </div>
        )}
      </dl>
    </details>
  );
}

/**
 * The real, ordered execution log returned by the run: offset, stage,
 * status (icon + label), summary and the Swytchcode tool ID.
 */
export function ExecutionLog({ view, className = "" }: ExecutionLogProps) {
  const events = view.timeline;
  const [regionRef, scrollable] = useScrollable<HTMLDivElement>();

  return (
    <Panel
      headingId="log-heading"
      title="Execution events"
      className={`motion-safe:animate-reveal ${className}`}
      aside={
        <p className="text-caption text-foreground-muted tabular-nums">
          {events.length} {events.length === 1 ? "event" : "events"}, in order
        </p>
      }
    >
      <ReasoningSummary intent={view.intent} plan={view.plan} decision={view.decision} />

      {events.length === 0 ? (
        <p className="mt-4 text-body-sm text-foreground-secondary">No execution events were recorded for this run.</p>
      ) : (
        <div
          ref={regionRef}
          // A focusable, named region only while there is something to scroll;
          // below lg the log stays in the page flow (no nested touch scrolling).
          role={scrollable ? "region" : undefined}
          aria-label={scrollable ? "Execution events" : undefined}
          tabIndex={scrollable ? 0 : undefined}
          className="scroll-region mt-4 rounded-md pr-1 lg:max-h-120"
        >
          <ol aria-label="Execution events, in order">
            {events.map((event, index) => {
              const last = index === events.length - 1;
              return (
                <li key={event.id} className="flex gap-3">
                  {/* h-6 matches the status marker so the offset is centred on it. */}
                  <span className="flex h-6 w-14 shrink-0 items-center justify-end font-mono text-mono text-foreground-muted tabular-nums">
                    {event.offsetLabel ? (
                      <time dateTime={event.timestamp}>
                        <span className="sr-only">at </span>
                        {event.offsetLabel}
                      </time>
                    ) : (
                      <span aria-hidden="true">—</span>
                    )}
                  </span>

                  <span aria-hidden="true" className="flex shrink-0 flex-col items-center">
                    <span className={`grid size-6 place-items-center rounded-full border ${toneChip[event.tone]}`}>
                      <StatusIcon tone={event.tone} glyph={glyphFor(event)} className={`size-3 ${toneIcon[event.tone]}`} />
                    </span>
                    {!last && <span className="my-1 w-px flex-1 bg-border" />}
                  </span>

                  <div className={`min-w-0 flex-1 ${last ? "" : "pb-4"}`}>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-body-sm font-medium text-foreground">{event.stageLabel}</span>
                      <span className={`text-caption font-medium ${toneText[event.tone]}`}>{event.statusLabel}</span>
                    </p>
                    <p className="mt-1 text-body-sm break-words text-foreground-secondary">{event.summary}</p>
                    {event.tool && (
                      <p className="mt-1 font-mono text-mono break-all text-foreground-muted">
                        <span className="sr-only">Tool: </span>
                        {event.tool}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Panel>
  );
}
