import { describe, expect, it } from "vitest";
import { z } from "zod";
import { callStructured } from "@/agent/structured";
import { FakeModel, refusal } from "../helpers/fake-model";

const Schema = z.object({ action: z.enum(["continue", "finish"]), reason: z.string().min(1) }).strict();

function call(model: FakeModel, check?: (v: z.infer<typeof Schema>) => string | null) {
  return callStructured({ model, name: "decision", schema: Schema, system: "s", prompt: "p", effort: "low", check });
}

describe("callStructured", () => {
  it("returns validated data for valid output", async () => {
    const model = new FakeModel({ decision: { action: "continue", reason: "needs tools" } });
    await expect(call(model)).resolves.toEqual({ ok: true, data: { action: "continue", reason: "needs tools" } });
  });

  it("sends a JSON schema without the $schema key", async () => {
    const model = new FakeModel({ decision: { action: "finish", reason: "done" } });
    await call(model);
    expect(model.calls[0].jsonSchema).toMatchObject({ type: "object" });
    expect(model.calls[0].jsonSchema).not.toHaveProperty("$schema");
  });

  it("re-requests once after invalid output and accepts a valid retry", async () => {
    const model = new FakeModel({ decision: [{ action: "maybe" }, { action: "finish", reason: "ok" }] });
    await expect(call(model)).resolves.toMatchObject({ ok: true });
    expect(model.calls).toHaveLength(2);
  });

  it("fails safely after two invalid outputs", async () => {
    const model = new FakeModel({ decision: [{ action: "YES, CONTINUE!!!" }, "not even an object"] });
    await expect(call(model)).resolves.toEqual({
      ok: false,
      code: "invalid_model_output",
      message: "The reasoning model returned output that failed validation.",
    });
    expect(model.calls).toHaveLength(2);
  });

  it("rejects extra fields (strict schemas)", async () => {
    const model = new FakeModel({ decision: { action: "continue", reason: "r", tool: "shell.exec" } });
    await expect(call(model)).resolves.toMatchObject({ ok: false, code: "invalid_model_output" });
  });

  it("treats a failed semantic check as invalid output", async () => {
    const model = new FakeModel({ decision: { action: "continue", reason: "r" } });
    await expect(call(model, () => "not allowed")).resolves.toMatchObject({ ok: false, code: "invalid_model_output" });
  });

  it("maps provider errors to a safe model_error without leaking details", async () => {
    const leakedKey = ["sk", "ant", "FAKE"].join("-");
    const model = new FakeModel({ decision: new Error(`401 invalid x-api-key ${leakedKey}`) });
    const outcome = await call(model);
    expect(outcome).toEqual({ ok: false, code: "model_error", message: "The reasoning model request failed." });
    expect(JSON.stringify(outcome)).not.toContain(leakedKey);
    expect(model.calls).toHaveLength(1); // API errors are not re-requested here; the SDK owns transport retries
  });

  it("maps refusals to model_refusal", async () => {
    const model = new FakeModel({ decision: refusal() });
    await expect(call(model)).resolves.toMatchObject({ ok: false, code: "model_refusal" });
  });
});
