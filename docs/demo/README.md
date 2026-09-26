# ForgeMind Demo Guide

This guide shows how to demo ForgeMind, and exactly what has and has not been verified.

## Demo setup

| Item | Value |
| --- | --- |
| GitHub repository | [`Cod4Nitish/forgemind-demo`](https://github.com/Cod4Nitish/forgemind-demo) (`FORGEMIND_GITHUB_REPOSITORY`) |
| Jira project | `SCRUM` on a test Jira Cloud site (`FORGEMIND_JIRA_PROJECT`) |
| Slack channel | `#all-forgemind-demo` in the "ForgeMind Demo" workspace (`FORGEMIND_SLACK_CHANNEL`) |
| Execution layer | Swytchcode workspace with GitHub, Jira and Slack connected |

## Demo data: open issues #1–#5

The demo repository contains five open issues, chosen so that a correct agent must **discriminate** rather than act on everything:

| # | Title | Label | Intended judgement | Why it's in the set |
| --- | --- | --- | --- | --- |
| #1 | Payment failure: checkout payments intermittently failing | bug | Critical, create a Jira task | Revenue-impacting production bug |
| #2 | UI alignment issue: checkout button misaligned on small screens | bug | Low, no task | Real bug, but cosmetic; tests severity judgement |
| #3 | Authentication bypass: crafted request may skip auth check | bug | Critical (security), create a Jira task | Security issue |
| #4 | README typo in setup instructions | documentation | Low, no task | Not an engineering bug |
| #5 | Database timeout: requests time out under load | bug | High, create a Jira task | Reliability and performance |

The "intended judgement" column is the scenario's design. At run time, Claude assesses each issue and the UI shows its actual severity, impact and decision.

## Demo request

```text
Check the latest open GitHub issues, identify critical/high-priority bugs, create Jira tasks for the actionable ones, and notify the engineering team on Slack.
```

The same text is behind the **Use demo request** button in the Command Center.

### Variations that show the agent is not a fixed chain

| Request | Expected route |
| --- | --- |
| The demo request above | understand → plan → decision → github → analyze → actionability → jira → verifyJira → notification → slack → finalize |
| "Summarise the open GitHub issues. Don't create tickets or send messages." | … → github → analyze → **finalize** (no Jira, no Slack) |
| "Tell the team on Slack if there are any critical bugs." | … → analyze → actionability → **notificationDecision** → slack (no Jira) |
| "What does ForgeMind do?" | understand → plan → decision **finish** → finalize (no external calls) |

## Walkthrough (about 2 minutes)

1. **Command Center.** Open `http://localhost:3000`. Point out the integrations strip (GitHub, Jira, Slack via Swytchcode) and the system status.
2. **Request.** Click **Use demo request**, then **Execute** (or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd>).
3. **Workflow strip.** Request → Reason → GitHub → Analyze → Jira → Verify → Slack → Result, each with its own status and duration.
4. **Execution log.** The ordered event timeline, with the Swytchcode canonical ID shown for each tool call.
5. **GitHub issues table.** Severity, impact and decision per issue; selected issues show their Jira key.
6. **Jira list.** Each created task with its priority and verification state (`verified` after the read-back).
7. **Slack card.** Sent, skipped or failed, with the reason.
8. **Run overview.** A final `success`, `partial` or `failed` status and summary. A partial run (for example, Slack failing after Jira succeeded) is shown as partial, never as success.

## Screenshots

These are in [`../assets/screenshots/`](../assets/screenshots). They were captured from the real UI at a 1920×1080 desktop viewport; some are cropped to a single panel. The mobile shot is a full-page capture at 390 px wide.

> **Mocked responses:** `01` is the idle UI before any request is sent. Screenshots `02`–`09` show the real UI rendering a **mocked** `/api/agent` response. The mock was injected in the browser by a local capture script, not by the app, and each of these carries the on-screen label *"Local demo verification — mocked response, no external actions performed"*. No GitHub, Jira or Slack action was performed to produce any of them.

| File | Shows |
| --- | --- |
| `01-command-center.png` | Idle Command Center |
| `02-running-workflow.png` | Workflow in progress |
| `03-github-analysis.png` | Issue analysis table |
| `04-jira-action.png` | Jira tasks and verification |
| `05-slack-notification.png` | Slack notification card |
| `06-final-result.png` | Completed run overview |
| `07-partial-success.png` | Partial-success state |
| `08-error-state.png` | Error state |
| `09-mobile.png` | Mobile layout |

## What has been verified

| Check | Status |
| --- | --- |
| Deterministic test suite (fake model + mock executor), lint, typecheck, build | Passing |
| Swytchcode → GitHub: list issues of the demo repository | Verified (read-only) |
| Swytchcode → Jira: authenticated user and `SCRUM` project | Verified (read-only) |
| Swytchcode → Slack: auth test and channel visibility | Verified (read-only) |
| UI states: idle, running, success, partial, error, mobile | Verified locally with mocked responses |
| Hosted UI at <https://forgemind-ashy.vercel.app> (`/` and `/api/health`) | Verified |
| **Full live run** (Claude plus real Jira creation and Slack post) | **Not yet executed** |

**Before the first live run:**
- Set `ANTHROPIC_API_KEY` in `.env.local`.
- Invite the Swytchcode Slack app to `#all-forgemind-demo`. The channel is visible to the app, but the app is not yet a member.

The live suite is gated: `FORGEMIND_LIVE_E2E=1 npm run test:live`.

## Demo video

The video is not linked in this repository yet. A link will be added once it is published. Any recording made from mocked responses carries the same "mocked response" label as the screenshots.
