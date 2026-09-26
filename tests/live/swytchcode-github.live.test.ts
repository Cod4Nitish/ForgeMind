import { describe, expect, it } from "vitest";
import { loadIntegrationConfig } from "@/agent/config";
import { SwytchcodeCliExecutor } from "@/agent/swytchcode/executor";
import { buildListIssuesInput, parseGitHubIssues } from "@/agent/swytchcode/github";

/**
 * Real, read-only Swytchcode → GitHub call. Not mocked on purpose.
 * Requires: `swytchcode login`, `swytchcode get github`, the list-issues
 * method enabled in .swytchcode/tooling.json, a connected GitHub account and
 * FORGEMIND_GITHUB_REPOSITORY. Run with `npm run test:live`.
 */
describe("live: Swytchcode GitHub read", () => {
  it("lists open issues from the configured repository", async () => {
    const config = loadIntegrationConfig();
    const executor = new SwytchcodeCliExecutor({ cwd: process.cwd(), timeoutMs: 60_000 });
    const result = await executor.execute("githubListOpenIssues", buildListIssuesInput(config.github));

    if (!result.ok) throw new Error(`Swytchcode execution failed: ${result.error.category} — ${result.error.message}`);
    const parsed = parseGitHubIssues(result.data, config.github);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      console.info(`live: ${parsed.issues.length} open issue(s), ${parsed.skipped} skipped`);
    }
  }, 90_000);
});
