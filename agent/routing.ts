import type { ForgeMindStateValue } from "./state";

/** Pure routing functions — each reads validated state only. */

/** Any recorded error stops the dependent workflow and goes to finalize. */
export function routeOnError<T extends string>(next: T) {
  return (state: ForgeMindStateValue): T | "finalize" =>
    state.errors.length > 0 ? "finalize" : next;
}

export function routeAfterDecision(state: ForgeMindStateValue): "continue" | "finish" {
  if (state.errors.length > 0 || !state.workflowDecision) return "finish";
  return state.workflowDecision.action;
}
