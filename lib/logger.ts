/**
 * Minimal structured server logger. Logs carry run metadata only — never
 * prompts, raw model output, provider payloads or credentials. `redact` is a
 * last line of defence for anything that slips into a message.
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]+/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /xox[abposr]-[A-Za-z0-9-]+/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /(api[_-]?key|token|secret|password|authorization)(\s*["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
];

export function redact(text: string): string {
  return SECRET_PATTERNS.reduce(
    (out, pattern) =>
      out.replace(pattern, (match, key?: string, sep?: string) =>
        typeof key === "string" && typeof sep === "string" ? `${key}${sep}[REDACTED]` : "[REDACTED]",
      ),
    text,
  );
}

type LogFields = Record<string, string | number | boolean | undefined>;

function write(level: "info" | "warn" | "error", event: string, fields: LogFields) {
  const line = redact(JSON.stringify({ level, event, ...fields, time: new Date().toISOString() }));
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (event: string, fields: LogFields = {}) => write("info", event, fields),
  warn: (event: string, fields: LogFields = {}) => write("warn", event, fields),
  error: (event: string, fields: LogFields = {}) => write("error", event, fields),
};
