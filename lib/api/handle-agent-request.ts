import type { AgentDeps } from "@/agent/deps";
import { ConfigError } from "@/agent/errors";
import { runForgeMind } from "@/agent/run";
import { logger } from "@/lib/logger";
import { AgentRequestSchema, MAX_REQUEST_BYTES } from "./agent-request";
import { AGENT_STREAM_CONTENT_TYPE, type AgentStreamMessage } from "./contract";

export type ApiErrorCode =
  | "invalid_json"
  | "invalid_request"
  | "payload_too_large"
  | "unsupported_media_type"
  | "configuration_error"
  | "internal_error";

function errorResponse(status: number, code: ApiErrorCode, message: string, runId?: string) {
  return Response.json(
    { error: { code, message }, ...(runId ? { runId } : {}) },
    { status, headers: runId ? { "x-forgemind-run-id": runId } : undefined },
  );
}

/**
 * Validates the request, runs the agent and maps every failure to a safe,
 * structured response. Internal exceptions are logged server-side (redacted)
 * and never returned to the client.
 */
export async function handleAgentRequest(
  request: Request,
  resolveDeps: () => AgentDeps,
): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return errorResponse(415, "unsupported_media_type", "Content-Type must be application/json.");
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    return errorResponse(413, "payload_too_large", `Request body must be at most ${MAX_REQUEST_BYTES} bytes.`);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = AgentRequestSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request.";
    return errorResponse(400, "invalid_request", message);
  }

  const runId = crypto.randomUUID();
  const startedAt = Date.now();

  let deps: AgentDeps;
  try {
    deps = resolveDeps();
  } catch (error) {
    if (error instanceof ConfigError) {
      logger.error("agent.config_error", { runId, detail: error.message });
      return errorResponse(503, "configuration_error", "ForgeMind is not fully configured on the server.", runId);
    }
    logger.error("agent.deps_error", { runId });
    return errorResponse(500, "internal_error", "ForgeMind could not start the workflow.", runId);
  }

  if ((request.headers.get("accept") ?? "").toLowerCase().includes(AGENT_STREAM_CONTENT_TYPE)) {
    return streamRun(parsed.data.message, deps, runId, startedAt);
  }

  try {
    logger.info("agent.run_started", { runId });
    const result = await runForgeMind(parsed.data.message, deps, runId);
    logger.info("agent.run_finished", {
      runId,
      status: result.status,
      durationMs: Date.now() - startedAt,
    });
    return Response.json(result, { headers: { "x-forgemind-run-id": runId } });
  } catch (error) {
    logger.error("agent.run_crashed", {
      runId,
      errorName: error instanceof Error ? error.name : "unknown",
      durationMs: Date.now() - startedAt,
    });
    return errorResponse(500, "internal_error", "Agent workflow failed.", runId);
  }
}

/**
 * Opt-in NDJSON progress stream: the same run, reported as it happens. Every
 * line is a public-safe `AgentStreamMessage`; the last one is the complete
 * result or a safe error.
 */
function streamRun(message: string, deps: AgentDeps, runId: string, startedAt: number): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (line: AgentStreamMessage) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}
`));
        } catch {
          open = false; // the client went away; the run still finishes and is logged
        }
      };

      send({ type: "run_started", runId });
      try {
        logger.info("agent.run_started", { runId, streamed: true });
        const result = await runForgeMind(message, deps, runId, (progress) => send(progress));
        logger.info("agent.run_finished", { runId, status: result.status, durationMs: Date.now() - startedAt });
        send({ type: "result", result });
      } catch (error) {
        logger.error("agent.run_crashed", {
          runId,
          errorName: error instanceof Error ? error.name : "unknown",
          durationMs: Date.now() - startedAt,
        });
        send({ type: "error", error: { code: "internal_error", message: "Agent workflow failed." }, runId });
      }
      if (open) controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": `${AGENT_STREAM_CONTENT_TYPE}; charset=utf-8`,
      "cache-control": "no-store",
      "x-forgemind-run-id": runId,
    },
  });
}
