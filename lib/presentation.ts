/**
 * Command Center presentation boundary.
 *
 *   POST /api/agent response → toViewModel() → CommandCenterViewModel → React
 *
 * Pure and framework-free. The only import is the type-only API contract, so
 * this module is safe in Client Components. It formats what the agent already
 * decided — per-stage outcomes, counters, selections — and never re-derives
 * agent decisions. All text it emits is either a fixed UI string or a
 * public-safe field from the contract.
 */
import {
  MAX_MESSAGE_LENGTH,
  type AgentApiErrorCode,
  type AgentApiResponse,
  type ApiEvent,
  type ApiIssue,
  type ApiJiraTask,
  type EventStage,
  type EventStatus,
  type RunStatus,
  type StageStatus,
} from "@/lib/api/contract";

/* ------------------------------------------------------------------ */
/* Fixed UI copy                                                      */
/* ------------------------------------------------------------------ */

export type ExecutionStatus = "idle" | "running" | RunStatus;

/** Exact state texts shared by the visible UI and the aria-live region. */
export const STATE_TEXT = {
  idle: "Ready for an engineering request.",
  running: "Agent executing...",
  success: "Workflow completed.",
  partial: "Workflow completed with some external actions failed.",
  failed: "ForgeMind could not complete the workflow.",
  empty: "No actionable issues found.",
} as const;

export const DEFAULT_PROMPT =
  "Check the latest open GitHub issues, identify critical/high-priority bugs, create Jira tasks for the actionable ones, and notify the engineering team on Slack.";

export const MIN_PROMPT_LENGTH = 8;

const DUPLICATE_RISK_NOTE =
  "Jira tasks or Slack messages from this run already exist or may exist. Running it again could create duplicates — check Jira and Slack first, then start a new run with Execute.";

const NO_SIDE_EFFECTS_NOTE = "No Jira tasks were created and no Slack notification was sent.";

/* ------------------------------------------------------------------ */
/* View model types                                                   */
/* ------------------------------------------------------------------ */

/** Visual tone. Components always pair it with an icon and visible text. */
export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "pending";

export type PipelineStageKey = "reasoning" | "github" | "analysis" | "jira" | "verification" | "slack";

export type PipelineStageView = {
  key: PipelineStageKey;
  label: string;
  status: StageStatus | "pending";
  statusLabel: string;
  tone: Tone;
  /** Public-safe summary taken from this stage's own events (e.g. why it was skipped). */
  detail?: string;
};

export type TimelineEventView = {
  id: string;
  stage: EventStage;
  stageLabel: string;
  statusLabel: string;
  tone: Tone;
  summary: string;
  /** Swytchcode canonical tool ID, when the event concerns a tool. */
  tool?: string;
  /** Raw ISO timestamp for `<time dateTime>`. */
  timestamp: string;
  /** Offset from run start, e.g. "+5.0s". Undefined when a timestamp is unreadable. */
  offsetLabel?: string;
};

export type IssueView = {
  number: number;
  /** Untrusted third-party text: whitespace-normalized, rendered as plain text only. */
  title: string;
  /** Only http(s) URLs survive; anything else is dropped. */
  url?: string;
  severityLabel: string;
  severityTone: Tone;
  impact: string;
  actionable: boolean;
  selected: boolean;
  decisionLabel: string;
  decisionTone: Tone;
  reason: string;
};

export type JiraTaskView = {
  id: string;
  sourceIssue: number;
  status: ApiJiraTask["status"];
  statusLabel: string;
  tone: Tone;
  /** The actual Jira key — only present for created tasks that returned one. */
  key?: string;
  /** Row headline: the task summary, or what went wrong for failed/unconfirmed rows. */
  title: string;
  priority: string;
  verificationLabel?: string;
  verificationTone?: Tone;
  /** Safe server message for failed/unconfirmed rows. */
  message?: string;
};

export type SlackView = {
  status: "sent" | "failed" | "skipped";
  statusLabel: string;
  tone: Tone;
  headline: string;
  channel?: string;
  reason?: string;
  message?: string;
  /** Present when Slack failed after Jira tasks were created. */
  jiraNote?: string;
};

export type CommandCenterViewModel = {
  runId: string;
  status: RunStatus;
  /** Short badge text: Complete / Partial / Failed. */
  statusLabel: string;
  tone: Tone;
  /** Result card heading, e.g. "ForgeMind partially complete". */
  headline: string;
  /** One of the exact STATE_TEXT values. */
  stateText: string;
  /** Run succeeded, GitHub was actually queried, and nothing was actionable. */
  isEmpty: boolean;
  /** Server-written final summary (plain text). */
  summary: string;

  intent?: string;
  plan: string[];
  decision?: { actionLabel: string; reason: string };
  repository?: string;

  metrics: {
    issuesReviewed: number;
    actionableIssues: number;
    jiraTasksCreated: number;
    jiraTasksFailed: number;
    jiraTasksUnconfirmed: number;
    slackLabel: string;
    slackTone: Tone;
  };

  /** Reasoning → GitHub → Analysis → Jira → Verification → Slack. */
  stages: PipelineStageView[];
  /** The real, ordered execution log. */
  timeline: TimelineEventView[];

  issues: IssueView[];
  issuesEmptyText?: string;
  jiraTasks: JiraTaskView[];
  jiraEmptyText?: string;
  slack: SlackView;

  errors: { id: string; stageLabel: string; message: string }[];

  /** True only when no external mutation succeeded or might have succeeded. */
  canSafelyRetry: boolean;
  /** Show a Retry control: the run did not succeed and retrying cannot duplicate side effects. */
  showRetry: boolean;
  /** Duplicate-risk warning shown instead of Retry. */
  retryNote?: string;
  /** Factual "nothing external happened" note for unsuccessful runs. */
  sideEffectsNote?: string;

  durationLabel?: string;
  startedAt: string;
  finishedAt: string;
};

