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
    } else if (state.workflowDecision?.action === "continue" && state.githubRun?.status === "success") {
      const count = state.githubRun.issueCount;
      const { owner, name } = deps.config.github;
      finalResponse = `ForgeMind retrieved ${count} open GitHub issue${count === 1 ? "" : "s"} from ${owner}/${name} through Swytchcode.`;
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
