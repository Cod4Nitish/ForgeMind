import { describe, expect, it } from "vitest";
import { DEFAULT_ANTHROPIC_MODEL, loadModelConfig } from "@/agent/config";
import { ConfigError } from "@/agent/errors";

describe("loadModelConfig", () => {
  it("requires ANTHROPIC_API_KEY and names the variable, not a value", () => {
    expect(() => loadModelConfig({})).toThrow(ConfigError);
    expect(() => loadModelConfig({ ANTHROPIC_API_KEY: "   " })).toThrow(/ANTHROPIC_API_KEY is not configured/);
  });

  it("defaults the model and honours ANTHROPIC_MODEL", () => {
    expect(loadModelConfig({ ANTHROPIC_API_KEY: "test-key" }).model).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(loadModelConfig({ ANTHROPIC_API_KEY: "test-key", ANTHROPIC_MODEL: "claude-sonnet-5" }).model).toBe(
      "claude-sonnet-5",
    );
  });
});