/* ------------------------------------------------------------------ */
/* Label tables                                                       */
/* ------------------------------------------------------------------ */

const STAGE_LABELS: Record<EventStage, string> = {
  request: "Request",
  reasoning: "Reasoning",
  github: "GitHub",
  analysis: "Analysis",
  jira: "Jira",
  verification: "Verification",
  slack: "Slack",
  final: "Final",
};

const PIPELINE: { key: PipelineStageKey; label: string }[] = [
  { key: "reasoning", label: "Reasoning" },
  { key: "github", label: "GitHub" },
  { key: "analysis", label: "Analysis" },
  { key: "jira", label: "Jira" },
  { key: "verification", label: "Verification" },
  { key: "slack", label: "Slack" },
];

const STAGE_STATUS: Record<StageStatus | "pending", { label: string; tone: Tone }> = {
  success: { label: "Completed", tone: "success" },
  partial: { label: "Partial", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Skipped", tone: "neutral" },
  not_run: { label: "Not run", tone: "neutral" },
  pending: { label: "Pending", tone: "pending" },
};

const EVENT_STATUS: Record<EventStatus, { label: string; tone: Tone }> = {
  running: { label: "Started", tone: "info" },
  success: { label: "Done", tone: "success" },
  skipped: { label: "Skipped", tone: "neutral" },
  warning: { label: "Warning", tone: "warning" },
  error: { label: "Error", tone: "danger" },
};

const RUN_STATUS: Record<RunStatus, { label: string; tone: Tone; headline: string }> = {
  success: { label: "Complete", tone: "success", headline: "ForgeMind complete" },
  partial: { label: "Partial", tone: "warning", headline: "ForgeMind partially complete" },
  failed: { label: "Failed", tone: "danger", headline: "ForgeMind failed" },
};

const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  critical: { label: "Critical", tone: "danger" },
  high: { label: "High", tone: "warning" },
  medium: { label: "Medium", tone: "info" },
  low: { label: "Low", tone: "neutral" },
};

const VERIFICATION: Record<ApiJiraTask["verification"], { label: string; tone: Tone }> = {
  verified: { label: "Verified", tone: "success" },
  unverified: { label: "Not verified", tone: "warning" },
  not_checked: { label: "Not checked", tone: "neutral" },
};

const SLACK: Record<SlackView["status"], { label: string; tone: Tone; headline: string }> = {
  sent: { label: "Sent", tone: "success", headline: "Engineering team notified" },
  failed: { label: "Failed", tone: "danger", headline: "Notification failed" },
  skipped: { label: "Skipped", tone: "neutral", headline: "Notification skipped" },
};

/* ------------------------------------------------------------------ */
/* Small pure helpers                                                 */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasKey<T extends object>(table: T, key: unknown): key is keyof T {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(table, key);
}

