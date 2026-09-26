# Security Policy

ForgeMind is an agent that can take real actions: it creates Jira tasks and posts Slack messages. This document describes the controls that bound what it can do and the known limitations.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Contact the maintainer privately through the [@Cod4Nitish](https://github.com/Cod4Nitish) GitHub profile, including steps to reproduce. Never include real tokens or credentials in a report.

## Threat model

| Asset | Threat | Control |
| --- | --- | --- |
| API keys and provider tokens | Leaking to the browser, the logs or git | Server-only env vars; provider tokens stay in Swytchcode's credential store; log redaction; `.gitignore` / `.vercelignore` |
| External systems (Jira, Slack) | Agent writes to the wrong place or too often | Server-configured destinations; fixed tool allowlist; no automatic retry of writes |
| Agent decisions | Prompt injection through GitHub issue content | Untrusted-data fencing; schema and semantic validation of every model output |
| Users | Misleading results | Deterministic `success` / `partial` / `failed` summary; Jira read-back verification |

## Controls

### Secrets
- Secrets are read only on the server from environment variables. The modules that load configuration, the model and the executor import `server-only`, so they can't be bundled for the browser. The variables are: `ANTHROPIC_API_KEY`, and `SWYTCHCODE_TOKEN` for headless environments.
- **No `NEXT_PUBLIC_` variables hold secrets**, so nothing sensitive is inlined into the client bundle.
- GitHub, Jira and Slack credentials are held by the Swytchcode CLI's credential store, not by ForgeMind code, and are never read or logged by the app.
- `.env.local` and every other `.env.*` file are gitignored, except `.env.example`, which contains variable names only. `.vercelignore` excludes local env files, `.vercel/` and local agent folders from deployments.
- Configuration errors name the missing variable, never its value.

### Input handling (`POST /api/agent`)
- `Content-Type: application/json` is required; the body is limited to 16 KB and the message to 4,000 characters.
- The body schema is strict: only `message` (or its alias `prompt`). Unknown fields such as a repository, channel, model or tool are rejected.

### Trusted destinations
- The GitHub repository, Jira project and Slack channel come **only** from server configuration (`FORGEMIND_*` variables), validated by format.
- The user's prompt, the model's output and issue content can't change them.

### Tool execution
- There is a fixed allowlist of four Swytchcode tools ([`agent/swytchcode/tools.ts`](agent/swytchcode/tools.ts)):
  - GitHub list issues (read);
  - Jira create issue (write);
  - Jira get issue (read);
  - Slack post message (write).
- The model never supplies a tool name, canonical ID, URL or destination.
- **Writes are never retried automatically.** A timed-out write may already have succeeded, so it is reported as failed instead of risking a duplicate task or message. Reads are retried once on transient errors.
- Each created Jira task is **read back** before it is reported as verified.

### Model output and prompt injection
- Every reasoning step uses JSON-schema structured output and is validated with zod `safeParse` plus semantic checks. For example:
  - only actionable issues can be selected;
  - a notification may reference only Jira keys that were created and issues that were selected.
- Invalid output fails the stage safely; it is never partially used.
- GitHub issue content is JSON-encoded, `<`/`>`-escaped and wrapped in an explicit untrusted-data block. The system prompts instruct the model to treat it as data, not instructions. Prompt-injection cases are covered in `tests/agent/prompt-injection.test.ts`.
- Jira descriptions are built from the model's validated draft (no links or instructions copied from the issue) as Atlassian Document Format.

### Output and logging
- The browser receives only the sanitized `AgentApiResponse` ([`lib/api/contract.ts`](lib/api/contract.ts)): public-safe summaries, counts, statuses and an event timeline. It never contains prompts, raw provider payloads, credentials or private model reasoning.
- Issue titles are rendered as plain text (React escaping; no `dangerouslySetInnerHTML`).
- The structured logger ([`lib/logger.ts`](lib/logger.ts)) redacts token-shaped values and does not log prompts, raw model output or provider payloads.

## Known limitations

- **`/api/agent` has no authentication or rate limiting.** Anyone who can reach the endpoint can trigger a run, which spends model credit and can create Jira tasks and Slack messages in the configured destinations.
  - For this reason, the public Vercel deployment has no model or Swytchcode credentials, and agent runs are performed locally.
  - Before enabling credentials on any shared URL, add access control (for example Vercel Deployment Protection or an authenticated session) and rate limiting.
- **No idempotency key for writes.** Swytchcode's exec interface doesn't expose one, so ForgeMind avoids duplicates by never auto-retrying writes rather than by deduplication.
- **Use test destinations.** Point `FORGEMIND_JIRA_PROJECT` and `FORGEMIND_SLACK_CHANNEL` at a test project and channel.

## Secret hygiene checklist for contributors

- [ ] No real values in `.env.example`, docs, tests or fixtures. Tests build token-shaped strings at runtime instead of committing literals.
- [ ] No `NEXT_PUBLIC_` prefix on any secret.
- [ ] `git status` shows no `.env.local`, `.vercel/`, credentials, recordings or browser profiles before committing.
