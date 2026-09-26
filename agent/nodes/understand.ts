import type { AgentDeps } from "../deps";
import { createEvent } from "../events";
import { UNDERSTAND_SYSTEM } from "../prompts";
import { RequestUnderstandingSchema } from "../schemas";
import type { ForgeMindStateUpdate, ForgeMindStateValue } from "../state";
import { callStructured } from "../structured";

export function makeUnderstandNode(deps: AgentDeps) {
  return async function understandRequest(state: ForgeMindStateValue): Promise<ForgeMindStateUpdate> {
    const outcome = await callStructured({
      model: deps.model,
      name: "request_understanding",
      schema: RequestUnderstandingSchema,
      system: UNDERSTAND_SYSTEM,
      prompt: `User request:\n${state.userRequest}`,
      effort: "low",
    });

    if (!outcome.ok) {
      return {
        errors: [{ stage: "reasoning", code: outcome.code, message: outcome.message }],
        events: [
          createEvent(deps.now, {
            type: "decision_made",
            stage: "reasoning",
            status: "error",
            summary: "ForgeMind could not interpret the request.",
          }),
        ],
      };
    }

    return {
      understanding: outcome.data,
      events: [
        createEvent(deps.now, {
          type: "analysis_completed",
          stage: "reasoning",
          status: "success",
          summary: `Request understood: ${outcome.data.intent}`,
        }),
      ],
    };
  };
}
