"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AgentApiRequest } from "@/lib/api/contract";
import {
  DEFAULT_PROMPT,
  STATE_TEXT,
  buildWorkflow,
  describeApiError,
  parseAgentResponse,
  runStatusChip,
  toViewModel,
  validatePrompt,
  type ApiErrorView,
  type CommandCenterViewModel,
} from "@/lib/presentation";
import { Button } from "@/components/ui/button";
import { PlusIcon, RetryIcon } from "@/components/ui/icons";
import { AppHeader } from "./app-header";
import { CommandPanel } from "./command-panel";
import { ExecutionLog } from "./execution-log";
import { IssuesTable } from "./issues-table";
import { JiraList } from "./jira-list";
import { IdleState, RequestErrorState, RunningState } from "./run-states";
import { RunOverview } from "./run-overview";
import { SlackCard } from "./slack-card";
import { WorkflowStrip } from "./workflow-strip";

/** Structurally a `RunSnapshot` (lib/presentation) plus the prompt that produced it. */
type RunState =
  | { phase: "idle" }
  | { phase: "running"; prompt: string; retry: boolean }
  | { phase: "done"; prompt: string; view: CommandCenterViewModel }
  | { phase: "error"; prompt: string; error: ApiErrorView };

function announcementFor(run: RunState): string {
  switch (run.phase) {
    case "idle":
      return STATE_TEXT.idle;
    case "running":
      return STATE_TEXT.running;
    case "done":
      return run.view.stateText;
    case "error":
      return `${run.error.title}. ${run.error.message}`;
  }
}

/**
 * The interactive Command Center. Owns the prompt, the single in-flight
 * request and the current run's presentation. Talks only to POST /api/agent
 * (plus GET /api/health for the System chip); all display values come from
 * the presentation layer.
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
    setRun({ phase: "running", prompt: checked.message, retry });

    try {
      const body: AgentApiRequest = { message: checked.message };
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (signal.aborted) return;

      const result = response.ok ? parseAgentResponse(payload) : null;
      setRun(
        result
          ? { phase: "done", prompt: checked.message, view: toViewModel(result) }
          : {
              phase: "error",
              prompt: checked.message,
              error: describeApiError(response.status, payload, response.headers.get("x-forgemind-run-id")),
            },
      );
    } catch {
      if (signal.aborted) return;
      setRun({ phase: "error", prompt: checked.message, error: describeApiError(0, null) });
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

  function handleUseDemo() {
    setPrompt(DEFAULT_PROMPT);
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

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader brand={brand} runStatus={runStatusChip(run)} />

      <main className="mx-auto w-full max-w-screen-2xl flex-1 space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <CommandPanel
          value={prompt}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onUseDemo={handleUseDemo}
          validation={validation}
          showValidation={edited}
          running={running}
          textareaRef={textareaRef}
        />

        <WorkflowStrip nodes={workflow} busy={running} />

        {run.phase === "idle" && <IdleState />}
        {run.phase === "running" && <RunningState retry={run.retry} />}
        {run.phase === "error" && <RequestErrorState error={run.error} actions={runActions} />}

        {run.phase === "done" && (
          <>
            <RunOverview view={run.view} actions={runActions} />
            <div className="grid items-start gap-4 lg:grid-cols-12">
              <ExecutionLog view={run.view} className="lg:col-span-5" />
              <div className="space-y-4 motion-safe:animate-reveal lg:col-span-7">
                <IssuesTable view={run.view} />
                <JiraList view={run.view} />
                <SlackCard view={run.view} />
              </div>
            </div>
          </>
        )}

        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {announcementFor(run)}
        </p>
      </main>
    </div>
  );
}
