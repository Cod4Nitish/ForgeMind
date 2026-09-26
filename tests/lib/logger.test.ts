import { describe, expect, it } from "vitest";
import { redact } from "@/lib/logger";

// Fake credentials are assembled at runtime so no token-shaped literal is
// committed (keeps secret scanners and `git grep` audits meaningful).
const fake = (prefix: string, body = "FAKEFAKEFAKEFAKEFAKEFAKE") => `${prefix}${body}`;

describe("redact", () => {
  it.each([
    fake("sk-" + "ant-api03-"),
    fake("gh" + "p_"),
    fake("xo" + "xb-", "1234-5678-FAKE"),
    fake("Bearer ", "eyJhbGciOiJIUzI1NiJ9.FAKE.sig"),
  ])("removes a fake credential (%#)", (secret) => {
    expect(redact(`failure: ${secret} end`)).not.toContain(secret);
  });

  it("redacts key=value style secrets but keeps the key name", () => {
    const out = redact('{"api_key":"abc123","token": "t0k3n"}');
    expect(out).not.toContain("abc123");
    expect(out).not.toContain("t0k3n");
    expect(out).toContain("api_key");
  });

  it("leaves ordinary text alone", () => {
    expect(redact("GitHub issues retrieved successfully.")).toBe("GitHub issues retrieved successfully.");
    expect(redact("ANTHROPIC_API_KEY is not configured on the server.")).toBe(
      "ANTHROPIC_API_KEY is not configured on the server.",
    );
  });
});