/** Collapses whitespace so untrusted text cannot break layout; returns "" for non-strings. */
function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function optionalText(value: unknown): string | undefined {
  const text = cleanText(value);
  return text.length > 0 ? text : undefined;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function safeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function stageStatus(value: unknown): StageStatus {
  return hasKey(STAGE_STATUS, value) && value !== "pending" ? value : "not_run";
}

/** "5.4s", "41s", "1m 05s". */
export function formatSeconds(totalMs: number): string {
  const ms = Math.max(0, totalMs);
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function offsetLabel(startedAt: string, timestamp: string): string | undefined {
  const start = Date.parse(startedAt);
  const at = Date.parse(timestamp);
  if (!Number.isFinite(start) || !Number.isFinite(at)) return undefined;
  return `+${formatSeconds(at - start)}`;
}

/* ------------------------------------------------------------------ */
/* Response parsing                                                   */
/* ------------------------------------------------------------------ */

/**
 * Structural check of a 200 body before mapping. Returns null when the body
 * is not a usable AgentApiResponse; the mapper itself tolerates odd items.
 */
export function parseAgentResponse(body: unknown): AgentApiResponse | null {
  if (!isRecord(body)) return null;
  const ok =
    typeof body.runId === "string" &&
    hasKey(RUN_STATUS, body.status) &&
    typeof body.summary === "string" &&
    typeof body.slackNotified === "boolean" &&
    ["issuesReviewed", "actionableIssues", "jiraTasksCreated", "jiraTasksFailed"].every(
      (key) => typeof body[key] === "number",
    ) &&
    ["plan", "issues", "jiraTasks", "events", "errors"].every((key) => Array.isArray(body[key])) &&
    isRecord(body.stages) &&
    isRecord(body.slack);
  return ok ? (body as AgentApiResponse) : null;
}

/* ------------------------------------------------------------------ */
/* Retry safety                                                       */
/* ------------------------------------------------------------------ */

/**
 * Re-running is only safe when no external mutation succeeded or might have
 * succeeded: no Jira task created or left unconfirmed, and no Slack message
 * sent. Counters and item lists are both checked, conservatively.
 */
export function canSafelyRetry(response: AgentApiResponse): boolean {
  const tasks = Array.isArray(response.jiraTasks) ? response.jiraTasks : [];
  return (
    response.jiraTasksCreated === 0 &&
    !tasks.some((task) => task?.status === "created" || task?.status === "unconfirmed") &&
    response.slackNotified === false &&
    response.slack?.status !== "sent"
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                           */
/* ------------------------------------------------------------------ */

/** Pipeline shown while a request is in flight: every stage honestly pending. */
export function pendingPipeline(): PipelineStageView[] {
  return PIPELINE.map(({ key, label }) => ({
    key,
    label,
    status: "pending",
    statusLabel: STAGE_STATUS.pending.label,
    tone: STAGE_STATUS.pending.tone,
  }));
}

const PREFERRED_EVENT: Partial<Record<StageStatus, EventStatus[]>> = {
  success: ["success"],
  partial: ["warning", "error"],
  failed: ["error", "warning"],
  skipped: ["skipped"],
};

/** Picks the stage's own event summary that best explains its outcome. */
function stageDetail(events: ApiEvent[], stage: EventStage, status: StageStatus): string | undefined {
  if (status === "not_run") return undefined;
  const own = events.filter((event) => event.stage === stage);
  const wanted = PREFERRED_EVENT[status] ?? [];
  const match =
    own.findLast((event) => wanted.includes(event.status)) ??
    own.findLast((event) => event.status !== "running") ??
    own.at(-1);
  return match ? optionalText(match.summary) : undefined;
}

/**
 * The contract has no `stages.reasoning`; its outcome is read from the
 * reasoning events and errors the agent emitted.
 */
function reasoningStatus(response: AgentApiResponse, events: ApiEvent[]): StageStatus {
  const own = events.filter((event) => event.stage === "reasoning");
  if (response.errors.some((error) => isRecord(error) && error.stage === "reasoning")) return "failed";
  if (response.decision) return "success";
  if (own.some((event) => event.status === "error")) return "failed";
  if (own.some((event) => event.status === "success")) return "success";
  if (own.length > 0 && own.every((event) => event.status === "skipped")) return "skipped";
  return "not_run";
}

function buildStages(response: AgentApiResponse, events: ApiEvent[]): PipelineStageView[] {
  const stages: Record<string, unknown> = isRecord(response.stages) ? response.stages : {};
  return PIPELINE.map(({ key, label }) => {
    const status = key === "reasoning" ? reasoningStatus(response, events) : stageStatus(stages[key]);
    const detail =
      stageDetail(events, key, status) ??
      (key === "reasoning" && response.decision ? optionalText(response.decision.reason) : undefined);
    return {
      key,
      label,
      status,
      statusLabel: STAGE_STATUS[status].label,
      tone: STAGE_STATUS[status].tone,
      ...(detail ? { detail } : {}),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Items                                                              */
/* ------------------------------------------------------------------ */

function validEvents(response: AgentApiResponse): ApiEvent[] {
  return response.events.filter(
    (event): event is ApiEvent =>
      isRecord(event) &&
      hasKey(STAGE_LABELS, event.stage) &&
      hasKey(EVENT_STATUS, event.status) &&
      typeof event.summary === "string",
  );
}

function toTimeline(events: ApiEvent[], startedAt: string): TimelineEventView[] {
  return events.map((event, index) => {
    const status = EVENT_STATUS[event.status];
    const tool = optionalText(event.tool);
    const offset = typeof event.timestamp === "string" ? offsetLabel(startedAt, event.timestamp) : undefined;
    return {
      id: `${index}-${event.stage}-${event.status}`,
      stage: event.stage,
      stageLabel: STAGE_LABELS[event.stage],
      statusLabel: status.label,
      tone: status.tone,
      summary: cleanText(event.summary),
      timestamp: typeof event.timestamp === "string" ? event.timestamp : "",
      ...(tool ? { tool } : {}),
      ...(offset ? { offsetLabel: offset } : {}),
    };
  });
}

function toIssue(issue: ApiIssue): IssueView {
  const severity = hasKey(SEVERITY, issue.severity)
    ? SEVERITY[issue.severity]
    : { label: "Unrated", tone: "neutral" as Tone };
  const actionable = issue.actionable === true;
  const selected = issue.selected === true;
  const decision: { label: string; tone: Tone } = selected
    ? { label: "Selected", tone: "success" }
    : actionable
      ? { label: "Actionable", tone: "info" }
      : { label: "Not actionable", tone: "neutral" };
  const url = safeExternalUrl(issue.url);
  return {
    number: issue.number,
    title: cleanText(issue.title) || `Issue #${issue.number}`,
    ...(url ? { url } : {}),
    severityLabel: severity.label,
    severityTone: severity.tone,
    impact: cleanText(issue.impact),
    actionable,
    selected,
    decisionLabel: decision.label,
    decisionTone: decision.tone,
    reason: cleanText(issue.reason),
  };
}

function toJiraTask(task: ApiJiraTask, index: number): JiraTaskView {
  const message = optionalText(task.message);
  const priority = cleanText(task.priority);
  if (task.status === "created") {
    const key = optionalText(task.key);
    const verification = hasKey(VERIFICATION, task.verification) ? VERIFICATION[task.verification] : undefined;
    return {
      id: `${index}-${task.sourceIssue}`,
      sourceIssue: task.sourceIssue,
      status: "created",
      statusLabel: "Created",
      tone: "success",
      ...(key ? { key } : {}),
      title: cleanText(task.summary) || `Task for #${task.sourceIssue}`,
      priority,
      ...(verification ? { verificationLabel: verification.label, verificationTone: verification.tone } : {}),
      ...(message ? { message } : {}),
    };
  }
  if (task.status === "unconfirmed") {
    return {
      id: `${index}-${task.sourceIssue}`,
      sourceIssue: task.sourceIssue,
      status: "unconfirmed",
      statusLabel: "Unconfirmed",
      tone: "warning",
      title: `Task not confirmed for #${task.sourceIssue}`,
      priority,
      message: message ?? "Jira did not return a task key. Check Jira manually before running again.",
    };
  }
  return {
    id: `${index}-${task.sourceIssue}`,
    sourceIssue: task.sourceIssue,
    status: "failed",
    statusLabel: "Failed",
    tone: "danger",
    title: `Task creation failed for #${task.sourceIssue}`,
    priority,
    ...(message ? { message } : {}),
  };
}

function toSlack(response: AgentApiResponse): SlackView {
  const raw: Record<string, unknown> = isRecord(response.slack) ? response.slack : {};
  const status: SlackView["status"] = hasKey(SLACK, raw.status) ? raw.status : "skipped";
  const channel = status === "sent" ? optionalText(raw.channel) : undefined;
  const reason = optionalText(raw.reason);
  const message = optionalText(raw.message);
  return {
    status,
    statusLabel: SLACK[status].label,
    tone: SLACK[status].tone,
    headline: SLACK[status].headline,
    ...(channel ? { channel } : {}),
    ...(reason ? { reason } : {}),
    ...(message ? { message } : {}),
    ...(status === "failed" && count(response.jiraTasksCreated) > 0
      ? { jiraNote: "Jira tasks created in this run remain created." }
      : {}),
  };
}

function issuesEmptyText(github: PipelineStageView): string {
  if (github.status === "failed") return "GitHub issues could not be retrieved.";
  if (github.status === "skipped") return github.detail ?? "GitHub was skipped for this request.";
  if (github.status === "not_run") return "GitHub was not queried for this request.";
  return "No open issues were returned.";
}

function jiraEmptyText(jira: PipelineStageView): string {
  if (jira.status === "skipped") return jira.detail ?? "Jira was skipped.";
  if (jira.status === "not_run") return "Jira was not used in this run.";
  return "No Jira tasks were created.";
}

/* ------------------------------------------------------------------ */
/* Main mapper                                                        */
/* ------------------------------------------------------------------ */

export function toViewModel(response: AgentApiResponse): CommandCenterViewModel {
  const status: RunStatus = hasKey(RUN_STATUS, response.status) ? response.status : "failed";
  const run = RUN_STATUS[status];
  const events = validEvents(response);
  const stages = buildStages(response, events);
  const stageOf = (key: PipelineStageKey) => stages.find((stage) => stage.key === key) as PipelineStageView;
  const github = stageOf("github");

  const issues = response.issues
    .filter((issue): issue is ApiIssue => isRecord(issue) && typeof issue.number === "number")
    .map(toIssue);
  const jiraTasks = response.jiraTasks
    .filter((task): task is ApiJiraTask => isRecord(task) && typeof task.sourceIssue === "number")
    .map(toJiraTask);
  const slack = toSlack(response);

  const actionableIssues = count(response.actionableIssues);
  const isEmpty =
    status === "success" && actionableIssues === 0 && (github.status === "success" || github.status === "partial");
  const stateText = status === "success" ? (isEmpty ? STATE_TEXT.empty : STATE_TEXT.success) : STATE_TEXT[status];

  const safeRetry = canSafelyRetry(response);
  const unsuccessful = status !== "success";

  const decision =
    isRecord(response.decision) && (response.decision.action === "continue" || response.decision.action === "finish")
      ? {
          actionLabel: response.decision.action === "continue" ? "Continue" : "Finish",
          reason: cleanText(response.decision.reason),
        }
      : undefined;

  const intent = optionalText(response.intent);
  const repository = optionalText(response.repository);
  const durationLabel =
    typeof response.durationMs === "number" && Number.isFinite(response.durationMs)
      ? formatSeconds(response.durationMs)
      : undefined;

  return {
    runId: cleanText(response.runId),
    status,
    statusLabel: run.label,
    tone: run.tone,
    headline: run.headline,
    stateText,
    isEmpty,
    summary: cleanText(response.summary),

    ...(intent ? { intent } : {}),
    plan: response.plan.map(cleanText).filter((step) => step.length > 0),
    ...(decision ? { decision } : {}),
    ...(repository ? { repository } : {}),

    metrics: {
      issuesReviewed: count(response.issuesReviewed),
      actionableIssues,
      jiraTasksCreated: count(response.jiraTasksCreated),
      jiraTasksFailed: count(response.jiraTasksFailed),
      jiraTasksUnconfirmed: jiraTasks.filter((task) => task.status === "unconfirmed").length,
      slackLabel: slack.statusLabel,
      slackTone: slack.tone,
    },

    stages,
    timeline: toTimeline(events, typeof response.startedAt === "string" ? response.startedAt : ""),

    issues,
    ...(issues.length === 0 ? { issuesEmptyText: issuesEmptyText(github) } : {}),
    jiraTasks,
    ...(jiraTasks.length === 0 ? { jiraEmptyText: jiraEmptyText(stageOf("jira")) } : {}),
    slack,

    errors: response.errors
      .filter((error) => isRecord(error) && typeof error.message === "string")
      .map((error, index) => ({
        id: `${index}-${error.stage}`,
        stageLabel: hasKey(STAGE_LABELS, error.stage) ? STAGE_LABELS[error.stage] : "Agent",
        message: cleanText(error.message),
      })),

    canSafelyRetry: safeRetry,
    showRetry: unsuccessful && safeRetry,
    ...(unsuccessful && !safeRetry ? { retryNote: DUPLICATE_RISK_NOTE } : {}),
    ...(unsuccessful && safeRetry ? { sideEffectsNote: NO_SIDE_EFFECTS_NOTE } : {}),

    ...(durationLabel ? { durationLabel } : {}),
    startedAt: typeof response.startedAt === "string" ? response.startedAt : "",
    finishedAt: typeof response.finishedAt === "string" ? response.finishedAt : "",
  };
}

/* ------------------------------------------------------------------ */
/* HTTP / network errors                                              */
/* ------------------------------------------------------------------ */

export type ApiErrorKind = "validation" | "configuration" | "internal" | "unreadable" | "network";

export type ApiErrorView = {
  kind: ApiErrorKind;
  title: string;
  /** User-facing message. Only validation messages come from the server's safe `error.message`. */
  message: string;
  runId?: string;
  /** True only when the server rejected the request before any workflow started. */
  canSafelyRetry: boolean;
  /** Show a Retry control (safe and useful — re-sending an invalid request is not). */
  showRetry: boolean;
  note?: string;
};

const VALIDATION_CODES: readonly AgentApiErrorCode[] = [
  "invalid_json",
  "invalid_request",
  "payload_too_large",
  "unsupported_media_type",
];

const MAX_SERVER_MESSAGE = 300;

function safeRunId(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : undefined;
}

/**
 * Maps a non-success HTTP response (or a network failure, `status` 0) to
 * user-facing copy. Server text is used only for validation errors, where the
 * contract guarantees a safe message; everything else uses fixed wording.
 */
export function describeApiError(status: number, body: unknown, runIdHeader?: string | null): ApiErrorView {
  const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
  const code = typeof error?.code === "string" ? error.code : undefined;
  const runId = safeRunId(isRecord(body) ? body.runId : undefined) ?? safeRunId(runIdHeader);
  const withRunId = runId ? { runId } : {};

  if (code && (VALIDATION_CODES as readonly string[]).includes(code)) {
    const serverMessage = cleanText(error?.message).slice(0, MAX_SERVER_MESSAGE);
    return {
      kind: "validation",
      title: "Request not accepted",
      message: serverMessage || "The request was not accepted.",
      ...withRunId,
      canSafelyRetry: true,
      showRetry: false,
      note: "No workflow was started. Edit the request and run it again.",
    };
  }

  if (code === "configuration_error") {
    return {
      kind: "configuration",
      title: "ForgeMind is not ready",
      message: "ForgeMind is not fully configured on the server.",
      ...withRunId,
      canSafelyRetry: true,
      showRetry: true,
      note: "No workflow was started, so no Jira tasks or Slack messages were created.",
    };
  }

  if (code === "internal_error") {
    return {
      kind: "internal",
      title: "Execution failed",
      message: "ForgeMind could not complete the workflow.",
      ...withRunId,
      canSafelyRetry: false,
      showRetry: false,
      note: "The workflow may have started before it failed. Running it again could create duplicate Jira tasks or Slack messages — check Jira and Slack first, then start a new run with Execute.",
    };
  }

  if (status >= 200 && status < 300) {
    return {
      kind: "unreadable",
      title: "Result unavailable",
      message: "ForgeMind responded, but the result could not be read.",
      ...withRunId,
      canSafelyRetry: false,
      showRetry: false,
      note: "The workflow may have run. Check Jira and Slack before starting a new run, to avoid duplicates.",
    };
  }

  return {
    kind: "network",
    title: "Connection problem",
    message: "ForgeMind could not be reached.",
    ...withRunId,
    canSafelyRetry: false,
    showRetry: false,
    note: "If the request reached ForgeMind, the workflow may still have run. Check Jira and Slack before starting a new run.",
  };
}

/* ------------------------------------------------------------------ */
/* Prompt validation (client-side convenience; the server is authoritative) */
/* ------------------------------------------------------------------ */

export type PromptValidation =
  | { ok: true; message: string }
  | { ok: false; reason: "empty" | "too_short" | "too_long"; error: string };

export function validatePrompt(text: string): PromptValidation {
  const message = typeof text === "string" ? text.trim() : "";
  if (message.length === 0) {
    return { ok: false, reason: "empty", error: "Enter an engineering request for ForgeMind." };
  }
  if (message.length < MIN_PROMPT_LENGTH) {
    return {
      ok: false,
      reason: "too_short",
      error: `Add more detail — a request needs at least ${MIN_PROMPT_LENGTH} characters.`,
    };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      reason: "too_long",
      error: `Shorten the request to ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")} characters or fewer (currently ${message.length.toLocaleString("en-US")}).`,
    };
  }
  return { ok: true, message };
}

/* ================================================================== */
/* Command Center v2 helpers (design spec §4–§6, §9)                  */
/* Pure additions: every export above keeps its behavior.             */
/* ================================================================== */

/** A Tone, or the single in-flight state the UI renders in the primary color. */
export type DisplayTone = Tone | "running";

/** Snapshot of the Command Center's request lifecycle, as the UI holds it. */
export type RunSnapshot =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; view: CommandCenterViewModel }
  | { phase: "error"; error: ApiErrorView };

/* ------------------------------------------------------------------ */
/* Metrics                                                            */
/* ------------------------------------------------------------------ */

/** Zero-padded metric number: 5 → "05", 0 → "00", 120 → "120". Invalid → "00". */
export function padMetric(value: number): string {
  return String(count(value)).padStart(2, "0");
}

export type MetricView = {
  key: "issues" | "actionable" | "jira" | "slack";
  label: string;
  /** Zero-padded number, or the Slack outcome word. */
  value: string;
  /** Set for word values (Slack) so the UI pairs them with a status icon. */
  valueTone?: Tone;
  /**
   * Short qualifiers under the value. `mono` marks technical identifiers;
   * `status` marks a stage outcome, which always carries its status icon
   * (non-neutral notes always do).
   */
  notes: { text: string; tone: Tone; mono?: boolean; status?: boolean }[];
};

/**
 * Jira outcome counts that never double-count. The server's `jiraTasksFailed`
 * is every task that was not created, so it already includes unconfirmed
 * tasks; "failed" here excludes them, and is never fewer than the failed rows
 * actually returned.
 */
export function jiraOutcomeCounts(view: Pick<CommandCenterViewModel, "metrics" | "jiraTasks">): {
  created: number;
  failed: number;
  unconfirmed: number;
} {
  const { jiraTasksCreated, jiraTasksFailed, jiraTasksUnconfirmed } = view.metrics;
  const failedRows = view.jiraTasks.filter((task) => task.status === "failed").length;
  return {
    created: jiraTasksCreated,
    failed: Math.max(failedRows, jiraTasksFailed - jiraTasksUnconfirmed),
    unconfirmed: jiraTasksUnconfirmed,
  };
}

/**
 * Qualifies a counter whose stage did not measure anything, so a "00" is never
 * read as "looked and found nothing". Undefined when the stage ran.
 */
function unmeasuredNote(stage: PipelineStageView | undefined, name: string): MetricView["notes"][number] | undefined {
  if (!stage) return undefined;
  if (stage.status === "failed") return { text: `${name} failed`, tone: "danger", status: true };
  if (stage.status === "not_run" || stage.status === "skipped") {
    return { text: stage.statusLabel, tone: "neutral", status: true };
  }
  return undefined;
}

/** The four Run overview metrics, straight from the run's own counters. */
export function overviewMetrics(view: CommandCenterViewModel): MetricView[] {
  const { metrics } = view;
  const jira = jiraOutcomeCounts(view);
  const jiraNotes: MetricView["notes"] = [{ text: "created", tone: "neutral" }];
  if (jira.failed > 0) jiraNotes.push({ text: `${jira.failed} failed`, tone: "danger" });
  if (jira.unconfirmed > 0) {
    jiraNotes.push({ text: `${jira.unconfirmed} unconfirmed`, tone: "warning" });
  }
  const stageOf = (key: PipelineStageKey) => view.stages.find((stage) => stage.key === key);
  const githubNote = unmeasuredNote(stageOf("github"), "GitHub");
  const analysisNote = unmeasuredNote(stageOf("analysis"), "Analysis");
  const issuesNotes: MetricView["notes"] = view.repository ? [{ text: view.repository, tone: "neutral", mono: true }] : [];
  if (githubNote) issuesNotes.push(githubNote);
  return [
    {
      key: "issues",
      label: "Issues scanned",
      value: padMetric(metrics.issuesReviewed),
      notes: issuesNotes,
    },
    {
      key: "actionable",
      label: "Actionable",
      value: padMetric(metrics.actionableIssues),
      notes: [analysisNote ?? { text: "need engineering action", tone: "neutral" }],
    },
    { key: "jira", label: "Jira tasks", value: padMetric(metrics.jiraTasksCreated), notes: jiraNotes },
    {
      key: "slack",
      label: "Slack",
      value: metrics.slackLabel.toUpperCase(),
      valueTone: metrics.slackTone,
      notes: view.slack.channel ? [{ text: view.slack.channel, tone: "neutral", mono: true }] : [],
    },
  ];
}

/* ------------------------------------------------------------------ */
/* GitHub issue → Jira action join, Jira project                      */
/* ------------------------------------------------------------------ */

/** Fixed copy for Jira/Slack when a successful run found nothing actionable. */
export const NOTHING_ACTIONABLE_TEXT = "Skipped — nothing actionable";

/** Lead line for unsuccessful runs where no external mutation happened. */
export const NO_DOWNSTREAM_ACTIONS_TEXT = "No downstream actions were performed.";

/** Stages that act on Jira / Slack. */
const DOWNSTREAM_STAGES: readonly PipelineStageKey[] = ["jira", "verification", "slack"];

/**
 * The "No downstream actions were performed." lead for the side-effects note:
 * only when there is such a note (unsuccessful run, nothing external happened),
 * no downstream action was even attempted (no Jira task rows; Jira,
 * Verification and Slack all skipped or not run), and the server summary does
 * not already say it. Attempted-but-failed actions are not "not performed".
 */
export function downstreamLead(
  view: Pick<CommandCenterViewModel, "sideEffectsNote" | "summary" | "stages" | "jiraTasks">,
): string | undefined {
  if (!view.sideEffectsNote) return undefined;
  if (view.jiraTasks.length > 0) return undefined;
  const attempted = view.stages.some(
    (stage) => DOWNSTREAM_STAGES.includes(stage.key) && stage.status !== "not_run" && stage.status !== "skipped",
  );
  if (attempted) return undefined;
  const phrase = NO_DOWNSTREAM_ACTIONS_TEXT.slice(0, -1).toLowerCase();
  return view.summary.toLowerCase().includes(phrase) ? undefined : NO_DOWNSTREAM_ACTIONS_TEXT;
}

/** "SCRUM-12" → "SCRUM". Only derived from a real returned key; anything else → undefined. */
export function jiraProjectFromKey(key: unknown): string | undefined {
  if (typeof key !== "string") return undefined;
  const match = /^([A-Z][A-Z0-9_]+)-[1-9][0-9]*$/.exec(key.trim());
  return match ? match[1] : undefined;
}

export type IssueActionView = {
  kind: "key" | "created" | "failed" | "unconfirmed" | "skipped" | "none";
  /** Visible text: the actual Jira key, or a status word. `none` is rendered as an em dash. */
  label: string;
  tone: Tone;
  /** The actual Jira key, only for created tasks that returned one. */
  key?: string;
};

const NO_ACTION: IssueActionView = { kind: "none", label: "No Jira task", tone: "neutral" };

/**
 * What happened in Jira for one GitHub issue, joined on `sourceIssue`. Only
 * reports returned data: a created task with its key beats an unconfirmed one,
 * which beats a failed one. A selected issue without any task row is "Skipped"
 * only when the Jira stage itself was skipped or never ran.
 */
export function issueJiraAction(
  issue: Pick<IssueView, "number" | "selected">,
  tasks: readonly JiraTaskView[],
  jiraStatus: PipelineStageView["status"] | undefined,
): IssueActionView {
  const own = tasks.filter((task) => task.sourceIssue === issue.number);
  const created = own.find((task) => task.status === "created");
  if (created) {
    return created.key
      ? { kind: "key", label: created.key, tone: "success", key: created.key }
      : { kind: "created", label: "Created", tone: "success" };
  }
  if (own.some((task) => task.status === "unconfirmed")) {
    return { kind: "unconfirmed", label: "Unconfirmed", tone: "warning" };
  }
  if (own.some((task) => task.status === "failed")) return { kind: "failed", label: "Failed", tone: "danger" };
  if (issue.selected && (jiraStatus === "skipped" || jiraStatus === "not_run")) {
    return { kind: "skipped", label: "Skipped", tone: "neutral" };
  }
  return NO_ACTION;
}

/** Every reviewed issue with its Jira action, in the order the agent returned them. */
export function joinIssueActions(
  view: Pick<CommandCenterViewModel, "issues" | "jiraTasks" | "stages">,
): { issue: IssueView; action: IssueActionView }[] {
  const jiraStatus = view.stages.find((stage) => stage.key === "jira")?.status;
  return view.issues.map((issue) => ({ issue, action: issueJiraAction(issue, view.jiraTasks, jiraStatus) }));
}

/* ------------------------------------------------------------------ */
/* Prompt character counter                                           */
/* ------------------------------------------------------------------ */

/** Share of MAX_MESSAGE_LENGTH at which the counter turns to a warning. */
export const PROMPT_NEAR_LIMIT_RATIO = 0.9;

/**
 * Character counter for the request field, counted like `validatePrompt`
 * (trimmed). Neutral, warning near the limit, danger over it. Non-neutral
 * counters carry a `note` naming the state, so it is never color alone.
 */
export function promptCounter(text: string): { length: number; label: string; tone: Tone; note?: string } {
  const length = typeof text === "string" ? text.trim().length : 0;
  const tone: Tone =
    length > MAX_MESSAGE_LENGTH
      ? "danger"
      : length >= Math.floor(MAX_MESSAGE_LENGTH * PROMPT_NEAR_LIMIT_RATIO)
        ? "warning"
        : "neutral";
  return {
    length,
    label: `${length.toLocaleString("en-US")} / ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")}`,
    tone,
    ...(tone === "danger" ? { note: "Over the limit" } : tone === "warning" ? { note: "Approaching the limit" } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Header chips                                                       */
/* ------------------------------------------------------------------ */

/**
 * Tone of an HTTP / network error: a request the server rejected before any
 * workflow started is a warning; anything else is danger.
 */
export function errorTone(error: Pick<ApiErrorView, "kind">): Tone {
  return error.kind === "validation" ? "warning" : "danger";
}

/** Run status chip: Ready / Executing / Complete / Partial / Failed / Error. */
export function runStatusChip(run: RunSnapshot): { label: string; tone: DisplayTone } {
  switch (run.phase) {
    case "idle":
      return { label: "Ready", tone: "neutral" };
    case "running":
      return { label: "Executing", tone: "running" };
    case "done":
      return { label: run.view.statusLabel, tone: run.view.tone };
    case "error":
      return { label: run.error.kind === "validation" ? "Not accepted" : "Error", tone: errorTone(run.error) };
  }
}

export type SystemHealth = "checking" | "online" | "unreachable";

export const SYSTEM_HEALTH: Record<SystemHealth, { label: string; tone: DisplayTone }> = {
  checking: { label: "Checking…", tone: "pending" },
  online: { label: "Online", tone: "success" },
  unreachable: { label: "Unreachable", tone: "danger" },
};

/** Reads a `GET /api/health` answer. Anything but `2xx {status:"ok"}` is unreachable. */
export function interpretHealth(ok: boolean, body: unknown): Exclude<SystemHealth, "checking"> {
  return ok && isRecord(body) && body.status === "ok" ? "online" : "unreachable";
}

/* ------------------------------------------------------------------ */
/* Agent workflow (8 nodes)                                           */
/* ------------------------------------------------------------------ */

export type WorkflowNodeKey = "request" | "reason" | "github" | "analyze" | "jira" | "verify" | "slack" | "result";

export type WorkflowNodeStatus =
  | "waiting"
  | "running"
  | "done"
  | "partial"
  | "failed"
  | "skipped"
  | "not_run"
  | "unknown";

export type WorkflowNodeView = {
  key: WorkflowNodeKey;
  label: string;
  description: string;
  status: WorkflowNodeStatus;
  statusLabel: string;
  tone: DisplayTone;
  /** The single node in flight: only the Request node, only while the request is pending. */
  active: boolean;
  /** Elapsed time from real timestamps — only for nodes that actually ran. */
  durationMs?: number;
  durationLabel?: string;
  /**
   * "run" when the duration is the whole run's time (the Result node), not
   * the node's own step time — the UI labels it as a total.
   */
  durationScope?: "run";
};

type WorkflowDef = { key: WorkflowNodeKey; label: string; description: string; stage: EventStage };

const WORKFLOW: readonly WorkflowDef[] = [
  { key: "request", label: "Request", description: "Engineering request", stage: "request" },
  { key: "reason", label: "Reason", description: "Understand & plan", stage: "reasoning" },
  { key: "github", label: "GitHub", description: "Inspect repository issues", stage: "github" },
  { key: "analyze", label: "Analyze", description: "Evaluate severity & impact", stage: "analysis" },
  { key: "jira", label: "Jira", description: "Create engineering work", stage: "jira" },
  { key: "verify", label: "Verify", description: "Confirm tasks exist", stage: "verification" },
  { key: "slack", label: "Slack", description: "Notify the team", stage: "slack" },
  { key: "result", label: "Result", description: "Final outcome", stage: "final" },
];

const NODE_STATUS: Record<WorkflowNodeStatus, { label: string; tone: DisplayTone }> = {
  waiting: { label: "Waiting", tone: "pending" },
  running: { label: "Running", tone: "running" },
  done: { label: "Done", tone: "success" },
  partial: { label: "Partial", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Skipped", tone: "neutral" },
  not_run: { label: "Not run", tone: "neutral" },
  unknown: { label: "Not reported", tone: "neutral" },
};

const NODE_FROM_STAGE: Record<StageStatus | "pending", WorkflowNodeStatus> = {
  success: "done",
  partial: "partial",
  failed: "failed",
  skipped: "skipped",
  not_run: "not_run",
  pending: "waiting",
};

const PIPELINE_BY_NODE: Partial<Record<WorkflowNodeKey, PipelineStageKey>> = {
  reason: "reasoning",
  github: "github",
  analyze: "analysis",
  jira: "jira",
  verify: "verification",
  slack: "slack",
};

/** Statuses that represent work that actually happened (and so may carry a duration). */
const RAN: readonly WorkflowNodeStatus[] = ["done", "partial", "failed"];

function elapsedMs(from: string, to: string): number | undefined {
  const start = Date.parse(from);
  const end = Date.parse(to);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : undefined;
}

/**
 * Real elapsed time of one stage: from the event just before its first event
 * (or the run start) to its last event. Derived only from event timestamps.
 */
function stageElapsedMs(
  timeline: readonly TimelineEventView[],
  stage: EventStage,
  startedAt: string,
): number | undefined {
  const first = timeline.findIndex((event) => event.stage === stage);
  if (first < 0) return undefined;
  const last = timeline.findLastIndex((event) => event.stage === stage);
  const from = first > 0 ? timeline[first - 1].timestamp : startedAt;
  return elapsedMs(from, timeline[last].timestamp);
}

function workflowNode(
  def: WorkflowDef,
  status: WorkflowNodeStatus,
  override: { statusLabel?: string; tone?: DisplayTone; durationMs?: number; durationScope?: "run" } = {},
): WorkflowNodeView {
  const base = NODE_STATUS[status];
  const durationMs = RAN.includes(status) ? override.durationMs : undefined;
  return {
    key: def.key,
    label: def.label,
    description: def.description,
    status,
    statusLabel: override.statusLabel ?? base.label,
    tone: override.tone ?? base.tone,
    active: status === "running",
    ...(durationMs !== undefined
      ? {
          durationMs,
          durationLabel: formatSeconds(durationMs),
          ...(override.durationScope ? { durationScope: override.durationScope } : {}),
        }
      : {}),
  };
}

/**
 * The eight Agent workflow nodes for the current lifecycle phase.
 *
 * - idle: every node Waiting.
 * - running: only Request is active; the API does not stream, so nothing else
 *   is claimed until the run returns.
 * - done: per-stage outcomes from the view model, durations from real event
 *   timestamps, Result mirrors the run status (its duration is the total run
 *   time, marked `durationScope: "run"`).
 * - error (HTTP / network): Request failed; downstream nodes are "Not run"
 *   only when the server confirmed no workflow started, otherwise "Not reported".
 *   An unreadable 2xx answer means the server did accept the request: Request
 *   is Done and Result is "Unreadable" (outcome unknown), never "Error".
 */
export function buildWorkflow(run: RunSnapshot): WorkflowNodeView[] {
  switch (run.phase) {
    case "idle":
      return WORKFLOW.map((def) => workflowNode(def, "waiting"));

    case "running":
      return WORKFLOW.map((def) => workflowNode(def, def.key === "request" ? "running" : "waiting"));

    case "error": {
      const { kind } = run.error;
      const tone = errorTone(run.error);
      const rejectedBeforeStart = kind === "validation" || kind === "configuration";
      const answered = kind === "unreadable";
      return WORKFLOW.map((def) => {
        if (def.key === "request") {
          if (answered) return workflowNode(def, "done");
          return workflowNode(def, "failed", { statusLabel: kind === "validation" ? "Not accepted" : "Error", tone });
        }
        if (def.key === "result") {
          if (kind === "validation") return workflowNode(def, "not_run");
          if (answered) return workflowNode(def, "unknown", { statusLabel: "Unreadable", tone: "warning" });
          return workflowNode(def, "failed", { statusLabel: "Error", tone });
        }
        return workflowNode(def, rejectedBeforeStart ? "not_run" : "unknown");
      });
    }

    case "done": {
      const { view } = run;
      const { timeline, startedAt } = view;
      return WORKFLOW.map((def) => {
        if (def.key === "request") {
          const failed = timeline.some((event) => event.stage === "request" && event.tone === "danger");
          return workflowNode(def, failed ? "failed" : "done", {
            durationMs: stageElapsedMs(timeline, "request", startedAt),
          });
        }
        if (def.key === "result") {
          const status: WorkflowNodeStatus =
            view.status === "success" ? "done" : view.status === "partial" ? "partial" : "failed";
          return workflowNode(def, status, {
            statusLabel: RUN_STATUS[view.status].label,
            durationMs: elapsedMs(startedAt, view.finishedAt),
            durationScope: "run",
          });
        }
        const pipelineKey = PIPELINE_BY_NODE[def.key];
        const stage = view.stages.find((candidate) => candidate.key === pipelineKey);
        const status = stage ? NODE_FROM_STAGE[stage.status] : "not_run";
        return workflowNode(def, status, { durationMs: stageElapsedMs(timeline, def.stage, startedAt) });
      });
    }
  }
}
