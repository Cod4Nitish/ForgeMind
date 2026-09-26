import type { AgentDeps } from "../deps";
import { createEvent } from "../events";
import type { ForgeMindStateUpdate } from "../state";
import { buildListIssuesInput, parseGitHubIssues } from "../swytchcode/github";
import { invalidResponseError } from "../swytchcode/errors";
import { SWYTCH_TOOLS } from "../swytchcode/tools";

const TOOL = "githubListOpenIssues";

/** Retrieves open issues from the configured repository through Swytchcode. */
export function makeGitHubNode(deps: AgentDeps) {
  return async function github(): Promise<ForgeMindStateUpdate> {
    const { canonicalId } = SWYTCH_TOOLS[TOOL];
    const repo = deps.config.github;
    const started = [
      createEvent(deps.now, {
        type: "tool_selected",
        stage: "github",
        status: "success",
        summary: "GitHub selected to retrieve open issues.",
        tool: canonicalId,
      }),
      createEvent(deps.now, {
        type: "tool_started",
        stage: "github",
        status: "running",
        summary: `Retrieving open issues from ${repo.owner}/${repo.name}.`,
        tool: canonicalId,
      }),
    ];

    const result = await deps.executor.execute(TOOL, buildListIssuesInput(repo));
    const parsed = result.ok ? parseGitHubIssues(result.data, repo) : undefined;
    const error = !result.ok ? result.error : parsed && !parsed.ok ? invalidResponseError("GitHub") : undefined;

    if (error || !parsed || !parsed.ok) {
      const failure = error ?? invalidResponseError("GitHub");
      return {
        githubRun: { status: "failed", issueCount: 0, skippedCount: 0, errorCategory: failure.category },
        errors: [{ stage: "github", code: "tool_error", message: failure.message }],
        events: [
          ...started,
          createEvent(deps.now, {
            type: "tool_failed",
            stage: "github",
            status: "error",
            summary: failure.message,
            tool: canonicalId,
          }),
        ],
      };
    }

    const count = parsed.issues.length;
    return {
      githubIssues: parsed.issues,
      githubRun: { status: "success", issueCount: count, skippedCount: parsed.skipped },
      events: [
        ...started,
        createEvent(deps.now, {
          type: "tool_completed",
          stage: "github",
          status: "success",
          summary:
            count === 0
              ? "No open GitHub issues were found."
              : `${count} open GitHub issue${count === 1 ? "" : "s"} retrieved.`,
          tool: canonicalId,
        }),
      ],
    };
  };
}
