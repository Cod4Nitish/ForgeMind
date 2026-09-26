import { useId, type FormEvent, type KeyboardEvent, type Ref } from "react";
import { DEFAULT_PROMPT, promptCounter, type PromptValidation } from "@/lib/presentation";
import { StatusIcon } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlayIcon } from "@/components/ui/icons";
import { panelSurface, toneIcon, toneText } from "@/components/ui/tone";

/*
 * No "use client" directive: this module is only imported by the interactive
 * CommandCenter, so it already lives in the client graph and receives plain
 * callbacks from it.
 */

type CommandPanelProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onUseDemo: () => void;
  validation: PromptValidation;
  /** Show validation feedback only once the user has edited the request. */
  showValidation: boolean;
  running: boolean;
  textareaRef: Ref<HTMLTextAreaElement>;
};

/**
 * Key names are not identifiers, so they use the sans caption token (spec §1).
 * `font-sans` is explicit because preflight gives `<kbd>` the mono stack.
 */
const kbd = "rounded-xs border border-border bg-surface-elevated px-1.5 font-sans text-caption font-medium text-foreground-secondary";

export function CommandPanel({
  value,
  onChange,
  onSubmit,
  onUseDemo,
  validation,
  showValidation,
  running,
  textareaRef,
}: CommandPanelProps) {
  const id = useId();
  const headingId = `${id}-heading`;
  const textareaId = `${id}-request`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const shortcutId = `${id}-shortcut`;
  const counterId = `${id}-counter`;
  const invalid = showValidation && !validation.ok;
  const counter = promptCounter(value);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    onSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!running) onSubmit();
    }
  }

  return (
    <section aria-labelledby={headingId} className={`${panelSurface} p-4 sm:p-5`}>
      <form onSubmit={handleSubmit} noValidate>
        {/* The h2 doubles as the textarea's visible label. */}
        <h2 id={headingId} className="text-h2 text-foreground">
          <label htmlFor={textareaId}>What should ForgeMind handle?</label>
        </h2>
        <p id={hintId} className="mt-1 text-body-sm text-foreground-secondary">
          Describe the work in plain language. ForgeMind plans it and runs only the GitHub, Jira and Slack actions it
          needs.
        </p>

        <textarea
          ref={textareaRef}
          id={textareaId}
          name="message"
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={running}
          aria-invalid={invalid || undefined}
          aria-describedby={[hintId, invalid ? errorId : null, counterId, shortcutId].filter(Boolean).join(" ")}
          placeholder="Describe an engineering task…"
          className="mt-3 block max-h-72 min-h-16 w-full resize-y rounded-md border border-border-strong bg-surface-elevated px-3 py-2 text-body text-foreground transition-colors field-sizing-content placeholder:text-foreground-muted hover:bg-surface-hover read-only:cursor-default read-only:text-foreground-secondary read-only:hover:bg-surface-elevated aria-invalid:border-danger"
        />

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {/* Always rendered, so the error is announced when it appears or changes. */}
            <div aria-live="polite" aria-atomic="true">
              {invalid && !validation.ok && (
                <p id={errorId} className="mb-1 flex items-start gap-2 text-body-sm text-danger-foreground">
                  <span className="flex h-5 shrink-0 items-center">
                    <StatusIcon tone="danger" className="size-4 text-danger" />
                  </span>
                  <span>{validation.error}</span>
                </p>
              )}
            </div>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-foreground-muted">
              <span id={shortcutId} className="inline-flex items-center gap-1">
                <kbd className={kbd}>Ctrl</kbd>
                <span aria-hidden="true">/</span>
                <span className="sr-only">or</span>
                <kbd className={kbd}>
                  <span aria-hidden="true">⌘</span>
                  <span className="sr-only">Command</span>
                </kbd>
                +<kbd className={kbd}>Enter</kbd>
                <span className="ml-1">to execute</span>
              </span>
              <span id={counterId} className={`tabular-nums ${counter.tone === "neutral" ? "" : `font-medium ${toneText[counter.tone]}`}`}>
                {counter.tone !== "neutral" && (
                  <StatusIcon
                    tone={counter.tone}
                    className={`mr-1 inline size-3.5 align-text-bottom ${toneIcon[counter.tone]}`}
                  />
                )}
                {counter.label}
                <span className="sr-only"> characters</span>
                {counter.note && <span className="sr-only"> — {counter.note}</span>}
              </span>
            </p>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2">
            {value !== DEFAULT_PROMPT && !running && (
              <Button variant="ghost" size="sm" onClick={onUseDemo}>
                Use demo request
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={running}
              disabled={!running && !validation.ok}
              icon={<PlayIcon className="size-3.5" />}
              className="min-w-32"
            >
              {running ? "Executing…" : "Execute"}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
