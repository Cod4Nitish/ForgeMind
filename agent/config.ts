import "server-only";
import { ConfigError } from "./errors";

/**
 * Default reasoning model. Override with ANTHROPIC_MODEL; the value is never
 * taken from user input or tool output.
 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

export type ModelConfig = {
  apiKey: string;
  model: string;
};

export type GitHubRepository = { owner: string; name: string };

/**
 * Destinations ForgeMind acts on. They come only from server configuration —
 * never from the user's prompt, the model, or issue content.
 */
export type IntegrationConfig = {
  github: GitHubRepository;
  /** Jira project key tasks are created in. Optional: without it Jira actions fail safely. */
  jira?: { projectKey: string };
  /** Slack channel (ID or #name) notifications go to. Optional: without it Slack fails safely. */
  slack?: { channel: string };
};

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/** Reads the model configuration. Error messages name variables, never values. */
export function loadModelConfig(env: Env = process.env): ModelConfig {
  const apiKey = read(env, "ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new ConfigError("ANTHROPIC_API_KEY is not configured on the server.");
  }
  return {
    apiKey,
    model: read(env, "ANTHROPIC_MODEL") ?? DEFAULT_ANTHROPIC_MODEL,
  };
}

// GitHub owner: 1-39 alphanumerics/hyphens; repo: 1-100 of [A-Za-z0-9._-].
const REPOSITORY_PATTERN = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/;

const JIRA_PROJECT_PATTERN = /^[A-Z][A-Z0-9_]{1,9}$/;
const SLACK_CHANNEL_PATTERN = /^(?:[CG][A-Z0-9]{8,12}|#[a-z0-9][a-z0-9._-]{0,79})$/;

export function parseRepository(value: string): GitHubRepository | undefined {
  const match = REPOSITORY_PATTERN.exec(value);
  if (!match || match[2] === "." || match[2] === "..") return undefined;
  return { owner: match[1], name: match[2] };
}

export function loadIntegrationConfig(env: Env = process.env): IntegrationConfig {
  const repository = read(env, "FORGEMIND_GITHUB_REPOSITORY");
  if (!repository) {
    throw new ConfigError("FORGEMIND_GITHUB_REPOSITORY is not configured on the server.");
  }
  const github = parseRepository(repository);
  if (!github) {
    throw new ConfigError("FORGEMIND_GITHUB_REPOSITORY must be in owner/repo form.");
  }

  const config: IntegrationConfig = { github };

  const projectKey = read(env, "FORGEMIND_JIRA_PROJECT");
  if (projectKey) {
    if (!JIRA_PROJECT_PATTERN.test(projectKey)) {
      throw new ConfigError("FORGEMIND_JIRA_PROJECT must be a Jira project key such as FORGE.");
    }
    config.jira = { projectKey };
  }

  const channel = read(env, "FORGEMIND_SLACK_CHANNEL");
  if (channel) {
    if (!SLACK_CHANNEL_PATTERN.test(channel)) {
      throw new ConfigError("FORGEMIND_SLACK_CHANNEL must be a channel ID (C0123…) or #channel-name.");
    }
    config.slack = { channel };
  }

  return config;
}

