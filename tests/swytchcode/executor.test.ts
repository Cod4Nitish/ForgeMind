import { beforeEach, describe, expect, it, vi } from "vitest";

const execMock = vi.fn();
vi.mock("@swytchcode/runtime", () => ({ exec: (...args: unknown[]) => execMock(...args) }));

const { SwytchcodeCliExecutor } = await import("@/agent/swytchcode/executor");

describe("SwytchcodeCliExecutor", () => {
  beforeEach(() => {
    execMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("executes the allowlisted canonical ID with a bounded timeout", async () => {
    execMock.mockResolvedValue([{ number: 1, title: "x" }]);
    const executor = new SwytchcodeCliExecutor({ cwd: "/app", timeoutMs: 45_000 });
    const result = await executor.execute("githubListOpenIssues", { params: { owner: "o", repo: "r" } });

    expect(execMock).toHaveBeenCalledWith(
      "github.issue.get1",
      { params: { owner: "o", repo: "r" } },
      { cwd: "/app", timeoutMs: 45_000 },
    );
    expect(result).toEqual({
      ok: true,
      tool: "githubListOpenIssues",
      canonicalId: "github.issue.get1",
      data: [{ number: 1, title: "x" }],
      attempts: 1,
    });
  });

  it("normalizes failures and does not return raw CLI output", async () => {
    const raw = Object.assign(new Error("401 Bad credentials for token ghp_FAKEFAKE"), {
      details: { category: "auth" },
    });
    execMock.mockRejectedValue(raw);
    const executor = new SwytchcodeCliExecutor({ cwd: "/app", timeoutMs: 1000 });
    const result = await executor.execute("githubListOpenIssues", {});

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      category: "auth",
      message: "The GitHub connection in Swytchcode needs attention.",
      retryable: false,
    });
    expect(JSON.stringify(result)).not.toContain("ghp_");
  });

  it("refuses tool names outside the allowlist", async () => {
    const executor = new SwytchcodeCliExecutor({ cwd: "/app", timeoutMs: 1000 });
    // @ts-expect-error — invented tools are rejected at the type level too
    await expect(executor.execute("github.repos.delete", {})).rejects.toThrow("Unknown ForgeMind tool.");
    expect(execMock).not.toHaveBeenCalled();
  });
});
