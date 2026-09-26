import type { AgentDeps } from "@/agent/deps";
import { FakeModel, fixedNow } from "./fake-model";
import { MockSwytchExecutor } from "./mock-executor";

export const TEST_CONFIG: AgentDeps["config"] = {
  github: { owner: "forgemind-demo", name: "demo-issues" },
};

/** Raw GitHub REST "list issues" items for the locked demo scenario. */
export const DEMO_GITHUB_ISSUES = [
  { number: 101, title: "Payment processing fails", body: "Customers cannot complete payment.", state: "open", labels: [{ name: "bug" }] },
  { number: 102, title: "Button alignment issue", body: "The button is slightly misaligned.", state: "open", labels: [] },
  { number: 103, title: "Authentication bypass", body: "A user can access another user's account.", state: "open", labels: [{ name: "security" }] },
  { number: 104, title: "README typo", body: "One spelling error in documentation.", state: "open", labels: ["docs"] },
  { number: 105, title: "Database timeout", body: "Production requests intermittently time out.", state: "open", labels: [] },
];

export function makeDeps(overrides: Partial<AgentDeps> = {}): AgentDeps {
  return {
    model: new FakeModel(),
    executor: new MockSwytchExecutor(),
    config: TEST_CONFIG,
    now: fixedNow,
    ...overrides,
  };
}
