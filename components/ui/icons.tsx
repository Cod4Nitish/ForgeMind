import type { ReactNode } from "react";

/**
 * Small inline SVG icon set — no icon dependency. Icons are decorative
 * (`aria-hidden`); every status they accompany is also written as text.
 * Generic shapes only: no third-party brand marks.
 */

export type IconProps = { className?: string };

function Svg({ className = "size-4", children, strokeWidth = 2 }: IconProps & { children: ReactNode; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

/* --- Status shapes (spec §4) -------------------------------------- */

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={2.25}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function CrossIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={2.25}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Svg>
  );
}

export function TriangleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.3 4.2L2.6 17.6A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-2.9L13.7 4.2a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4" />
      <path d="M12 17h.01" />
    </Svg>
  );
}

export function OctagonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8.3 2.8h7.4l5.5 5.5v7.4l-5.5 5.5H8.3l-5.5-5.5V8.3z" />
      <path d="M12 8v4.5" />
      <path d="M12 16h.01" />
    </Svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </Svg>
  );
}

/** Em dash — skipped / not run. */
export function DashIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={2.25}>
      <path d="M5.5 12h13" />
    </Svg>
  );
}

/** Hollow circle — waiting. */
export function CircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="7" />
    </Svg>
  );
}

/** Filled dot — neutral indicator (Ready, LOW severity, static in-flight marker). */
export function DotIcon({ className = "size-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
    </svg>
  );
}

/** Arrow — an event that started (historical, not in flight). */
export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

/**
 * The only animated element in the UI: a small spinner, allowed only in the
 * Execute button and the single active workflow node. Under reduced motion it
 * is replaced by a static dot.
 */
export function Spinner({ className = "size-4" }: IconProps) {
  return (
    <span aria-hidden="true" className={`inline-grid shrink-0 place-items-center ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" focusable="false" className="size-full motion-safe:animate-spin motion-reduce:hidden">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="hidden size-1/2 rounded-full bg-current motion-reduce:block" />
    </span>
  );
}

/* --- UI glyphs ----------------------------------------------------- */

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Svg>
  );
}

export function RetryIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4.5V9h-4.5" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function PlayIcon({ className = "size-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <path d="M8 5.8v12.4a.8.8 0 0 0 1.2.7l9.9-6.2a.8.8 0 0 0 0-1.4L9.2 5.1a.8.8 0 0 0-1.2.7z" />
    </svg>
  );
}

/** ForgeMind mark: a hexagon (the engineered system) around a spark (reasoning). */
export function BrandMark({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <path
        d="M12 2.8l7.8 4.5v9.4L12 21.2l-7.8-4.5V7.3z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M12 7.6l1.3 3.1 3.1 1.3-3.1 1.3-1.3 3.1-1.3-3.1-3.1-1.3 3.1-1.3z" fill="currentColor" />
    </svg>
  );
}

/* --- Workflow stage glyphs (generic, not brand marks) -------------- */

export function TerminalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 7l5 5-5 5" />
      <path d="M12.5 17H19" />
    </Svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z" />
      <path d="M19 17v4M17 19h4" />
    </Svg>
  );
}

/** Open-issue glyph: a ringed dot. */
export function IssueIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </Svg>
  );
}

export function GaugeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="M12 18l4-6" />
      <path d="M4 18h16" />
    </Svg>
  );
}

export function TicketIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z" />
      <path d="M14 6v12" strokeDasharray="2 2.5" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </Svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 3.5L10 14" />
      <path d="M20.5 3.5l-6.5 17-4-6.5-6.5-4z" />
    </Svg>
  );
}

export function FlagIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 21V4" />
      <path d="M5.5 4.5h11.5l-2.5 4 2.5 4H5.5" />
    </Svg>
  );
}

/** ↷ — skipped / not required. */
export function SkipIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 15a8 8 0 0 1 14.5-4.7" />
      <path d="M19 5v5.5h-5.5" />
      <circle cx="12" cy="17.5" r="1.25" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l7 3v5.5c0 4.3-2.9 8-7 9.5-4.1-1.5-7-5.2-7-9.5V6z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </Svg>
  );
}
