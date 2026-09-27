import type { ComponentType, ReactNode } from "react";
import type { WorkflowNodeKey, WorkflowNodeStatus, WorkflowNodeView } from "@/lib/presentation";
import { StatusText, type StatusGlyph } from "@/components/ui/badge";
import { GitHubMark, JiraMark, SlackMark } from "@/components/ui/brand-icons";
import {
  FlagIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparkleIcon,
  TerminalIcon,
  type IconProps,
} from "@/components/ui/icons";
import { panelSurface } from "@/components/ui/tone";

/** Each stage's icon and identity accent (tile tint + icon color). */
const STAGE: Record<WorkflowNodeKey, { Icon: ComponentType<IconProps>; tile: string; icon: string }> = {
  request: { Icon: TerminalIcon, tile: "bg-stage-request-bg", icon: "text-stage-request" },
  reason: { Icon: SparkleIcon, tile: "bg-stage-reason-bg", icon: "text-stage-reason" },
  github: { Icon: GitHubMark, tile: "bg-stage-github-bg", icon: "text-stage-github" },
  analyze: { Icon: SearchIcon, tile: "bg-stage-analyze-bg", icon: "text-stage-analyze" },
  jira: { Icon: JiraMark, tile: "bg-stage-jira-bg", icon: "text-stage-jira" },
  verify: { Icon: ShieldCheckIcon, tile: "bg-stage-verify-bg", icon: "text-stage-verify" },
  slack: { Icon: SlackMark, tile: "bg-stage-slack-bg", icon: "" },
  result: { Icon: FlagIcon, tile: "bg-stage-request-bg", icon: "text-stage-request" },
};

/** Work that did not (or has not yet) happen recedes; work that happened stays prominent. */
const RECEDED = new Set<WorkflowNodeStatus>(["waiting", "skipped", "not_run", "unknown"]);
/** Did not run on purpose / never reached: dashed outline, like a branch not taken. */
const BYPASSED = new Set<WorkflowNodeStatus>(["skipped", "not_run"]);

const GLYPH: Partial<Record<WorkflowNodeStatus, StatusGlyph>> = { skipped: "skip", not_run: "skip" };

function cardSurface(node: WorkflowNodeView): string {
  if (node.active) return "border-primary bg-primary-subtle motion-safe:animate-halo";
  if (node.tone === "danger") return "border-danger-border bg-danger-background";
  if (node.tone === "warning") return "border-warning-border bg-warning-background";
  if (BYPASSED.has(node.status)) return "border-dashed border-border bg-transparent";
  if (node.status === "waiting" || node.status === "unknown") return "border-border bg-surface";
  return "border-border bg-surface-elevated";
}

/** Connector into the next node: solid once the next node has started, dashed when it was bypassed. */
function connectorClass(next: WorkflowNodeView | undefined): string {
  if (!next) return "";
  if (next.active) return "border-primary";
  if (BYPASSED.has(next.status)) return "border-dashed border-border-strong";
  if (next.status === "waiting" || next.status === "unknown") return "border-border";
  return "border-success-border";
}

