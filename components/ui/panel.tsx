import type { HTMLAttributes, ReactNode } from "react";
import { panelSurface } from "./tone";

type PanelProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  /** Id of the heading, used as the section's accessible name. */
  headingId: string;
  title: ReactNode;
  /** Right side of the panel header (counts, status). */
  aside?: ReactNode;
  children?: ReactNode;
};

/** L2 content surface: a labelled `<section>` with an h2 header row. */
export function Panel({ headingId, title, aside, children, className = "", ...rest }: PanelProps) {
  return (
    <section aria-labelledby={headingId} className={`${panelSurface} p-4 sm:p-5 ${className}`} {...rest}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-h2 text-foreground">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
