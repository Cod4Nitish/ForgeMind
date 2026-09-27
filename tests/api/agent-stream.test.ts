import { describe, expect, it } from "vitest";
import { DEMO_CONFIG, DemoExecutor, DemoModel } from "@/agent/demo";
import type { AgentDeps } from "@/agent/deps";
import type { AgentStreamMessage } from "@/lib/api/contract";
import { handleAgentRequest } from "@/lib/api/handle-agent-request";
import { FakeModel } from "../helpers/fake-model";
import { makeDeps } from "../helpers/fixtures";

const demoDeps = (): AgentDeps => ({
  model: new DemoModel(),
  executor: new DemoExecutor(),
  config: DEMO_CONFIG,
  now: () => new Date(),
});

function post(message: string, accept: string) {
  return new Request("http://localhost/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json", accept },
    body: JSON.stringify({ message }),
  });
}

async function readLines(res: Response): Promise<AgentStreamMessage[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as AgentStreamMessage);
}

const FULL_REQUEST =
  "Check the latest open GitHub issues, create Jira tasks for the actionable ones and notify the team on Slack.";

describe("POST /api/agent progress stream", () => {
  it("streams real stage starts and events, ending in the same result", { timeout: 30_000 }, async () => {
    const res = await handleAgentRequest(post(FULL_REQUEST, "application/x-ndjson"), demoDeps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");

    const lines = await readLines(res);
    expect(lines[0]).toMatchObject({ type: "run_started" });
    const last = lines.at(-1)!;
    expect(last.type).toBe("result");
    if (last.type !== "result") return;
    expect(res.headers.get("x-forgemind-run-id")).toBe(last.result.runId);

    // Streamed events are exactly the result's events, in the same order.
    const streamed = lines.flatMap((line) => (line.type === "event" ? [line.event] : []));
    expect(streamed).toEqual(last.result.events);

    // Stages start in workflow order.
    const started = lines.flatMap((line) => (line.type === "stage_started" ? [line.stage] : []));
    expect([...new Set(started)]).toEqual(["reasoning", "github", "analysis", "jira", "verification", "slack", "final"]);

    // Each stage's start is reported before any event from its own nodes.
    const firstStart = (stage: string) => lines.findIndex((l) => l.type === "stage_started" && l.stage === stage);
    const firstEvent = (stage: string) => lines.findIndex((l) => l.type === "event" && l.event.stage === stage);
    for (const stage of ["reasoning", "github", "verification", "final"]) {
      expect(firstStart(stage)).toBeLessThan(firstEvent(stage));
    }
  });

  it("only reports the stages a short run actually used", async () => {
    const deps = () =>
      makeDeps({
        model: new FakeModel({
          request_understanding: { intent: "Explain ForgeMind", requestedActions: ["explain"] },
          request_plan: { steps: ["Explain"], requiredTools: { github: false, jira: false, slack: false } },
          workflow_decision: { action: "finish", reason: "No tools needed." },
        }),
      });
    const lines = await readLines(await handleAgentRequest(post("Explain what ForgeMind does.", "application/x-ndjson"), deps));
    const started = new Set(lines.flatMap((line) => (line.type === "stage_started" ? [line.stage] : [])));
    expect([...started]).toEqual(["reasoning", "final"]);
    expect(lines.at(-1)?.type).toBe("result");
  });

  it("keeps the single JSON response for ordinary clients", async () => {
    const res = await handleAgentRequest(post("Explain what ForgeMind does.", "application/json"), () =>
      makeDeps({
        model: new FakeModel({
          request_understanding: { intent: "Explain ForgeMind", requestedActions: ["explain"] },
          request_plan: { steps: ["Explain"], requiredTools: { github: false, jira: false, slack: false } },
          workflow_decision: { action: "finish", reason: "No tools needed." },
        }),
      }),
    );
    expect(res.headers.get("content-type")).toContain("application/json");
    expect((await res.json()).status).toBe("success");
  });

  it("ends with a safe error line when the run crashes", async () => {
    const crashing = () => makeDeps({ model: { generate: () => Promise.reject(new TypeError("boom")) } });
    const lines = await readLines(await handleAgentRequest(post("Explain what ForgeMind does.", "application/x-ndjson"), crashing));
    const last = lines.at(-1)!;
    // A model failure is handled inside the graph; either way the stream ends cleanly.
    expect(["result", "error"]).toContain(last.type);
    expect(JSON.stringify(lines)).not.toContain("boom");
  });
});
