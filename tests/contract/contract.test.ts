import { describe, it, expect } from "bun:test";

import {
  FULL_TRUST_CAPS,
  type HostServices,
  type PluginCapabilities,
  type ProfileContext,
  type VibePlugin,
  type VibePluginFactory,
} from "../../src/contract/index.js";

describe("contract", () => {
  it("FULL_TRUST_CAPS exposes all capability fields permissively", () => {
    expect(FULL_TRUST_CAPS).toEqual({
      storage: "rw",
      secrets: "rw",
      gateway: true,
      broadcast: true,
      subprocess: true,
      audit: true,
      telemetry: true,
      singletonOnly: false,
      requiresIsolation: false,
    });
  });

  it("a minimal VibePlugin is structurally valid", () => {
    const plugin: VibePlugin = {
      name: "demo",
      version: "1.0.0",
    };
    expect(plugin.name).toBe("demo");
    expect(plugin.version).toBe("1.0.0");
  });

  it("a VibePluginFactory accepts a ProfileContext and returns a plugin", () => {
    const factory: VibePluginFactory = (ctx: ProfileContext) => ({
      name: ctx.name,
      version: "0.0.0",
    });
    const plugin = factory({ name: "alpha", dataDir: "/tmp/x" });
    expect(plugin.name).toBe("alpha");
  });

  it("PluginCapabilities defaults compile when all fields omitted", () => {
    const caps: PluginCapabilities = {};
    expect(caps).toEqual({});
  });

  it("HostServices is fully optional — partial host implementations type-check", () => {
    const partial: HostServices = {};
    expect(partial.storage).toBeUndefined();
  });
});
