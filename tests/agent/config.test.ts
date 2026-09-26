import { describe, expect, it } from "vitest";
import { DEFAULT_ANTHROPIC_MODEL, loadIntegrationConfig, loadModelConfig, parseRepository } from "@/agent/config";
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

describe("loadIntegrationConfig", () => {
  it("requires the GitHub repository", () => {
    expect(() => loadIntegrationConfig({})).toThrow(/FORGEMIND_GITHUB_REPOSITORY is not configured/);
  });

  it("parses owner/repo", () => {
    expect(loadIntegrationConfig({ FORGEMIND_GITHUB_REPOSITORY: "Cod4Nitish/forgemind-demo" }).github).toEqual({
      owner: "Cod4Nitish",
      name: "forgemind-demo",
    });
  });

  it.each([
    "no-slash",
    "a/b/c",
    "owner/",
    "/repo",
    "owner/..",
    "own er/repo",
    "owner/repo?x=1",
    "https://github.com/owner/repo",
    "-owner/repo",
  ])("rejects malformed repository %j", (value) => {
    expect(parseRepository(value)).toBeUndefined();
    expect(() => loadIntegrationConfig({ FORGEMIND_GITHUB_REPOSITORY: value })).toThrow(ConfigError);
  });
});
