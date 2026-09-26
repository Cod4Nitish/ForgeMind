import type { SwytchError, SwytchErrorCategory } from "./types";

type ErrorLike = {
  message?: string;
  details?: { category?: string; retryable?: boolean };
};

type Classified = { error: string; category?: string; retryable?: boolean };

/**
 * The CLI writes a classified JSON error line to stderr, but stderr also
 * carries unrelated notices (telemetry, fetch progress) that the runtime folds
 * into the message. Pull out the last JSON object that looks like a
 * classified error so categorization never keys off that noise.
 */
export function extractClassifiedError(message: string): Classified | undefined {
  const lines = message.split(/\r?\n/).reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && typeof (parsed as Classified).error === "string") {
        return parsed as Classified;
      }
    } catch {
      // not JSON — keep looking
    }
  }
  return undefined;
}

function categorize(category: string, text: string): SwytchErrorCategory {
  const c = category.toLowerCase();
  const t = text.toLowerCase();

  if (t.includes("failed to spawn") || t.includes("is the cli installed")) return "not_installed";
  if (c.includes("timeout") || t.includes("timed out")) return "timeout";
  if (/tooling\.json|not configured in this project|not enabled|not found in any fetched/.test(t)) return "not_enabled";
  if (
    c === "auth" ||
    /missing credentials|unauthori[sz]ed|forbidden|\b40[13]\b|bad credentials|not connected|invalid_auth|not_authed|token_revoked|token_expired|account_inactive/.test(
      t,
    )
  ) {
    return "auth";
  }
  if (c.includes("policy") || /blocked by policy|policy violation/.test(t)) return "policy";
  if (c.includes("valid") || /validation|invalid (input|param)|missing required|\b(400|422)\b/.test(t)) return "validation";
  if (c.includes("network") || /econn|enotfound|socket hang up|dns|fetch failed|network/.test(t)) return "network";
  if (/provider|upstream|rate.?limit|not_found|http/.test(c) || /\b(429|5\d\d)\b|rate limit/.test(t)) return "provider";
  if (t.includes("invalid json")) return "invalid_response";
  return "unknown";
}

const SAFE_MESSAGES: Record<SwytchErrorCategory, (provider: string) => string> = {
  auth: (p) => `The ${p} connection in Swytchcode needs attention.`,
  not_enabled: (p) => `The required ${p} tool is not enabled in the Swytchcode project.`,
  validation: (p) => `${p} rejected the request as invalid.`,
  policy: (p) => `A Swytchcode policy blocked the ${p} action.`,
  provider: (p) => `${p} returned an error.`,
  timeout: (p) => `The ${p} request timed out.`,
  network: (p) => `${p} could not be reached.`,
  not_installed: () => "The Swytchcode CLI is not available on the server.",
  invalid_response: (p) => `${p} returned data in an unexpected format.`,
  unknown: (p) => `The ${p} action failed.`,
};

const RETRYABLE: ReadonlySet<SwytchErrorCategory> = new Set(["timeout", "network"]);

/**
 * Converts any Swytchcode/runtime failure into a safe, typed error. Raw
 * messages may echo provider responses, so they are only ever logged
 * server-side (redacted) — the returned message is fixed per category.
 */
export function normalizeSwytchError(error: unknown, provider: string): SwytchError {
  const e: ErrorLike = typeof error === "object" && error !== null ? (error as ErrorLike) : { message: String(error) };
  const message = e.message ?? "";
  const classified = extractClassifiedError(message);
  const category = categorize(
    e.details?.category ?? classified?.category ?? "",
    classified ? classified.error : message,
  );
  const retryable = e.details?.retryable ?? classified?.retryable;
  return {
    category,
    message: SAFE_MESSAGES[category](provider),
    retryable: retryable === true || RETRYABLE.has(category),
  };
}

/** The classified error text (or raw message) for redacted server-side logs. */
export function errorDetailForLog(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return extractClassifiedError(message)?.error ?? message;
}

export function invalidResponseError(provider: string): SwytchError {
  return { category: "invalid_response", message: SAFE_MESSAGES.invalid_response(provider), retryable: false };
}
