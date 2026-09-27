import type { AgentApiResponse } from "@/lib/api/contract";
import type { AgentDeps } from "./deps";
import { createEvent, type AgentEvent, type EventStage } from "./events";
import { buildForgeMindGraph } from "./graph";
import { toApiResponse } from "./response";
import type { ForgeMindStateValue } from "./state";

/** Live progress while a run executes. Only real node starts and real events. */
export type RunProgress = { type: "stage_started"; stage: EventStage } | { type: "event"; event: AgentEvent };

/** The UI stage each graph node works on. A stage may span several nodes. */
const NODE_STAGE: Record<string, EventStage> = {
  understandRequest: "reasoning",
  plan: "reasoning",
  decision: "reasoning",
  github: "github",
  analyzeIssues: "analysis",
  actionabilityDecision: "analysis",
  jira: "jira",
  verifyJira: "verification",
  notificationDecision: "slack",
  slack: "slack",
  finalize: "final",
};

type TaskChunk = { name: string; input?: unknown; result?: unknown };

/** New events in a finished task's update (an object, or [channel, value] pairs). */
function eventsIn(result: unknown): AgentEvent[] {
  const writes: [string, unknown][] = Array.isArray(result)
    ? (result as [string, unknown][])
    : result && typeof result === "object"
      ? Object.entries(result)
      : [];
  return writes.flatMap(([channel, value]) => (channel === "events" && Array.isArray(value) ? (value as AgentEvent[]) : []));
}

/**
 * Runs one ForgeMind workflow and returns the sanitized, browser-safe result.
 * With `onProgress`, the graph is streamed and each node start and each new
 * execution event is reported as it happens; the result is identical.
 */
export async function runForgeMind(
  userRequest: string,
  deps: AgentDeps,
  runId: string,
  onProgress?: (progress: RunProgress) => void,
): Promise<AgentApiResponse> {
  const startedAt = deps.now();
  const graph = buildForgeMindGraph(deps);
  const received = createEvent(deps.now, {
    type: "request_received",
    stage: "request",
    status: "success",
    summary: "Engineering request received.",
  });
  const input = { runId, userRequest, events: [received], errors: [] };

  let state: ForgeMindStateValue;
  if (!onProgress) {
    state = await graph.invoke(input);
  } else {
    onProgress({ type: "event", event: received });
    let last: ForgeMindStateValue | undefined;
    const stream = await graph.stream(input, { streamMode: ["tasks", "values"] });
    for await (const [mode, payload] of stream as AsyncIterable<[string, unknown]>) {
      if (mode === "values") {
        last = payload as ForgeMindStateValue;
        continue;
      }
      const task = payload as TaskChunk;
      if ("input" in task) {
        const stage = NODE_STAGE[task.name];
        if (stage) onProgress({ type: "stage_started", stage });
      } else if ("result" in task) {
        for (const event of eventsIn(task.result)) onProgress({ type: "event", event });
      }
    }
    if (!last) throw new Error("The workflow produced no state.");
    state = last;
  }

  return toApiResponse(state, deps.config, runId, { startedAt, finishedAt: deps.now() });
}
