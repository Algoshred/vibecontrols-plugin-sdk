import { describe, it, expect, mock } from "bun:test";

import { createLifecycleHooks } from "../../src/lifecycle/index.js";
import type { HostServices, PluginStopContext } from "../../src/contract/index.js";

function host(telemetry?: {
  emit: (e: string, p?: Record<string, unknown>) => void;
}): HostServices {
  return { telemetry };
}

describe("createLifecycleHooks", () => {
  it("emits telemetry with the plugin tag when telemetryEventName is set", async () => {
    const emit = mock((_event: string, _payload?: Record<string, unknown>) => undefined);
    const hooks = createLifecycleHooks({
      name: "demo",
      telemetryEventName: "demo.ready",
    });
    await hooks.onServerStart(undefined, host({ emit }));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("demo.ready", { plugin: "demo" });
  });

  it("calls onInit with hostServices and forwards the stop context to onShutdown", async () => {
    const onInit = mock(async (_hs: HostServices) => undefined);
    const onShutdown = mock(async (_ctx?: PluginStopContext) => undefined);
    const hs = host();
    const hooks = createLifecycleHooks({
      name: "demo",
      onInit,
      onShutdown,
    });
    await hooks.onServerStart(undefined, hs);
    await hooks.onServerStop({ reason: "reload" });
    await hooks.onServerStop({ reason: "shutdown" });
    await hooks.onServerStop();
    expect(onInit).toHaveBeenCalledTimes(1);
    expect(onInit).toHaveBeenCalledWith(hs);
    expect(onShutdown).toHaveBeenCalledTimes(3);
    expect(onShutdown.mock.calls[0]?.[0]).toEqual({ reason: "reload" });
    expect(onShutdown.mock.calls[1]?.[0]).toEqual({ reason: "shutdown" });
    expect(onShutdown.mock.calls[2]?.[0]).toBeUndefined();
  });

  it("skips init on a skipped platform without invoking onInit", async () => {
    const onInit = mock(() => undefined);
    const hooks = createLifecycleHooks({
      name: "demo",
      onInit,
      skipPlatforms: [process.platform],
    });
    const written: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      await hooks.onServerStart(undefined, host());
    } finally {
      process.stderr.write = orig;
    }
    expect(onInit).not.toHaveBeenCalled();
    expect(written.join("")).toContain("skipping init");
  });

  it("is a no-op when neither onInit nor telemetry is configured", async () => {
    const hooks = createLifecycleHooks({ name: "demo" });
    await expect(hooks.onServerStart(undefined, host())).resolves.toBeUndefined();
    await expect(hooks.onServerStop()).resolves.toBeUndefined();
  });
});
