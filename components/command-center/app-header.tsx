import { useEffect, useState, type ReactNode } from "react";
import { SYSTEM_HEALTH, interpretHealth, type DisplayTone, type SystemHealth } from "@/lib/presentation";
import { Chip, StatusBadge } from "@/components/ui/badge";

/*
 * No "use client" directive: only imported by the interactive CommandCenter,
 * so it already lives in the client graph.
 */

const INTEGRATIONS = ["GitHub", "Jira", "Slack"] as const;

type RunMode = "live" | "demo";

/** Client `GET /api/health` on mount: Checking… → Online / Unreachable, plus the server's run mode. */
function useSystemHealth(): { health: SystemHealth; mode?: RunMode } {
  const [health, setHealth] = useState<SystemHealth>("checking");
  const [mode, setMode] = useState<RunMode>();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        setHealth(interpretHealth(response.ok, body));
        const reported = (body as { mode?: unknown } | null)?.mode;
        if (reported === "live" || reported === "demo") setMode(reported);
      })
      .catch(() => {
        if (!controller.signal.aborted) setHealth("unreachable");
      });
    return () => controller.abort();
  }, []);

  return { health, mode };
}

/** A visible "SYSTEM" / "RUN" label at every width, so the two chips are never ambiguous. */
function LabelledChip({
  label,
  tone,
  text,
  glyph,
  className = "",
}: {
  label: string;
  tone: DisplayTone;
  text: string;
  glyph?: "dot";
  className?: string;
}) {
  return (
    <p className={`flex items-center gap-2 ${className}`}>
      <span className="text-label text-foreground-muted uppercase">{label}</span>
      <StatusBadge tone={tone} label={text} glyph={glyph} shape="chip" />
    </p>
  );
}

type AppHeaderProps = {
  brand: ReactNode;
  runStatus: { label: string; tone: DisplayTone };
};

/**
 * Brand, the product's integrations (named, never claimed as "connected" —
 * no endpoint reports that), live System health and the current run status.
 */
export function AppHeader({ brand, runStatus }: AppHeaderProps) {
  const system = useSystemHealth();
  const health = SYSTEM_HEALTH[system.health];
  // Primary is reserved (spec §3) for Execute and the active workflow node /
  // executing banner, so the header chip shows "Executing" in a neutral tone.
  const runTone: DisplayTone = runStatus.tone === "running" ? "neutral" : runStatus.tone;

  return (
    <header className="border-b border-border bg-background lg:sticky lg:top-0 lg:z-20">
      {/*
        xs: brand / System + Run / integrations (the wrapper below is
        display:contents so its children can be ordered with the chips).
        sm–md: brand + Run / integrations … System. lg: one 56px row.
      */}
      <div className="mx-auto flex w-full max-w-screen-2xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:gap-x-6 sm:px-6 lg:h-14 lg:flex-nowrap lg:px-8 lg:py-0">
        <div className="order-1 min-w-0 max-sm:w-full sm:mr-auto">{brand}</div>

        <div className="contents sm:order-3 sm:flex sm:w-full sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:gap-y-2 lg:order-2 lg:w-auto lg:justify-end">
          <div
            role="group"
            aria-labelledby="integrations-label"
            className="order-4 flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto"
          >
            <span id="integrations-label" className="text-label text-foreground-muted uppercase max-sm:sr-only">
              Integrations
            </span>
            <ul className="flex items-center gap-1">
              {INTEGRATIONS.map((name) => (
                <li key={name}>
                  <Chip>{name}</Chip>
                </li>
              ))}
            </ul>
            <span className="text-caption text-foreground-muted">via Swytchcode</span>
          </div>
          <LabelledChip label="System" tone={health.tone} text={health.label} className="order-2 sm:order-none" />
          {system.mode && (
            <p
              className="order-2 flex items-center gap-2 sm:order-none"
              title={
                system.mode === "demo"
                  ? "Demo mode: the real agent workflow runs against simulated GitHub, Jira and Slack data. Nothing is sent to external systems."
                  : "Live mode: actions run against the configured GitHub, Jira and Slack workspaces."
              }
            >
              <span className="text-label text-foreground-muted uppercase">Mode</span>
              <StatusBadge tone={system.mode === "demo" ? "warning" : "success"} label={system.mode === "demo" ? "Demo sandbox" : "Live"} shape="chip" />
            </p>
          )}
        </div>

        <div className="order-3 sm:order-2 lg:order-3">
          {/* Static dot while executing: the only spinners live in Execute and the active node. */}
          <LabelledChip
            label="Run"
            tone={runTone}
            text={runStatus.label}
            glyph={runStatus.tone === "running" || runStatus.tone === "neutral" ? "dot" : undefined}
          />
        </div>
      </div>
    </header>
  );
}
