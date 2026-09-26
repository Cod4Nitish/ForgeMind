import type { Metadata } from "next";
import { CommandCenter } from "@/components/command-center/command-center";
import { BrandMark } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "ForgeMind — Command Center",
};

/** Static brand, rendered on the server and slotted into the interactive Command Center. */
function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-elevated text-foreground"
      >
        <BrandMark className="size-5" />
      </span>
      <div className="min-w-0">
        <h1 className="text-h1 text-foreground">ForgeMind</h1>
        <p className="text-label text-foreground-muted uppercase">AI Software Engineer</p>
      </div>
    </div>
  );
}

/**
 * Server Component shell. Only the Command Center is a Client Component; it
 * talks exclusively to POST /api/agent (and GET /api/health for the System
 * chip) — never to GitHub, Jira, Slack, Anthropic or Swytchcode directly.
 */
export default function Home() {
  return <CommandCenter brand={<Brand />} />;
}
