import type { MetricView } from "@/lib/presentation";
import { StatusIcon } from "./badge";
import { eyebrow, panelSurface, toneIcon, toneText } from "./tone";

/**
 * One Run overview metric. Numbers are tabular and already zero-padded by the
 * presentation layer; word values (Slack) always carry a status icon.
 * Render inside a `<dl>`.
 */
export function Metric({ metric }: { metric: MetricView }) {
  const { label, value, valueTone, notes } = metric;
  return (
    <div className={`${panelSurface} flex flex-col gap-2 px-4 py-3`}>
      <dt className={eyebrow}>{label}</dt>
      <dd className="flex min-h-9 items-center">
        {valueTone ? (
          <span className={`inline-flex items-center gap-2 text-h1 ${toneText[valueTone]}`}>
            <StatusIcon tone={valueTone} className={`size-5 ${toneIcon[valueTone]}`} />
            {value}
          </span>
        ) : (
          <span className="text-display text-foreground tabular-nums">{value}</span>
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
