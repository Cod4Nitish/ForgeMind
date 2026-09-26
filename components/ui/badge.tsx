import type { ReactNode } from "react";
import type { DisplayTone, Tone } from "@/lib/presentation";
import {
  ArrowRightIcon,
  CheckIcon,
  CircleIcon,
  CrossIcon,
  DashIcon,
  DotIcon,
  InfoIcon,
  OctagonIcon,
  Spinner,
  TriangleIcon,
} from "./icons";
import { toneChip, toneIcon, toneText } from "./tone";

/**
 * Status language (spec §4): every status is icon + text label + color.
 * The icon shape differs per status, so color is never the only signal.
 */

export type StatusGlyph = "check" | "cross" | "triangle" | "octagon" | "info" | "dash" | "circle" | "dot" | "spinner" | "start";

const DEFAULT_GLYPH: Record<DisplayTone, StatusGlyph> = {
  success: "check",
  warning: "triangle",
  danger: "cross",
  info: "info",
  neutral: "dash",
  pending: "circle",
  running: "spinner",
};

export function StatusIcon({
  tone,
  glyph = DEFAULT_GLYPH[tone],
  className = "size-3.5",
}: {
  tone: DisplayTone;
  glyph?: StatusGlyph;
  className?: string;
}) {
  const props = { className };
  switch (glyph) {
    case "check":
      return <CheckIcon {...props} />;
    case "cross":
      return <CrossIcon {...props} />;
    case "triangle":
      return <TriangleIcon {...props} />;
    case "octagon":
      return <OctagonIcon {...props} />;
    case "info":
      return <InfoIcon {...props} />;
    case "dash":
      return <DashIcon {...props} />;
    case "circle":
      return <CircleIcon {...props} />;
    case "dot":
      return <DotIcon {...props} />;
    case "spinner":
      return <Spinner {...props} />;
    case "start":
      return <ArrowRightIcon {...props} />;
  }
}

type StatusProps = {
  tone: DisplayTone;
  label: ReactNode;
  /** Override the default shape for this tone (e.g. a static dot instead of a spinner). */
  glyph?: StatusGlyph;
  className?: string;
};

/** Corner radius (spec §1): badges use radius-xs, chips (e.g. header status) radius-sm. */
const SHAPE = { badge: "rounded-xs", chip: "rounded-sm" } as const;

/** Chip: tinted background + border + icon + label. */
export function StatusBadge({
  tone,
  label,
  glyph,
  shape = "badge",
  className = "",
}: StatusProps & { shape?: keyof typeof SHAPE }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 border px-2 text-caption font-medium whitespace-nowrap ${SHAPE[shape]} ${toneChip[tone]} ${className}`}
    >
      <StatusIcon tone={tone} glyph={glyph} className="size-3.5" />
      {label}
    </span>
  );
}

/**
 * Inline status without a chip: solid icon + colored label. For dense rows and
 * nodes. `wrap` lets a long label break onto a second line in narrow places;
 * the icon stays aligned with the first line.
 */
export function StatusText({ tone, label, glyph, wrap = false, className = "" }: StatusProps & { wrap?: boolean }) {
  return (
    <span
      className={`inline-flex items-start gap-1.5 text-caption font-medium ${wrap ? "" : "whitespace-nowrap"} ${toneText[tone]} ${className}`}
    >
      <span className="flex h-4 shrink-0 items-center">
        <StatusIcon tone={tone} glyph={glyph} className={`size-3.5 ${toneIcon[tone]}`} />
      </span>
      <span className="min-w-0">{label}</span>
    </span>
  );
}

const SEVERITY_GLYPH: Record<Tone, StatusGlyph> = {
  danger: "octagon",
  warning: "triangle",
  info: "info",
  neutral: "dot",
  pending: "dot",
  success: "check",
};

/** CRITICAL = danger/octagon, HIGH = warning/triangle, MEDIUM = info/circle, LOW = neutral/dot. */
export function SeverityBadge({ tone, label }: { tone: Tone; label: string }) {
  return <StatusBadge tone={tone} label={label} glyph={SEVERITY_GLYPH[tone]} />;
}

/** Plain neutral chip (no status), e.g. integration names or "New execution". */
export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-sm border border-border bg-surface-elevated px-2 text-caption font-medium whitespace-nowrap text-foreground-secondary ${className}`}
    >
      {children}
    </span>
  );
}
