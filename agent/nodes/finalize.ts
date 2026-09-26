import type { AgentDeps } from "../deps";
import { createEvent } from "../events";
import type { ForgeMindStateUpdate, ForgeMindStateValue } from "../state";

/**
 * Builds the final response deterministically from state — the summary can
 * never claim more than the recorded results show.
 */
export function makeFinalizeNode(deps: AgentDeps) {
  return async function finalize(state: ForgeMindStateValue): Promise<ForgeMindStateUpdate> {
    const firstError = state.errors[0];
    let finalResponse: string;

    if (firstError) {
      finalResponse = `ForgeMind could not complete the request. ${firstError.message}`;
    } else if (state.workflowDecision?.action === "continue") {
      finalResponse =
        "ForgeMind analyzed the request and determined that the workflow should continue to the external engineering tools.";
    } else {
      finalResponse = `ForgeMind analyzed the request and determined that no external engineering action is required. ${state.workflowDecision?.reason ?? ""}`.trim();
    }

    return {
      finalResponse,
      events: [
        createEvent(deps.now, {
          type: "finalized",
          stage: "final",
          status: firstError ? "error" : "success",
          summary: firstError ? "Workflow ended with an error." : "Workflow completed.",
        }),
      ],
    };
  };
}
