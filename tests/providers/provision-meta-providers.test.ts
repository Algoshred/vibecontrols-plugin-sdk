import { describe, it, expect, mock } from "bun:test";

import { provisionMetaProviders, currentSupportedOS } from "../../src/providers/index.js";
import type { HostPlugins, HostServices, MetaProviderRef } from "../../src/contract/index.js";

/** Record the ordered sequence of façade calls for one provider package. */
function makeHostPlugins(overrides: Partial<HostPlugins> = {}): {
  plugins: HostPlugins;
  calls: string[];
} {
  const calls: string[] = [];
  const plugins: HostPlugins = {
    install: mock(async (pkg: string) => {
      calls.push(`install:${pkg}`);
    }),
    loadProvider: mock(async (pkg: string) => {
      calls.push(`load:${pkg}`);
    }),
    runPrereqs: mock(async (pkg: string) => {
      calls.push(`prereqs:${pkg}`);
      return { satisfied: true };
    }),
    electDefault: mock(async (type: string, name: string) => {
      calls.push(`elect:${type}:${name}`);
    }),
    isProviderRegistered: mock(() => false),
    skipInstall: mock(() => false),
    ...overrides,
  };
  return { plugins, calls };
}

const REFS: MetaProviderRef[] = [
  {
    packageName: "@vibecontrols/vibe-plugin-session-tmux",
    pluginName: "tmux",
    providerType: "session",
    defaultOn: ["linux", "darwin"],
  },
  {
    packageName: "@vibecontrols/vibe-plugin-session-wezterm",
    pluginName: "wezterm",
    providerType: "session",
    defaultOn: ["win32"],
  },
  {
    // opt-in only — never auto-provisioned on any platform
    packageName: "@vibecontrols/vibe-plugin-session-zellij",
    pluginName: "zellij",
    providerType: "session",
  },
];

describe("provisionMetaProviders", () => {
  it("runs install→load→prereqs→elect in order for the platform default only", async () => {
    const { plugins, calls } = makeHostPlugins();
    const host: HostServices = { plugins };
    await provisionMetaProviders(host, REFS, "linux");
    expect(calls).toEqual([
      "install:@vibecontrols/vibe-plugin-session-tmux",
      "load:@vibecontrols/vibe-plugin-session-tmux",
      "prereqs:@vibecontrols/vibe-plugin-session-tmux",
      "elect:session:tmux",
    ]);
  });

  it("picks the win32 default on Windows", async () => {
    const { plugins, calls } = makeHostPlugins();
    await provisionMetaProviders({ plugins }, REFS, "win32");
    expect(calls).toEqual([
      "install:@vibecontrols/vibe-plugin-session-wezterm",
      "load:@vibecontrols/vibe-plugin-session-wezterm",
      "prereqs:@vibecontrols/vibe-plugin-session-wezterm",
      "elect:session:wezterm",
    ]);
  });

  it("skips install (but still loads+elects) when skipInstall() is true", async () => {
    const { plugins, calls } = makeHostPlugins({ skipInstall: mock(() => true) });
    await provisionMetaProviders({ plugins }, REFS, "linux");
    expect(calls).toEqual([
      "load:@vibecontrols/vibe-plugin-session-tmux",
      "prereqs:@vibecontrols/vibe-plugin-session-tmux",
      "elect:session:tmux",
    ]);
  });

  it("isolates failures — one provider throwing does not abort the others", async () => {
    const { plugins, calls } = makeHostPlugins({
      install: mock(async (pkg: string) => {
        calls.push(`install:${pkg}`);
        if (pkg.endsWith("tmux")) throw new Error("network down");
      }),
    });
    const refs: MetaProviderRef[] = [
      { ...REFS[0]!, defaultOn: ["linux"] },
      { ...REFS[1]!, defaultOn: ["linux"] }, // also a linux default for this test
    ];
    await provisionMetaProviders({ plugins }, refs, "linux");
    // tmux threw at install (no load/elect), wezterm still ran fully
    expect(calls).toContain("install:@vibecontrols/vibe-plugin-session-tmux");
    expect(calls).not.toContain("load:@vibecontrols/vibe-plugin-session-tmux");
    expect(calls).toContain("elect:session:wezterm");
  });

  it("no-ops when host.plugins is absent (older agent / untrusted plugin)", async () => {
    await expect(provisionMetaProviders({}, REFS, "linux")).resolves.toBeUndefined();
  });

  it("no-ops on empty/undefined metaProviders", async () => {
    const { plugins, calls } = makeHostPlugins();
    await provisionMetaProviders({ plugins }, undefined, "linux");
    await provisionMetaProviders({ plugins }, [], "linux");
    expect(calls).toEqual([]);
  });

  it("currentSupportedOS maps platforms (defaulting to linux)", () => {
    expect(currentSupportedOS("darwin")).toBe("darwin");
    expect(currentSupportedOS("win32")).toBe("win32");
    expect(currentSupportedOS("freebsd")).toBe("linux");
  });
});
