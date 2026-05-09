/**
 * Recursive sensitive-field stripper. Replaces values for keys matching the
 * sensitive regex with the literal string "[redacted]". Walks arrays, plain
 * objects, and leaves primitives / null / undefined untouched.
 */

const SENSITIVE_KEY_RE = /(token|secret|password|apikey|api_key|key|auth|credential|email)/i;

export function redact<T>(value: T): T {
  return redactInner(value) as T;
}

function redactInner(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactInner);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = redactInner(v);
    }
    return out;
  }
  return value;
}
