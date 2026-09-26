import type { AgentDeps } from "../deps";
import { createEvent } from "../events";
import { DECISION_SYSTEM } from "../prompts";
import { DecisionSchema } from "../schemas";
import type { ForgeMindStateUpdate, ForgeMindStateValue } from "../state";
import { callStructured } from "../structured";

export function makeDecisionNode(deps: AgentDeps) {
  return async function decision(state: ForgeMindStateValue): Promise<ForgeMindStateUpdate> {
    const outcome = await callStructured({
      model: deps.model,
      name: "workflow_decision",
      schema: DecisionSchema,
      system: DECISION_SYSTEM,
      prompt: [
        `User request:\n${state.userRequest}`,
        `Understood intent: ${state.understanding?.intent ?? "unknown"}`,
        `Plan:\n${(state.requestPlan?.steps ?? []).map((step, i) => `${i + 1}. ${step}`).join("\n")}`,
      ].join("\n\n"),
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
            summary: "ForgeMind could not decide how to proceed.",
          }),
        ],
      };
    }

    const next =
      outcome.data.action === "continue"
        ? "Continue to the engineering tools."
        : "No external engineering action is required.";
    return {
      workflowDecision: outcome.data,
      events: [
        createEvent(deps.now, {
          type: "decision_made",
          stage: "reasoning",
          status: "success",
          summary: `Decision: ${next} ${outcome.data.reason}`,
        }),
      ],
    };
  };
}
