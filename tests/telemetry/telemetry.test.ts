import { describe, it, expect, mock } from "bun:test";

import { TelemetryEmitter } from "../../src/telemetry/index.js";

type EmitFn = (event: string, payload?: Record<string, unknown>) => void;

describe("TelemetryEmitter", () => {
  it("auto-tags plugin/version/timestamp on every emit", () => {
    const emit = mock<EmitFn>(() => undefined);
    const t = new TelemetryEmitter("demo", "1.2.3", { telemetry: { emit } });
    t.emit("custom", { extra: 1 });
    expect(emit).toHaveBeenCalledTimes(1);
    const [evt, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(evt).toBe("custom");
    expect(payload.plugin).toBe("demo");
    expect(payload.version).toBe("1.2.3");
    expect(typeof payload.timestamp).toBe("string");
    expect(payload.extra).toBe(1);
  });

  it("emitReady emits <plugin>.ready", () => {
    const emit = mock<EmitFn>(() => undefined);
    new TelemetryEmitter("demo", "0", { telemetry: { emit } }).emitReady({ port: 1 });
    expect(emit).toHaveBeenCalledTimes(1);
    const [evt, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(evt).toBe("demo.ready");
    expect(payload.port).toBe(1);
  });

  it("emitError extracts message from Error and emits <plugin>.error", () => {
    const emit = mock<EmitFn>(() => undefined);
    new TelemetryEmitter("demo", "0", { telemetry: { emit } }).emitError(new Error("boom"), {
      stage: "init",
    });
    const [evt, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(evt).toBe("demo.error");
    expect(payload.message).toBe("boom");
    expect(payload.stage).toBe("init");
  });

  it("emitEvent is a thin alias of emit", () => {
    const emit = mock<EmitFn>(() => undefined);
    new TelemetryEmitter("demo", "0", { telemetry: { emit } }).emitEvent("e");
    expect(emit).toHaveBeenCalledTimes(1);
    const [evt] = emit.mock.calls[0] as [string];
    expect(evt).toBe("e");
  });

  it("is a no-op when hostServices.telemetry is missing", () => {
    const t = new TelemetryEmitter("demo", "0", {});
    expect(() => t.emit("custom")).not.toThrow();
    expect(() => t.emitReady()).not.toThrow();
    expect(() => t.emitError(new Error("x"))).not.toThrow();
  });
});
