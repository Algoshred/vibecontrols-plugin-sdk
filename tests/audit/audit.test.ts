import { describe, it, expect, mock } from "bun:test";

import { AuditLogger } from "../../src/audit/index.js";

describe("AuditLogger", () => {
  it("forwards events with bound source", () => {
    const emit = mock((_event: string, _payload?: Record<string, unknown>) => undefined);
    new AuditLogger("demo", { audit: { emit } }).emit("started", { port: 1 });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("started", { source: "demo", port: 1 });
  });

  it("works with no payload", () => {
    const emit = mock((_event: string, _payload?: Record<string, unknown>) => undefined);
    new AuditLogger("demo", { audit: { emit } }).emit("ping");
    expect(emit).toHaveBeenCalledWith("ping", { source: "demo" });
  });

  it("is a no-op when host audit is absent", () => {
    const a = new AuditLogger("demo", {});
    expect(() => a.emit("x")).not.toThrow();
  });

  it("is a no-op when hostServices is absent", () => {
    const a = new AuditLogger("demo");
    expect(() => a.emit("x", { y: 1 })).not.toThrow();
  });
});
