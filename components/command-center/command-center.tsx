"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AGENT_STREAM_CONTENT_TYPE, type AgentApiRequest } from "@/lib/api/contract";
import {
  DEFAULT_PROMPT,
  EMPTY_PROGRESS,
  STATE_TEXT,
  applyStreamMessage,
  buildWorkflow,
  describeApiError,
  latestActivity,
  parseAgentResponse,
  parseStreamLine,
  runStatusChip,
  toViewModel,
  validatePrompt,
  type ApiErrorView,
  type CommandCenterViewModel,
  type LiveProgress,
  type WorkflowNodeView,
} from "@/lib/presentation";
import { Button } from "@/components/ui/button";
import { PlusIcon, RetryIcon } from "@/components/ui/icons";
import { AdvancedDetails } from "./advanced-details";
import { AppHeader } from "./app-header";
import { CommandPanel } from "./command-panel";
import { IssuesTable } from "./issues-table";
import { RequestErrorState, RunningState } from "./run-states";
import { RunOverview } from "./run-overview";
import { WorkflowStrip } from "./workflow-strip";

/** Structurally a `RunSnapshot` (lib/presentation) plus the prompt that produced it. */
type RunState =
  | { phase: "idle" }
  | { phase: "running"; prompt: string; retry: boolean; progress: LiveProgress }
  | { phase: "done"; prompt: string; view: CommandCenterViewModel }
  | { phase: "error"; prompt: string; error: ApiErrorView };

function announcementFor(run: RunState, workflow: WorkflowNodeView[]): string {
  switch (run.phase) {
    case "idle":
      return STATE_TEXT.idle;
    case "running": {
      const active = workflow.find((node) => node.active && node.key !== "request");
      return active ? `${STATE_TEXT.running} ${active.label}: running.` : STATE_TEXT.running;
    }
    case "done":
      return run.view.stateText;
    case "error":
      return `${run.error.title}. ${run.error.message}`;
  }
}

type Outcome = { kind: "done"; view: CommandCenterViewModel } | { kind: "error"; error: ApiErrorView };

/**
 * Reads the NDJSON progress stream line by line, reporting each real
 * message, until the final `result` or `error`. A stream that ends without
 * either is reported as "Result unavailable" (the run may have happened).
 */
async function readProgressStream(
  response: Response,
  onProgress: (update: (progress: LiveProgress) => LiveProgress) => void,
): Promise<Outcome> {
  const runIdHeader = response.headers.get("x-forgemind-run-id");
  const reader = response.body?.getReader();
  if (!reader) return { kind: "error", error: describeApiError(response.status, null, runIdHeader) };

  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = parseStreamLine(line);
      if (!message) continue;
      if (message.type === "result") return { kind: "done", view: toViewModel(message.result) };
      if (message.type === "error") {
        return {
          kind: "error",
          error: describeApiError(500, { error: message.error, runId: message.runId }, runIdHeader),
        };
      }
      onProgress((progress) => applyStreamMessage(progress, message));
    }
    if (done) break;
  }
  return { kind: "error", error: describeApiError(response.status, null, runIdHeader) };
}

/**
 * The interactive Command Center. Owns the prompt, the single in-flight
 * request and the current run's presentation. Talks only to POST /api/agent
 * (plus GET /api/health for the header); it asks for the opt-in progress
 * stream so the workflow advances as the agent actually reports each step.
 */
