import { describe, it, expect } from "bun:test";

import { redact } from "../../src/cli/redaction.js";

describe("redact", () => {
  it("replaces sensitive keys at any nesting level", () => {
    const out = redact({
      token: "abc",
      nested: { password: "p", inner: { apiKey: "x" } },
      list: [{ secret: "s" }, { ok: "kept" }],
    });
    expect(out).toEqual({
      token: "[redacted]",
      nested: { password: "[redacted]", inner: { apiKey: "[redacted]" } },
      list: [{ secret: "[redacted]" }, { ok: "kept" }],
    });
  });

  it("matches every documented sensitive field", () => {
    const fields = [
      "token",
      "secret",
      "password",
      "apikey",
      "api_key",
      "key",
      "auth",
      "credential",
      "email",
    ];
    for (const f of fields) {
      const out = redact({ [f]: "v" }) as Record<string, unknown>;
      expect(out[f]).toBe("[redacted]");
    }
  });

  it("matches case-insensitively", () => {
    expect(redact({ TOKEN: "x" })).toEqual({ TOKEN: "[redacted]" });
    expect(redact({ Email: "x" })).toEqual({ Email: "[redacted]" });
  });

  it("leaves primitives, null, and undefined untouched", () => {
    expect(redact("hello")).toBe("hello");
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
    expect(redact(null)).toBe(null);
    expect(redact(undefined)).toBe(undefined);
  });

  it("walks arrays without mutating their order", () => {
    expect(redact([1, 2, 3])).toEqual([1, 2, 3]);
    expect(redact([{ token: "a" }, "b"])).toEqual([{ token: "[redacted]" }, "b"]);
  });
});
