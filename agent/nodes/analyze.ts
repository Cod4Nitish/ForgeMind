import type { AgentDeps } from "../deps";
import { createEvent } from "../events";
import { ANALYSIS_SYSTEM, untrustedBlock } from "../prompts";
import { IssueAnalysisSchema, SEVERITIES, type IssueAssessment } from "../schemas";
import type { ForgeMindStateUpdate, ForgeMindStateValue } from "../state";
import { callStructured } from "../structured";
import type { GitHubIssue } from "../swytchcode/github";

/** Every fetched issue assessed exactly once, only fetched issues, consistent flags. */
export function checkAssessments(assessments: IssueAssessment[], issues: GitHubIssue[]): string | null {
  const expected = new Set(issues.map((issue) => issue.number));
  const seen = new Set<number>();
  for (const assessment of assessments) {
    if (!expected.has(assessment.issueNumber)) return `unknown issue #${assessment.issueNumber}`;
    if (seen.has(assessment.issueNumber)) return `duplicate issue #${assessment.issueNumber}`;
    seen.add(assessment.issueNumber);
    if (assessment.actionable !== (assessment.recommendedAction === "create_jira_task")) {
      return `inconsistent actionability for #${assessment.issueNumber}`;
    }
  }
  return seen.size === expected.size ? null : "not every issue was assessed";
}

export function makeAnalyzeNode(deps: AgentDeps) {
  return async function analyzeIssues(state: ForgeMindStateValue): Promise<ForgeMindStateUpdate> {
    const issues = state.githubIssues ?? [];
    if (issues.length === 0) {
      return {
        analysisRun: "success",
        assessments: [],
        events: [
          createEvent(deps.now, {
            type: "analysis_completed",
            stage: "analysis",
            status: "skipped",
            summary: "No open issues to analyze.",
          }),
        ],
      };
    }

    const { owner, name } = deps.config.github;
    const outcome = await callStructured({
      model: deps.model,
      name: "issue_assessments",
      schema: IssueAnalysisSchema,
      system: ANALYSIS_SYSTEM,
      prompt: [
        `User request intent: ${state.understanding?.intent ?? state.userRequest}`,
        `Assess these ${issues.length} open issue(s) from ${owner}/${name}:`,
        untrustedBlock(issues.map(({ number, title, body, labels }) => ({ number, title, body, labels }))),
      ].join("\n\n"),
      effort: "medium",
      check: (value) => checkAssessments(value.assessments, issues),
    });

    if (!outcome.ok) {
      return {
        analysisRun: "failed",
        errors: [{ stage: "analysis", code: outcome.code, message: outcome.message }],
        events: [
          createEvent(deps.now, {
            type: "analysis_completed",
            stage: "analysis",
            status: "error",
            summary: "Issue analysis failed; no follow-up actions were taken.",
          }),
        ],
      };
    }

    // Keep GitHub's order and titles (the model's copy of a title is not used).
    const byNumber = new Map(outcome.data.assessments.map((a) => [a.issueNumber, a]));
    const assessments = issues.map((issue) => ({
      ...byNumber.get(issue.number)!,
      title: issue.title || "(untitled)",
    }));

    const counts = SEVERITIES.map((severity) => {
      const n = assessments.filter((a) => a.severity === severity).length;
      return n > 0 ? `${n} ${severity}` : null;
    }).filter(Boolean);
    const actionable = assessments.filter((a) => a.actionable).length;

    return {
      analysisRun: "success",
      assessments,
      events: [
        createEvent(deps.now, {
          type: "analysis_completed",
          stage: "analysis",
          status: "success",
          summary: `${assessments.length} issue(s) analyzed (${counts.join(", ")}); ${actionable} actionable.`,
        }),
      ],
    };
  };
}
