import { ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { AgentErrorSchema } from "./errors";
import { AgentEventSchema } from "./events";
import { DecisionSchema, RequestPlanSchema, RequestUnderstandingSchema } from "./schemas";

/**
 * ForgeMind's explicit graph state. Every field is typed, serializable and
 * validated by LangGraph on update. Private model reasoning is never stored.
 */
export const ForgeMindState = new StateSchema({
  runId: z.string(),
  userRequest: z.string(),

  understanding: RequestUnderstandingSchema.optional(),
  requestPlan: RequestPlanSchema.optional(),
  workflowDecision: DecisionSchema.optional(),

  finalResponse: z.string().optional(),

  events: new ReducedValue(z.array(AgentEventSchema).default(() => []), {
    inputSchema: z.array(AgentEventSchema),
    reducer: (current, next) => [...current, ...next],
  }),
  errors: new ReducedValue(z.array(AgentErrorSchema).default(() => []), {
    inputSchema: z.array(AgentErrorSchema),
    reducer: (current, next) => [...current, ...next],
  }),
});

export type ForgeMindStateValue = typeof ForgeMindState.State;
export type ForgeMindStateUpdate = typeof ForgeMindState.Update;
