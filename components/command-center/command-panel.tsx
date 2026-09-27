import { useId, type FormEvent, type KeyboardEvent, type Ref } from "react";
import { EXAMPLE_PROMPTS, promptCounter, type ExamplePrompt, type PromptValidation } from "@/lib/presentation";
import { StatusIcon } from "@/components/ui/badge";
import { INTEGRATION_NAME, IntegrationMark } from "@/components/ui/brand-icons";
import { Button } from "@/components/ui/button";
import { PencilIcon, PlayIcon } from "@/components/ui/icons";
import { toneIcon, toneText } from "@/components/ui/tone";

/*
 * No "use client" directive: this module is only imported by the interactive
 * CommandCenter, so it already lives in the client graph and receives plain
 * callbacks from it.
 */

type CommandPanelProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Fill the request with an example. */
  onPickExample: (prompt: string) => void;
  /** Clear the request so the user can write their own. */
  onWriteOwn: () => void;
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
  onPickExample,
  onWriteOwn,
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
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-border bg-surface p-4 shadow-raised sm:p-6"
      style={{ backgroundImage: "var(--hero-wash)" }}
    >
      <form onSubmit={handleSubmit} noValidate>
        {/* The h2 doubles as the textarea's visible label. */}
        <h2 id={headingId} className="text-display text-foreground">
          <label htmlFor={textareaId}>What should ForgeMind handle?</label>
        </h2>
        <p id={hintId} className="mt-2 max-w-3xl text-body text-foreground-secondary">
          Describe the engineering work in plain language. ForgeMind plans the work and runs only the GitHub, Jira and
          Slack actions it needs.
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
          className="mt-4 block max-h-72 min-h-24 w-full resize-y rounded-lg border border-border-strong bg-surface-elevated px-4 py-3 text-body text-foreground shadow-panel transition-colors field-sizing-content placeholder:text-foreground-muted hover:bg-surface-hover focus-visible:border-primary read-only:cursor-default read-only:text-foreground-secondary read-only:hover:bg-surface-elevated aria-invalid:border-danger"
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

      <Examples value={value} running={running} onPick={onPickExample} onWriteOwn={onWriteOwn} />
    </section>
  );
}

const card =
  "group flex h-full w-full flex-col gap-2 rounded-lg border p-3 text-left transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-60";

function ExampleCard({
  example,
  selected,
  disabled,
  onPick,
}: {
  example: ExamplePrompt;
  selected: boolean;
  disabled: boolean;
  onPick: (prompt: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onPick(example.prompt)}
      className={`${card} ${
        selected
          ? "border-primary bg-primary-subtle"
          : "border-border bg-surface-elevated hover:border-border-strong hover:bg-surface-hover"
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-h3 text-foreground">{example.title}</span>
        <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {example.tools.map((tool) => (
            <IntegrationMark key={tool} integration={tool} className="size-3.5" />
          ))}
          <span className="sr-only">Uses {example.tools.map((tool) => INTEGRATION_NAME[tool]).join(", ")}</span>
        </span>
      </span>
      <span className="line-clamp-2 text-caption text-foreground-muted">{example.prompt}</span>
    </button>
  );
}

function Examples({
  value,
  running,
  onPick,
  onWriteOwn,
}: {
  value: string;
  running: boolean;
  onPick: (prompt: string) => void;
  onWriteOwn: () => void;
}) {
  const id = useId();
  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={id} className="text-label text-foreground-muted uppercase">
          Try an example
        </h3>
        <p className="text-caption text-foreground-muted">
          Have a different engineering problem? Write your own request and run it.
        </p>
      </div>
      <ul aria-labelledby={id} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {EXAMPLE_PROMPTS.map((example) => (
          <li key={example.id}>
            <ExampleCard example={example} selected={value === example.prompt} disabled={running} onPick={onPick} />
          </li>
        ))}
        <li>
          <button
            type="button"
            disabled={running}
            onClick={onWriteOwn}
            className={`${card} border-dashed border-border-strong bg-transparent hover:bg-surface-hover`}
          >
            <span className="flex items-center gap-2 text-h3 text-foreground">
              <PencilIcon className="size-4 text-primary" />
              Write your own
            </span>
            <span className="text-caption text-foreground-muted">
              Have a different engineering problem? Describe it yourself.
            </span>
          </button>
        </li>
      </ul>
    </div>
  );
}
