import { describe, it, expect } from "bun:test";

import {
  createMockHostServices,
  createMockProfileContext,
  samplePlugin,
} from "../../src/testing/index.js";

describe("createMockHostServices", () => {
  it("returns a HostServices with all surfaces stubbed", () => {
    const hs = createMockHostServices();
    expect(typeof hs.broadcast).toBe("function");
    expect(typeof hs.storage?.get).toBe("function");
    expect(typeof hs.telemetry?.emit).toBe("function");
    expect(typeof hs.audit?.emit).toBe("function");
    expect(typeof hs.serviceRegistry?.registerService).toBe("function");
    expect(typeof hs.cliContributors?.addStatusSection).toBe("function");
  });

  it("returns deterministic defaults", async () => {
    const hs = createMockHostServices();
    expect(hs.getAgentBaseUrl?.()).toBe("http://localhost:3005");
    expect(await hs.getAgentRecordId?.()).toBeNull();
    expect(hs.isGatewayConfigured?.()).toBe(false);
  });

  it("merges overrides on top of defaults (deep)", async () => {
    const customEmit = (..._args: unknown[]) => undefined;
    const hs = createMockHostServices({
      telemetry: { emit: customEmit },
      getAgentVersion: () => "x.y.z",
    });
    expect(hs.telemetry?.emit).toBe(customEmit);
    expect(hs.getAgentVersion?.()).toBe("x.y.z");
    // Untouched defaults still present:
    expect(typeof hs.broadcast).toBe("function");
  });
});

describe("createMockProfileContext", () => {
  it("supplies a default profile name + dataDir", () => {
    const ctx = createMockProfileContext();
    expect(ctx.name).toBe("test-profile");
    expect(ctx.dataDir).toContain("/tmp/sdk-test/profile");
  });

  it("respects overrides", () => {
    const ctx = createMockProfileContext({ name: "alpha" });
    expect(ctx.name).toBe("alpha");
  });
});

describe("samplePlugin fixture", () => {
  it("returns a structurally-valid VibePlugin", () => {
    const ctx = createMockProfileContext();
    const plugin = samplePlugin(ctx);
    expect(plugin.name).toBe("sample-plugin");
    expect(plugin.tags).toContain("backend");
  });
});
