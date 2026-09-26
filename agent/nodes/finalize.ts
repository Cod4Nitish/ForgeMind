import type { AgentDeps } from "../deps";
import { createEvent } from "../events";
import type { ForgeMindStateUpdate, ForgeMindStateValue } from "../state";
import { summarizeRun } from "../summary";

/**
 * Builds the final result deterministically from recorded state — the summary
 * can never claim more than the tool results show.
 */
export function makeFinalizeNode(deps: AgentDeps) {
  return async function finalize(state: ForgeMindStateValue): Promise<ForgeMindStateUpdate> {
    const result = summarizeRun(state, deps.config);
    const label = { success: "Workflow completed.", partial: "Workflow completed with some external actions failed.", failed: "Workflow failed." };
    return {
      result,
      events: [
        createEvent(deps.now, {
          type: "finalized",
          stage: "final",
          status: result.status === "success" ? "success" : result.status === "partial" ? "warning" : "error",
          summary: label[result.status],
        }),
      ],
    };
  };
}
