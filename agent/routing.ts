import type { ForgeMindStateValue } from "./state";

/**
 * Pure routing functions. Each reads only validated state produced by the
 * previous node, so a tool result or model decision — never a fixed sequence —
 * determines the next step. A failed stage always routes to finalize.
 */

export const routeAfterUnderstand = (s: ForgeMindStateValue) => (s.understanding ? "plan" : "finalize");

export const routeAfterPlan = (s: ForgeMindStateValue) => (s.requestPlan ? "decision" : "finalize");

export function routeAfterDecision(s: ForgeMindStateValue): "continue" | "finish" {
  return s.workflowDecision?.action === "continue" && s.requestPlan?.requiredTools.github ? "continue" : "finish";
}

export const routeAfterGitHub = (s: ForgeMindStateValue) =>
  s.githubRun?.status === "success" ? "analyzeIssues" : "finalize";

/** Follow-up decisions are only needed when the user asked for Jira or Slack. */
export function routeAfterAnalysis(s: ForgeMindStateValue): "actionabilityDecision" | "finalize" {
  const tools = s.requestPlan?.requiredTools;
  return s.analysisRun === "success" && (tools?.jira || tools?.slack) ? "actionabilityDecision" : "finalize";
}

export function routeAfterActionability(s: ForgeMindStateValue): "jira" | "notificationDecision" | "finalize" {
  if (!s.actionability) return "finalize";
  if (s.proceedToJira) return "jira";
  if (s.requestPlan?.requiredTools.slack && s.actionability.selectedIssues.length > 0) return "notificationDecision";
  return "finalize";
}

export const routeAfterNotification = (s: ForgeMindStateValue) =>
  s.notification?.shouldNotify ? "slack" : "finalize";
