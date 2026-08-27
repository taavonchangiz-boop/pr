// =====================================================================
// POSTYAR — Destination provider util: sanitization
// ---------------------------------------------------------------------
// `sanitizeRaw` walks an unknown payload and:
//   - replaces any string containing "bot<token>/" with "bot<TOKEN>/"
//     (Telegram/Bale URL pattern)
//   - replaces any string containing "Bot <token>" (Rubika auth header echo)
//     with "Bot <TOKEN>"
//   - replaces any field whose name looks like "token" / "secret"
//   - truncates string values longer than 4KB to bound audit rows
// =====================================================================
const MAX_STR_LEN = 4096;

function isTokenishKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k === "token" ||
    k === "bottoken" ||
    k === "secret" ||
    k === "apiaccesskey" ||
    k === "authorization" ||
    k === "password"
  );
}

function maskString(value: string): string {
  let v = value;
  // Telegram / Bale URL pattern: bot<TOKEN>/<method>
  v = v.replace(/bot\d+:[A-Za-z0-9_-]{20,}\//g, "bot<TOKEN>/");
  // Rubika auth header echo: "Bot <TOKEN>"
  v = v.replace(/Bot\s+[A-Za-z0-9._-]{16,}/g, "Bot <TOKEN>");
  if (v.length > MAX_STR_LEN) v = v.slice(0, MAX_STR_LEN) + "...[truncated]";
  return v;
}

export function sanitizeRaw(input: unknown, depth = 0): unknown {
  if (depth > 6) return "[max depth]";
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return maskString(input);
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (input instanceof Error) {
    return { __error: true, name: input.name, message: maskString(input.message) };
  }
  if (Array.isArray(input)) {
    return input.slice(0, 32).map((v) => sanitizeRaw(v, depth + 1));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (isTokenishKey(k)) {
        out[k] = "<REDACTED>";
      } else {
        out[k] = sanitizeRaw(v, depth + 1);
      }
    }
    return out;
  }
  return String(input).slice(0, MAX_STR_LEN);
}

/** Scrub the token from a Telegram/Bale Bot API URL for safe logging. */
export function scrubTokenFromUrl(url: string): string {
  return url.replace(/bot\d+:[A-Za-z0-9_-]{20,}\//g, "bot<TOKEN>/");
}