function StageTile({ node, size = "md" }: { node: WorkflowNodeView; size?: "md" | "sm" }) {
  const { Icon, tile, icon } = STAGE[node.key];
  const receded = RECEDED.has(node.status);
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-md transition-opacity duration-base ${tile} ${
        size === "md" ? "size-9" : "size-8"
      } ${receded ? "opacity-60" : ""}`}
    >
      <Icon className={`${size === "md" ? "size-[18px]" : "size-4"} ${icon}`} />
    </span>
  );
}

function NodeStatus({ node }: { node: WorkflowNodeView }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      {/* Keyed on status so the icon re-plays its arrival animation when the status changes. */}
      <span key={node.status} className={node.status === "waiting" || node.active ? "" : "motion-safe:animate-pop"}>
        <StatusText tone={node.tone} label={node.statusLabel} glyph={GLYPH[node.status]} />
      </span>
      {node.durationLabel && (
        <span className="text-caption text-foreground-muted">
          <span className="sr-only">{node.durationScope === "run" ? "total run time " : "took "}</span>
          <span className="font-mono text-mono tabular-nums">{node.durationLabel}</span>
          {node.durationScope === "run" && <span aria-hidden="true"> total</span>}
        </span>
      )}
    </div>
  );
}

/** The running sweep: an indeterminate bar (the node is running; no invented percentage). */
function Sweep() {
  return (
    <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-b-md">
      <span className="block h-full w-2/5 bg-primary motion-safe:animate-sweep" />
    </span>
  );
}

function WorkflowNode({ node, index, next }: { node: WorkflowNodeView; index: number; next?: WorkflowNodeView }) {
  const receded = RECEDED.has(node.status);
  const step = String(index + 1).padStart(2, "0");
  const title = <span className={receded ? "text-foreground-secondary" : "text-foreground"}>{node.label}</span>;

  return (
    <li aria-current={node.active ? "step" : undefined} className="relative min-w-0">
      {/* xs: a vertical rail — tile, connector line down to the next node, content on the right. */}
      <div className="flex gap-3 sm:hidden">
        <div className="flex flex-col items-center">
          <StageTile node={node} size="sm" />
          {next && <span aria-hidden="true" className={`my-1 w-0 flex-1 border-l-2 ${connectorClass(next)}`} />}
        </div>
        <div
          className={`relative mb-2 min-w-0 flex-1 rounded-md border px-3 py-2 transition-colors duration-base ${cardSurface(node)}`}
        >
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-h3">{title}</span>
            <span className="font-mono text-caption text-foreground-muted">{step}</span>
          </p>
          <p className="text-caption text-foreground-muted">{node.description}</p>
          {node.detail && <p className="mt-1 text-body-sm break-words text-foreground-secondary">{node.detail}</p>}
          <div className="mt-2">
            <NodeStatus node={node} />
          </div>
          {node.active && <Sweep />}
        </div>
      </div>

      {/* sm+: a card. On xl the eight cards form one row joined by connectors. */}
      <div
        className={`relative hidden h-full flex-col gap-2 rounded-lg border p-3 transition-colors duration-base sm:flex ${cardSurface(node)}`}
      >
        <div className="flex items-start justify-between gap-2">
          <StageTile node={node} />
          <span className="font-mono text-caption text-foreground-muted">{step}</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-h3">{title}</p>
          <p className="text-caption text-foreground-muted">{node.description}</p>
        </div>
        <p
          title={node.detail}
          className={`line-clamp-3 min-h-10 text-caption break-words ${
            node.active ? "text-primary" : receded ? "text-foreground-muted" : "text-foreground-secondary"
          }`}
        >
          {node.detail}
        </p>
        <div className="mt-auto">
          <NodeStatus node={node} />
        </div>
        {node.active && <Sweep />}
      </div>

      {next && (
        <span
          aria-hidden="true"
          className={`absolute top-7 -right-3 hidden w-3 border-t-2 transition-colors duration-base xl:block ${connectorClass(next)}`}
        />
      )}
    </li>
  );
}

type WorkflowStripProps = {
  nodes: WorkflowNodeView[];
  /** A request is in flight. */
  busy: boolean;
  /** Right side of the header: live / completed note. */
  aside?: ReactNode;
};

/**
 * Request → Reason → GitHub → Analyze → Jira → Verify → Slack → Result.
 * Every status comes from the run: the live progress stream while it runs,
 * the final report afterwards. Nothing advances on a timer.
 */
export function WorkflowStrip({ nodes, busy, aside }: WorkflowStripProps) {
  return (
    <section aria-labelledby="workflow-heading" aria-busy={busy || undefined} className={`${panelSurface} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 id="workflow-heading" className="text-h1 text-foreground">
            Agent workflow
          </h2>
          <p className="mt-0.5 text-caption text-foreground-muted">
            Think <span aria-hidden="true">→</span> Inspect <span aria-hidden="true">→</span> Analyze{" "}
            <span aria-hidden="true">→</span> Decide <span aria-hidden="true">→</span> Act{" "}
            <span aria-hidden="true">→</span> Verify <span aria-hidden="true">→</span> Report
          </p>
        </div>
        {aside}
      </div>
      <ol
        aria-label="Agent workflow steps"
        className="mt-4 grid grid-cols-1 sm:grid-cols-2 sm:gap-3 md:grid-cols-4 xl:grid-cols-8"
      >
        {nodes.map((node, index) => (
          <WorkflowNode key={node.key} node={node} index={index} next={nodes[index + 1]} />
        ))}
      </ol>
    </section>
  );
}
