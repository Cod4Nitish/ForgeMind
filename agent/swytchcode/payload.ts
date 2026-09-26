const WRAPPER_KEYS = ["data", "body", "response", "result"] as const;

/**
 * Swytchcode returns the provider response; depending on the CLI output mode
 * it may be wrapped (e.g. `{ status, body }`). Returns the first value —
 * the payload itself or a wrapped value up to two levels deep — that
 * satisfies `isExpected`, or `undefined` when none does.
 */
export function unwrapPayload<T>(raw: unknown, isExpected: (value: unknown) => value is T, depth = 2): T | undefined {
  if (isExpected(raw)) return raw;
  if (depth <= 0 || raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  for (const key of WRAPPER_KEYS) {
    if (key in raw) {
      const found = unwrapPayload((raw as Record<string, unknown>)[key], isExpected, depth - 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
