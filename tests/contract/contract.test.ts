import { describe, it, expect } from "bun:test";

import {
  FULL_TRUST_CAPS,
  PROVIDER_TYPES,
  type HostServices,
  type PluginCapabilities,
  type PluginStopContext,
  type ProfileContext,
  type ProviderType,
  type VibePlugin,
  type VibePluginFactory,
} from "../../src/contract/index.js";
import type { LifecycleHooks } from "../../src/lifecycle/index.js";

// ── Type-level pins ────────────────────────────────────────────────────
// These fail `bun run type:check` (tests are in tsconfig `include`) if the
// contract drifts. `Equal` is the standard exact-equality check: mutual
// assignability is not enough, it would accept `any`.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// The agent calls onServerStop(context?: { reason }) — never with HostServices.
type StopHook = NonNullable<VibePlugin["onServerStop"]>;
export type _StopParams = Expect<Equal<Parameters<StopHook>, [context?: PluginStopContext]>>;
export type _StopReason = Expect<Equal<PluginStopContext["reason"], "reload" | "shutdown">>;
// createLifecycleHooks().onServerStop must be assignable to the contract hook.
export type _LifecycleStop = Expect<
  Equal<Parameters<LifecycleHooks["onServerStop"]>, [context?: PluginStopContext]>
>;
// ProviderType is exactly the runtime list — no hand-maintained second copy.
export type _ProviderType = Expect<
  Equal<ProviderType, "tunnel" | "session" | "ai" | "plan" | "gitops" | "security" | "desk">
>;

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

  it("PROVIDER_TYPES declares the desk provider kind, once, alongside the originals", () => {
    expect([...PROVIDER_TYPES]).toEqual([
      "tunnel",
      "session",
      "ai",
      "plan",
      "gitops",
      "security",
      "desk",
    ]);
    expect(new Set(PROVIDER_TYPES).size).toBe(PROVIDER_TYPES.length);
  });

  it("a desk META can declare a desk provider and elect it as the default", () => {
    const plugin: VibePlugin = {
      name: "desk",
      version: "0.0.0",
      capabilities: { storage: "rw", subprocess: true, audit: true, requiresIsolation: true },
      metaProviders: [
        {
          packageName: "@vibecontrols/vibe-plugin-desk-x11",
          pluginName: "desk-x11",
          defaultOn: ["linux"],
          providerType: "desk",
        },
      ],
    };
    expect(plugin.metaProviders?.[0]?.providerType).toBe("desk");
    expect(plugin.capabilities?.requiresIsolation).toBe(true);
  });

  it("onServerStop takes an optional stop context", async () => {
    const seen: Array<PluginStopContext | undefined> = [];
    const plugin: VibePlugin = {
      name: "demo",
      version: "1.0.0",
      onServerStop: (context) => {
        seen.push(context);
      },
    };
    await plugin.onServerStop?.({ reason: "reload" });
    await plugin.onServerStop?.();
    expect(seen).toEqual([{ reason: "reload" }, undefined]);
  });

  it("HostServices is fully optional — partial host implementations type-check", () => {
    const partial: HostServices = {};
    expect(partial.storage).toBeUndefined();
  });
});
