import { END, START, StateGraph } from "@langchain/langgraph";
import type { AgentDeps } from "./deps";
import { makeDecisionNode } from "./nodes/decision";
import { makeFinalizeNode } from "./nodes/finalize";
import { makePlanNode } from "./nodes/plan";
import { makeUnderstandNode } from "./nodes/understand";
import { routeAfterDecision, routeOnError } from "./routing";
import { ForgeMindState } from "./state";

/**
 * START → understandRequest → plan → decision ─┬─ continue → finalize → END
 *                                              └─ finish   → finalize
 * Errors at any stage route straight to finalize.
 */
export function buildForgeMindGraph(deps: AgentDeps) {
  return new StateGraph(ForgeMindState)
    .addNode("understandRequest", makeUnderstandNode(deps))
    .addNode("plan", makePlanNode(deps))
    .addNode("decision", makeDecisionNode(deps))
    .addNode("finalize", makeFinalizeNode(deps))
    .addEdge(START, "understandRequest")
    .addConditionalEdges("understandRequest", routeOnError("plan"), ["plan", "finalize"])
    .addConditionalEdges("plan", routeOnError("decision"), ["decision", "finalize"])
    // External tool nodes are added in the Swytchcode phase; until then both
    // outcomes of the decision finish the run.
    .addConditionalEdges("decision", routeAfterDecision, {
      continue: "finalize",
      finish: "finalize",
    })
    .addEdge("finalize", END)
    .compile();
}
