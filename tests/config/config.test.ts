import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

import { ConfigManager } from "../../src/config/index.js";
import type { HostServices } from "../../src/contract/index.js";

type GetConfigFn = (key: string) => Promise<string | undefined>;
type LogFn = (source: string, message: string, meta?: Record<string, unknown>) => void;

describe("ConfigManager", () => {
  const ENV = "VIBE_DEMO_KEY";
  const orig = process.env[ENV];

  beforeEach(() => {
    delete process.env[ENV];
  });
  afterEach(() => {
    if (orig === undefined) delete process.env[ENV];
    else process.env[ENV] = orig;
  });

  it("returns env value when set (highest priority)", async () => {
    process.env[ENV] = "from-env";
    const cm = new ConfigManager("demo");
    expect(await cm.get("key")).toBe("from-env");
  });

  it("falls back to host getConfig when env absent", async () => {
    const getConfig = mock<GetConfigFn>(async (k: string) =>
      k === "demo.key" ? "from-host" : undefined,
    );
    const hs: HostServices = { getConfig };
    expect(await new ConfigManager("demo", hs).get("key")).toBe("from-host");
  });

  it("falls back to default when both env and host are absent", async () => {
    expect(await new ConfigManager("demo").get("key", "fallback")).toBe("fallback");
  });

  it("getRequired throws when nothing resolves", async () => {
    await expect(new ConfigManager("demo").getRequired("missing")).rejects.toThrow(/required/);
  });

  it("getInt parses ints and warns on garbage", async () => {
    process.env[ENV] = "42";
    const cm = new ConfigManager("demo");
    expect(await cm.getInt("key")).toBe(42);

    process.env[ENV] = "not-a-number";
    const warn = mock<LogFn>(() => undefined);
    expect(await new ConfigManager("demo", undefined, { warn }).getInt("key", 7)).toBe(7);
    expect(warn).toHaveBeenCalled();
  });

  it("getBoolean parses common truthy/falsy literals", async () => {
    for (const v of ["true", "1", "yes", "on"]) {
      process.env[ENV] = v;
      expect(await new ConfigManager("demo").getBoolean("key")).toBe(true);
    }
    for (const v of ["false", "0", "no", "off"]) {
      process.env[ENV] = v;
      expect(await new ConfigManager("demo").getBoolean("key")).toBe(false);
    }
  });

  it("getBoolean warns + returns default on garbage", async () => {
    process.env[ENV] = "maybe";
    const warn = mock<LogFn>(() => undefined);
    expect(await new ConfigManager("demo", undefined, { warn }).getBoolean("key", true)).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("hyphenated plugin / key names are uppercased to underscores in env", async () => {
    process.env["VIBE_MY_PLUGIN_HOT_KEY"] = "yes";
    try {
      expect(await new ConfigManager("my-plugin").get("hot-key")).toBe("yes");
    } finally {
      delete process.env["VIBE_MY_PLUGIN_HOT_KEY"];
    }
  });
});
