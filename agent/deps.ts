import type { IntegrationConfig } from "./config";
import type { StructuredModel } from "./model";
import type { SwytchExecutor } from "./swytchcode/types";

/** Everything the graph needs from the outside world, injected for testability. */
export type AgentDeps = {
  model: StructuredModel;
  executor: SwytchExecutor;
  config: IntegrationConfig;
  now: () => Date;
};
