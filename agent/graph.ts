import { END, START, StateGraph } from "@langchain/langgraph";
import type { AgentDeps } from "./deps";
import { makeActionabilityNode } from "./nodes/actionability";
import { makeAnalyzeNode } from "./nodes/analyze";
import { makeDecisionNode } from "./nodes/decision";
import { makeFinalizeNode } from "./nodes/finalize";
import { makeGitHubNode } from "./nodes/github";
import { makeJiraNode } from "./nodes/jira";
import { makeNotificationNode } from "./nodes/notification";
import { makePlanNode } from "./nodes/plan";
import { makeSlackNode } from "./nodes/slack";
import { makeUnderstandNode } from "./nodes/understand";
import { makeVerifyJiraNode } from "./nodes/verify-jira";
import {
  routeAfterActionability,
  routeAfterAnalysis,
  routeAfterDecision,
  routeAfterGitHub,
  routeAfterNotification,
  routeAfterPlan,
  routeAfterUnderstand,
} from "./routing";
import { ForgeMindState } from "./state";

/**
 * START → understandRequest → plan → decision ─┬─ finish ─────────────────────────────┐
 *                                              └─ continue → github ─(failed)─────────┤
 *   github → analyzeIssues ─(failed / no follow-up requested)─────────────────────────┤
 *   analyzeIssues → actionabilityDecision ─┬─ nothing to do ─────────────────────────┤
 *                                          ├─ Slack only → notificationDecision       │
 *                                          └─ Jira → jira → verifyJira → notificationDecision
 *   notificationDecision ─┬─ no → finalize                                            │
 *                         └─ yes → slack → finalize ← ───────────────────────────────┘
 */
export function buildForgeMindGraph(deps: AgentDeps) {
  return new StateGraph(ForgeMindState)
    .addNode("understandRequest", makeUnderstandNode(deps))
    .addNode("plan", makePlanNode(deps))
    .addNode("decision", makeDecisionNode(deps))
    .addNode("github", makeGitHubNode(deps))
    .addNode("analyzeIssues", makeAnalyzeNode(deps))
    .addNode("actionabilityDecision", makeActionabilityNode(deps))
    .addNode("jira", makeJiraNode(deps))
    .addNode("verifyJira", makeVerifyJiraNode(deps))
    .addNode("notificationDecision", makeNotificationNode(deps))
    .addNode("slack", makeSlackNode(deps))
    .addNode("finalize", makeFinalizeNode(deps))
    .addEdge(START, "understandRequest")
    .addConditionalEdges("understandRequest", routeAfterUnderstand, ["plan", "finalize"])
    .addConditionalEdges("plan", routeAfterPlan, ["decision", "finalize"])
    .addConditionalEdges("decision", routeAfterDecision, { continue: "github", finish: "finalize" })
    .addConditionalEdges("github", routeAfterGitHub, ["analyzeIssues", "finalize"])
    .addConditionalEdges("analyzeIssues", routeAfterAnalysis, ["actionabilityDecision", "finalize"])
    .addConditionalEdges("actionabilityDecision", routeAfterActionability, ["jira", "notificationDecision", "finalize"])
    .addEdge("jira", "verifyJira")
    .addEdge("verifyJira", "notificationDecision")
    .addConditionalEdges("notificationDecision", routeAfterNotification, ["slack", "finalize"])
    .addEdge("slack", "finalize")
    .addEdge("finalize", END)
    .compile();
}
