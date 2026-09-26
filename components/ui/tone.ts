import type { DisplayTone } from "@/lib/presentation";

/*
 * Tone → semantic token utilities (design spec §1, §4). Full literal class
 * strings so Tailwind can see them. `running` is the only primary-colored
 * status; info-blue is never primary.
 */

/** Status text on any surface or on its own tint (>= 4.5:1). */
export const toneText: Record<DisplayTone, string> = {
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-danger-foreground",
  info: "text-info-foreground",
  neutral: "text-foreground-secondary",
  pending: "text-foreground-muted",
  running: "text-primary",
};

/** Solid icon / stroke color (>= 3:1 on every surface and tint). */
export const toneIcon: Record<DisplayTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-foreground-muted",
  pending: "text-foreground-muted",
  running: "text-primary",
};

/** Chip: tint + border + text. */
export const toneChip: Record<DisplayTone, string> = {
  success: "border-success-border bg-success-background text-success-foreground",
  warning: "border-warning-border bg-warning-background text-warning-foreground",
  danger: "border-danger-border bg-danger-background text-danger-foreground",
  info: "border-info-border bg-info-background text-info-foreground",
  neutral: "border-border bg-surface-elevated text-foreground-secondary",
  pending: "border-border bg-surface-elevated text-foreground-muted",
  running: "border-primary bg-primary-subtle text-primary",
};

/** Banner / highlighted row surface: tint + border. Neutral tones stay on the plain surface. */
export const toneSurface: Record<DisplayTone, string> = {
  success: "border-success-border bg-success-background",
  warning: "border-warning-border bg-warning-background",
  danger: "border-danger-border bg-danger-background",
  info: "border-info-border bg-info-background",
  neutral: "border-border bg-surface",
  pending: "border-border bg-surface",
  running: "border-primary bg-primary-subtle",
};

/** Eyebrow / section label (label type token is always uppercase). */
export const eyebrow = "text-label uppercase text-foreground-muted";

/** L2 content surface. */
export const panelSurface = "rounded-lg border border-border bg-surface shadow-panel";
