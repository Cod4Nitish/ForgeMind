import { describe, expect, it } from "vitest";
import { buildListIssuesInput, parseGitHubIssues, MAX_ISSUES } from "@/agent/swytchcode/github";
import { DEMO_GITHUB_ISSUES, TEST_CONFIG } from "../helpers/fixtures";

const repo = TEST_CONFIG.github;

describe("buildListIssuesInput", () => {
  it("targets only the configured repository and open issues", () => {
    expect(buildListIssuesInput(repo)).toEqual({
      params: { owner: "forgemind-demo", repo: "demo-issues", state: "open", per_page: String(MAX_ISSUES) },
    });
  });
});

describe("parseGitHubIssues", () => {
  it("normalizes a plain list", () => {
    const parsed = parseGitHubIssues(DEMO_GITHUB_ISSUES, repo);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.issues.map((i) => i.number)).toEqual([101, 102, 103, 104, 105]);
    expect(parsed.issues[0]).toEqual({
      number: 101,
      title: "Payment processing fails",
      body: "Customers cannot complete payment.",
      url: "https://github.com/forgemind-demo/demo-issues/issues/101",
      labels: ["bug"],
    });
    expect(parsed.issues[3].labels).toEqual(["docs"]);
  });

  it.each([
    ["body wrapper", { status: 200, body: DEMO_GITHUB_ISSUES }],
    ["data wrapper", { data: DEMO_GITHUB_ISSUES }],
    ["nested wrapper", { result: { body: DEMO_GITHUB_ISSUES } }],
  ])("unwraps a %s", (_label, raw) => {
    const parsed = parseGitHubIssues(raw, repo);
    expect(parsed.ok && parsed.issues).toHaveLength(5);
  });

  it("returns an empty list for a repository without open issues", () => {
    expect(parseGitHubIssues([], repo)).toEqual({ ok: true, issues: [], skipped: 0 });
  });

  it.each([
    ["null", null],
    ["a string", "rate limited"],
    ["an error object", { message: "Not Found", documentation_url: "https://docs.github.com" }],
    ["a number", 42],
  ])("rejects %s as unexpected data", (_label, raw) => {
    expect(parseGitHubIssues(raw, repo)).toEqual({ ok: false });
  });

  it("skips pull requests, malformed, closed and duplicate entries", () => {
    const parsed = parseGitHubIssues(
      [
        DEMO_GITHUB_ISSUES[0],
        { number: 200, title: "A PR", pull_request: { url: "x" } },
        { number: "abc", title: "bad number" },
        { title: "no number" },
        { number: 201, title: "Closed", state: "closed" },
        DEMO_GITHUB_ISSUES[0],
      ],
      repo,
    );
    expect(parsed).toMatchObject({ ok: true, skipped: 5 });
    expect(parsed.ok && parsed.issues.map((i) => i.number)).toEqual([101]);
  });

  it("bounds title/body length and never trusts response URLs", () => {
    const parsed = parseGitHubIssues(
      [{ number: 7, title: "t".repeat(1000), body: "b".repeat(10_000), html_url: "https://evil.example/phish" }],
      repo,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.issues[0].title.length).toBeLessThanOrEqual(300);
    expect(parsed.issues[0].body.length).toBeLessThanOrEqual(2000);
    expect(parsed.issues[0].url).toBe("https://github.com/forgemind-demo/demo-issues/issues/7");
  });

  it("caps the number of issues", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ number: i + 1, title: `Issue ${i + 1}` }));
    const parsed = parseGitHubIssues(many, repo);
    expect(parsed.ok && parsed.issues).toHaveLength(MAX_ISSUES);
  });
});
