import type { ComponentType } from "react";
import type { WorkflowNodeKey, WorkflowNodeView } from "@/lib/presentation";
import { StatusText } from "@/components/ui/badge";
import {
  FlagIcon,
  GaugeIcon,
  IssueIcon,
  SearchIcon,
  SendIcon,
  SparkleIcon,
  TerminalIcon,
  TicketIcon,
  type IconProps,
} from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";

const STAGE_ICON: Record<WorkflowNodeKey, ComponentType<IconProps>> = {
  request: TerminalIcon,
  reason: SparkleIcon,
  github: IssueIcon,
  analyze: GaugeIcon,
  jira: TicketIcon,
  verify: SearchIcon,
  slack: SendIcon,
  result: FlagIcon,
};

/** Nodes that did not (or have not yet) run recede; work that happened stays prominent. */
const RECEDED = new Set<WorkflowNodeView["status"]>(["waiting", "skipped", "not_run", "unknown"]);

function nodeSurface(node: WorkflowNodeView): string {
  if (node.active) return "border-primary bg-primary-subtle";
  if (node.tone === "danger") return "border-danger-border bg-surface-elevated";
  if (node.tone === "warning") return "border-warning-border bg-surface-elevated";
  return "border-border bg-surface-elevated";
}

function WorkflowNode({ node, isLast }: { node: WorkflowNodeView; isLast: boolean }) {
  const Icon = STAGE_ICON[node.key];
  const receded = RECEDED.has(node.status);

  return (
    <li
      aria-current={node.active ? "step" : undefined}
      className={`relative flex min-w-0 items-center gap-3 rounded-md border p-3 transition-colors duration-base sm:flex-col sm:items-stretch sm:gap-2 ${nodeSurface(node)}`}
    >
      {/* Connector to the next node (horizontal layout only). */}
      {!isLast && <span aria-hidden="true" className="absolute top-6 -right-3 hidden h-px w-3 bg-border-strong lg:block" />}

      {/* lg–xl nodes are narrow: the icon sits above the name so names are never cut. */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none lg:flex-col lg:items-start xl:flex-row xl:items-center">
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-sm border ${
            node.active ? "border-primary bg-surface text-primary" : "border-border bg-surface text-foreground-secondary"
          }`}
        >
          <Icon className="size-3.5" />
        </span>
        <div className="max-w-full min-w-0">
          <p className={`truncate text-h3 ${receded ? "text-foreground-secondary" : "text-foreground"}`}>{node.label}</p>
          <p className="text-caption text-foreground-muted sm:hidden">{node.description}</p>
        </div>
      </div>

      <p className="hidden text-caption text-foreground-muted sm:block">{node.description}</p>

      <div className="flex shrink-0 flex-col items-end gap-1 sm:mt-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-2">
        <StatusText tone={node.tone} label={node.statusLabel} wrap />
        {node.durationLabel && (
          <span className="text-caption text-foreground-muted">
            <span className="sr-only">{node.durationScope === "run" ? "total run time " : "took "}</span>
            <span className="font-mono text-mono tabular-nums">{node.durationLabel}</span>
            {/* Result carries the whole run's time, not a step time: say so. */}
            {node.durationScope === "run" && <span aria-hidden="true"> total</span>}
          </span>
        )}
      </div>
    </li>
  );
}

type WorkflowStripProps = {
  nodes: WorkflowNodeView[];
  /** A request is in flight. */
  busy: boolean;
};

/**
 * Request → Reason → GitHub → Analyze → Jira → Verify → Slack → Result.
 * Horizontal with connectors on ≥lg, 2 columns on sm, stacked rows on xs.
 * While a request is in flight only Request is active — the API does not
 * stream, so no per-step progress is invented.
 */
export function WorkflowStrip({ nodes, busy }: WorkflowStripProps) {
  return (
    <Panel
      headingId="workflow-heading"
      title="Agent workflow"
      aria-busy={busy || undefined}
      aside={<p className="text-caption text-foreground-muted">Outcomes come from the run&apos;s own report</p>}
    >
      <ol aria-label="Agent workflow steps" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-8 lg:gap-3">
        {nodes.map((node, index) => (
          <WorkflowNode key={node.key} node={node} isLast={index === nodes.length - 1} />
        ))}
      </ol>
    </Panel>
  );
}
