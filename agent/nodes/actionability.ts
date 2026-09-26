import type { AgentDeps } from "../deps";
import { createEvent, type AgentEvent } from "../events";
import { ACTIONABILITY_SYSTEM, untrustedBlock } from "../prompts";
import { ActionabilityDecisionSchema, type ActionabilityDecision, type IssueAssessment } from "../schemas";
import type { ForgeMindStateUpdate, ForgeMindStateValue } from "../state";
import { callStructured } from "../structured";

/** The decision may only select issues the analysis marked actionable. */
export function checkActionability(decision: ActionabilityDecision, assessments: IssueAssessment[]): string | null {
  const actionable = new Set(assessments.filter((a) => a.actionable).map((a) => a.issueNumber));
  const seen = new Set<number>();
  for (const number of decision.selectedIssues) {
    if (!actionable.has(number)) return `issue #${number} is not an actionable assessed issue`;
    if (seen.has(number)) return `duplicate issue #${number}`;
    seen.add(number);
  }
  if (decision.shouldCreateJira !== decision.selectedIssues.length > 0) {
    return "shouldCreateJira must match whether issues were selected";
  }
  return null;
}

export function makeActionabilityNode(deps: AgentDeps) {
  return async function actionabilityDecision(state: ForgeMindStateValue): Promise<ForgeMindStateUpdate> {
    const assessments = state.assessments ?? [];
    const jiraRequested = state.requestPlan?.requiredTools.jira ?? false;

    if (!assessments.some((a) => a.actionable)) {
      return {
        actionability: { shouldCreateJira: false, selectedIssues: [], reason: "No issue requires engineering action." },
        proceedToJira: false,
        events: [
          createEvent(deps.now, {
            type: "decision_made",
            stage: "analysis",
            status: "success",
            summary: "Decision: no issue requires engineering action.",
          }),
        ],
      };
    }

    const outcome = await callStructured({
      model: deps.model,
      name: "actionability_decision",
      schema: ActionabilityDecisionSchema,
      system: ACTIONABILITY_SYSTEM,
      prompt: [
        `User request intent: ${state.understanding?.intent ?? state.userRequest}`,
        `The user ${jiraRequested ? "asked" : "did not ask"} for Jira tasks.`,
        "Issue assessments (derived from untrusted issue content):",
        untrustedBlock(assessments),
      ].join("\n\n"),
      effort: "medium",
      check: (value) => checkActionability(value, assessments),
    });

    if (!outcome.ok) {
      return {
        proceedToJira: false,
        errors: [{ stage: "analysis", code: outcome.code, message: outcome.message }],
        events: [
          createEvent(deps.now, {
            type: "decision_made",
            stage: "analysis",
            status: "error",
            summary: "The actionability decision failed validation; no follow-up actions were taken.",
          }),
        ],
      };
    }

    const decision = outcome.data;
    const proceedToJira = decision.shouldCreateJira && jiraRequested;
    const selected = decision.selectedIssues.map((n) => `#${n}`).join(", ");
    const events: AgentEvent[] = [
      createEvent(deps.now, {
        type: "decision_made",
        stage: "analysis",
        status: "success",
        summary: decision.selectedIssues.length
          ? `Decision: ${decision.selectedIssues.length} issue(s) need engineering action (${selected}). ${decision.reason}`
          : `Decision: no issue requires engineering action. ${decision.reason}`,
      }),
    ];
    if (decision.shouldCreateJira && !jiraRequested) {
      events.push(
        createEvent(deps.now, {
          type: "step_skipped",
          stage: "jira",
          status: "skipped",
          summary: "Jira task creation was not requested.",
        }),
      );
    }

    return { actionability: decision, proceedToJira, events };
  };
}
