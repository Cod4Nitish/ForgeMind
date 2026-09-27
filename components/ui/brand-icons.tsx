import type { IntegrationKey } from "@/lib/presentation";
import type { IconProps } from "./icons";

/*
 * Compact integration marks, used only to name the integration they sit next
 * to (always paired with visible text). Decorative: `aria-hidden`.
 */

export function GitHubMark({ className = "size-4" }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

/** Stylised Jira mark: two stacked chevron-diamonds. Colored by `currentColor`. */
export function JiraMark({ className = "size-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <path d="M11.53 2a4.37 4.37 0 0 0 4.35 4.35h1.78v1.72A4.36 4.36 0 0 0 22 12.4V2.84A.84.84 0 0 0 21.16 2Z" />
      <path opacity=".8" d="M6.77 6.8a4.36 4.36 0 0 0 4.34 4.34h1.8v1.72a4.36 4.36 0 0 0 4.34 4.34V7.63a.84.84 0 0 0-.83-.83Z" />
      <path opacity=".6" d="M2 11.6a4.35 4.35 0 0 0 4.35 4.35h1.78v1.72A4.36 4.36 0 0 0 12.47 22v-9.57a.84.84 0 0 0-.84-.84Z" />
    </svg>
  );
}

/** Slack mark in its four brand colors (tokens in globals.css). */
export function SlackMark({ className = "size-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <g fill="var(--slack-red)">
        <path d="M5.04 15.17a2.53 2.53 0 1 1-2.52-2.53h2.52Z" />
        <path d="M6.31 15.17a2.53 2.53 0 0 1 5.05 0v6.31a2.53 2.53 0 1 1-5.05 0Z" />
      </g>
      <g fill="var(--slack-blue)">
        <path d="M8.83 5.04a2.53 2.53 0 1 1 2.53-2.52v2.52Z" />
        <path d="M8.83 6.31a2.53 2.53 0 0 1 0 5.05H2.52a2.53 2.53 0 0 1 0-5.05Z" />
      </g>
      <g fill="var(--slack-green)">
        <path d="M18.96 8.83a2.53 2.53 0 1 1 2.52 2.53h-2.52Z" />
        <path d="M17.69 8.83a2.53 2.53 0 0 1-5.05 0V2.52a2.53 2.53 0 0 1 5.05 0Z" />
      </g>
      <g fill="var(--slack-yellow)">
        <path d="M15.17 18.96a2.53 2.53 0 1 1-2.53 2.52v-2.52Z" />
        <path d="M15.17 17.69a2.53 2.53 0 0 1 0-5.05h6.31a2.53 2.53 0 1 1 0 5.05Z" />
      </g>
    </svg>
  );
}

const MARKS = { github: GitHubMark, jira: JiraMark, slack: SlackMark } as const;

/** Stage-accent color for each mark (Slack carries its own colors). */
const MARK_COLOR: Record<IntegrationKey, string> = {
  github: "text-stage-github",
  jira: "text-stage-jira",
  slack: "",
};

export const INTEGRATION_NAME: Record<IntegrationKey, string> = { github: "GitHub", jira: "Jira", slack: "Slack" };

export function IntegrationMark({ integration, className = "size-4" }: { integration: IntegrationKey; className?: string }) {
  const Mark = MARKS[integration];
  return <Mark className={`${MARK_COLOR[integration]} ${className}`} />;
}
