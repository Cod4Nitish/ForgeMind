import type { AgentDeps } from "../deps";
import { createEvent } from "../events";
import { PLAN_SYSTEM } from "../prompts";
import { RequestPlanSchema } from "../schemas";
import type { ForgeMindStateUpdate, ForgeMindStateValue } from "../state";
import { callStructured } from "../structured";

export function makePlanNode(deps: AgentDeps) {
  return async function plan(state: ForgeMindStateValue): Promise<ForgeMindStateUpdate> {
    const outcome = await callStructured({
      model: deps.model,
      name: "request_plan",
      schema: RequestPlanSchema,
      system: PLAN_SYSTEM,
      prompt: [
        `User request:\n${state.userRequest}`,
        `Understood intent: ${state.understanding?.intent ?? "unknown"}`,
        `Requested actions: ${state.understanding?.requestedActions.join(", ") || "none"}`,
      ].join("\n\n"),
      effort: "low",
      // Jira tasks and Slack notifications are always based on GitHub issues.
      check: (value) =>
        (value.requiredTools.jira || value.requiredTools.slack) && !value.requiredTools.github
          ? "jira/slack work requires GitHub issue data"
          : null,
    });

    if (!outcome.ok) {
      return {
        errors: [{ stage: "reasoning", code: outcome.code, message: outcome.message }],
        events: [
          createEvent(deps.now, {
            type: "decision_made",
            stage: "reasoning",
            status: "error",
            summary: "ForgeMind could not plan the request.",
          }),
        ],
      };
    }

    return {
      requestPlan: outcome.data,
      events: [
        createEvent(deps.now, {
          type: "analysis_completed",
          stage: "reasoning",
          status: "success",
          summary: `Plan prepared (${outcome.data.steps.length} step(s)); tools: ${
            (["github", "jira", "slack"] as const).filter((t) => outcome.data.requiredTools[t]).join(", ") || "none"
          }.`,
        }),
      ],
    };
  };
}
