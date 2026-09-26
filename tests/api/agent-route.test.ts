import { describe, expect, it } from "vitest";
import { ConfigError } from "@/agent/errors";
import { handleAgentRequest } from "@/lib/api/handle-agent-request";
import { MAX_MESSAGE_LENGTH, MAX_REQUEST_BYTES } from "@/lib/api/agent-request";
import { FakeModel, fixedNow } from "../helpers/fake-model";

const okDeps = () => ({
  model: new FakeModel({
    request_understanding: { intent: "Explain ForgeMind", requestedActions: ["explain"] },
    request_plan: { steps: ["Explain capabilities"] },
    workflow_decision: { action: "finish", reason: "No tools needed." },
  }),
  now: fixedNow,
});

function post(body: string, contentType = "application/json") {
  return new Request("http://localhost/api/agent", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

describe("POST /api/agent validation", () => {
  it("accepts a valid message", async () => {
    const res = await handleAgentRequest(post(JSON.stringify({ message: "Explain what ForgeMind does." })), okDeps);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("completed");
    expect(res.headers.get("x-forgemind-run-id")).toBe(json.runId);
  });

  it("accepts prompt as an alias", async () => {
    const res = await handleAgentRequest(post(JSON.stringify({ prompt: "Explain what ForgeMind does." })), okDeps);
    expect(res.status).toBe(200);
  });

  it.each([
    ["empty message", { message: "" }],
    ["whitespace message", { message: "   " }],
    ["non-string message", { message: 42 }],
    ["missing message", {}],
    ["both message and prompt", { message: "a", prompt: "b" }],
    ["unknown field", { message: "hi", repository: "attacker/repo" }],
    ["array body", ["hi"]],
    ["null body", null],
  ])("rejects %s with 400", async (_label, body) => {
    const res = await handleAgentRequest(post(JSON.stringify(body)), okDeps);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_request");
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await handleAgentRequest(post("{not json"), okDeps);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_json");
  });

  it("rejects an over-long message with 400", async () => {
    const res = await handleAgentRequest(post(JSON.stringify({ message: "a".repeat(MAX_MESSAGE_LENGTH + 1) })), okDeps);
    expect(res.status).toBe(400);
  });

  it("rejects an oversized body with 413", async () => {
    const res = await handleAgentRequest(post(JSON.stringify({ message: "a".repeat(MAX_REQUEST_BYTES) })), okDeps);
    expect(res.status).toBe(413);
  });

  it("rejects non-JSON content types with 415", async () => {
    const res = await handleAgentRequest(post("message=hi", "application/x-www-form-urlencoded"), okDeps);
    expect(res.status).toBe(415);
  });

  it("returns a safe 503 when configuration is missing", async () => {
    const res = await handleAgentRequest(post(JSON.stringify({ message: "hi there" })), () => {
      throw new ConfigError("ANTHROPIC_API_KEY is not configured on the server.");
    });
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.code).toBe("configuration_error");
    expect(JSON.stringify(json)).not.toContain("ANTHROPIC_API_KEY");
  });

  it("returns a safe 500 when the workflow crashes", async () => {
    const res = await handleAgentRequest(post(JSON.stringify({ message: "hi there" })), () => ({
      model: {
        generate: () => {
          throw new Error("unused");
        },
      },
      now: () => {
        throw new Error("clock exploded at /srv/secret/path");
      },
    }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain("internal_error");
    expect(text).not.toContain("/srv/secret/path");
  });
});
