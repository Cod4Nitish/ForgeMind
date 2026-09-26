import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md border font-medium whitespace-nowrap select-none transition-colors duration-fast ease-standard disabled:cursor-not-allowed";

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-body-sm",
  md: "h-10 px-4 text-body",
};

const VARIANT: Record<ButtonVariant, string> = {
  // Primary is RESERVED for Execute (spec §3).
  primary:
    "border-transparent bg-primary font-semibold text-primary-foreground hover:bg-primary-hover active:bg-primary-active disabled:border-border disabled:bg-surface-hover disabled:text-foreground-muted",
  secondary:
    "border-border-strong bg-surface-elevated text-foreground hover:bg-surface-hover active:bg-surface-active disabled:text-foreground-muted",
  ghost:
    "border-transparent bg-transparent text-foreground-secondary hover:bg-surface-hover hover:text-foreground active:bg-surface-active disabled:text-foreground-muted",
};

/** Loading keeps the variant's identity (no gray "disabled" look) and shows progress. */
const LOADING: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-primary-active font-semibold text-primary-foreground cursor-progress",
  secondary: "border-border-strong bg-surface-elevated text-foreground cursor-progress",
  ghost: "border-transparent bg-transparent text-foreground-secondary cursor-progress",
};

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * In-flight state: spinner + aria-busy. The button stays focusable
   * (`aria-disabled`, not `disabled`) so keyboard focus is not lost; the
   * caller's handler must ignore activations while loading.
   */
  loading?: boolean;
  icon?: ReactNode;
  className?: string;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const look = loading ? LOADING[variant] : VARIANT[variant];
  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      className={`${BASE} ${SIZE[size]} ${look} ${className}`}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}
