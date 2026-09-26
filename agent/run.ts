import type { AgentApiResponse } from "@/lib/api/contract";
import type { AgentDeps } from "./deps";
import { createEvent } from "./events";
import { buildForgeMindGraph } from "./graph";
import { toApiResponse } from "./response";

/** Runs one ForgeMind workflow and returns the sanitized, browser-safe result. */
export async function runForgeMind(
  userRequest: string,
  deps: AgentDeps,
  runId: string,
): Promise<AgentApiResponse> {
  const startedAt = deps.now();
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
  return toApiResponse(state, deps.config, runId, { startedAt, finishedAt: deps.now() });
}