export function CommandCenter({ brand }: { brand: ReactNode }) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [edited, setEdited] = useState(false);
  const [run, setRun] = useState<RunState>({ phase: "idle" });

  /** Synchronous double-submit guard (state updates are async). */
  const inFlight = useRef(false);
  /** Aborted on unmount so a late response never updates a dead component. */
  const lifecycle = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => controller.abort();
  }, []);

  const validation = validatePrompt(prompt);
  const running = run.phase === "running";

  async function execute(text: string, retry: boolean) {
    if (inFlight.current) return;
    const checked = validatePrompt(text);
    if (!checked.ok) {
      setEdited(true);
      return;
    }
    const signal = lifecycle.current?.signal;
    if (!signal || signal.aborted) return;

    inFlight.current = true;
    const message = checked.message;
    setRun({ phase: "running", prompt: message, retry, progress: EMPTY_PROGRESS });

    const finish = (outcome: Outcome) =>
      setRun(
        outcome.kind === "done"
          ? { phase: "done", prompt: message, view: outcome.view }
          : { phase: "error", prompt: message, error: outcome.error },
      );

    try {
      const body: AgentApiRequest = { message };
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: `${AGENT_STREAM_CONTENT_TYPE}, application/json` },
        body: JSON.stringify(body),
        cache: "no-store",
        signal,
      });

      if (response.ok && (response.headers.get("content-type") ?? "").includes(AGENT_STREAM_CONTENT_TYPE)) {
        const outcome = await readProgressStream(response, (update) => {
          if (signal.aborted) return;
          setRun((current) => (current.phase === "running" ? { ...current, progress: update(current.progress) } : current));
        });
        if (!signal.aborted) finish(outcome);
        return;
      }

      // Plain JSON: an error response, or a server without the stream.
      const payload: unknown = await response.json().catch(() => null);
      if (signal.aborted) return;
      const result = response.ok ? parseAgentResponse(payload) : null;
      finish(
        result
          ? { kind: "done", view: toViewModel(result) }
          : { kind: "error", error: describeApiError(response.status, payload, response.headers.get("x-forgemind-run-id")) },
      );
    } catch {
      if (signal.aborted) return;
      finish({ kind: "error", error: describeApiError(0, null) });
    } finally {
      inFlight.current = false;
    }
  }

  function handleSubmit() {
    void execute(prompt, false);
  }

  function handleRetry() {
    if (run.phase !== "done" && run.phase !== "error") return;
    const previous = run.prompt;
    setPrompt(previous);
    textareaRef.current?.focus();
    void execute(previous, true);
  }

  function handleNewTask() {
    if (inFlight.current) return;
    setRun({ phase: "idle" });
    textareaRef.current?.focus();
  }

  function handleChange(value: string) {
    setPrompt(value);
    setEdited(true);
  }

  function handlePickExample(example: string) {
    setPrompt(example);
    textareaRef.current?.focus();
  }

  function handleWriteOwn() {
    setPrompt("");
    setEdited(false);
    textareaRef.current?.focus();
  }

  const workflow = buildWorkflow(run);
  const canRetry =
    (run.phase === "done" && run.view.showRetry) || (run.phase === "error" && run.error.showRetry);

  const runActions =
    run.phase === "done" || run.phase === "error" ? (
      <>
        <Button variant="secondary" size="sm" onClick={handleNewTask} icon={<PlusIcon className="size-4" />}>
          New task
        </Button>
        {canRetry && (
          <Button variant="secondary" size="sm" onClick={handleRetry} icon={<RetryIcon className="size-4" />}>
            Retry
          </Button>
        )}
      </>
    ) : null;

  const resultNode = workflow.at(-1);
  const workflowAside =
    run.phase === "running" ? (
      <p className="inline-flex items-center gap-2 text-caption font-medium text-primary">
        <span aria-hidden="true" className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
        Live: each step updates as the agent reports it
      </p>
    ) : run.phase === "done" && resultNode?.durationLabel ? (
      <p className="text-caption text-foreground-muted">
        Finished in <span className="font-mono text-mono text-foreground-secondary">{resultNode.durationLabel}</span>
      </p>
    ) : run.phase === "idle" ? (
      <p className="text-caption text-foreground-muted">Waiting for a request</p>
    ) : null;

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader brand={brand} runStatus={runStatusChip(run)} />

      <main className="mx-auto w-full max-w-screen-2xl flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <CommandPanel
          value={prompt}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onPickExample={handlePickExample}
          onWriteOwn={handleWriteOwn}
          validation={validation}
          showValidation={edited}
          running={running}
          textareaRef={textareaRef}
        />

        <WorkflowStrip nodes={workflow} busy={running} aside={workflowAside} />

        {run.phase === "running" && <RunningState retry={run.retry} activity={latestActivity(run.progress)} />}
        {run.phase === "error" && <RequestErrorState error={run.error} actions={runActions} />}

        {run.phase === "done" && (
          <>
            <RunOverview view={run.view} actions={runActions} />
            <div className="motion-safe:animate-reveal">
              <IssuesTable view={run.view} />
            </div>
            <AdvancedDetails view={run.view} />
          </>
        )}

        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {announcementFor(run, workflow)}
        </p>
      </main>
    </div>
  );
}
