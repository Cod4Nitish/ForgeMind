import type { StructuredModel } from "./model";

/** Everything the graph needs from the outside world, injected for testability. */
export type AgentDeps = {
  model: StructuredModel;
  now: () => Date;
};
