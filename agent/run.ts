import type { AgentDeps } from "./deps";
import type { AgentError } from "./errors";
import { createEvent, type AgentEvent } from "./events";
import { buildForgeMindGraph } from "./graph";
import type { Decision } from "./schemas";

/** The sanitized result of one agent run — safe to return to the browser. */
export type AgentRunResult = {
  runId: string;
  status: "completed" | "failed";
  intent?: string;
  plan: string[];
  decision?: Decision;
  github?: { status: "success" | "failed"; issueCount: number };
  summary: string;
  events: AgentEvent[];
  errors: AgentError[];
};

export async function runForgeMind(
  userRequest: string,
  deps: AgentDeps,
  runId: string,
): Promise<AgentRunResult> {
  const graph = buildForgeMindGraph(deps);
  const state = await graph.invoke({
    runId,
    userRequest,
    events: [
      createEvent(deps.now, {
        type: "request_received",
        stage: "request",
        status: "success",
        summary: "Engineering request received.",
      }),
    ],
    errors: [],
  });

  return {
    runId,
    status: state.errors.length > 0 ? "failed" : "completed",
    intent: state.understanding?.intent,
    plan: state.requestPlan?.steps ?? [],
    decision: state.workflowDecision,
    github: state.githubRun ? { status: state.githubRun.status, issueCount: state.githubRun.issueCount } : undefined,
    summary: state.finalResponse ?? "",
    events: state.events,
    errors: state.errors,
  };
}
