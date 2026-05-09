import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";

import { pickOutputMode, runMultimode, maybePrintJson } from "../../src/cli/multimode.js";

describe("pickOutputMode", () => {
  it("returns 'json' when --json is set", () => {
    expect(pickOutputMode({ json: true })).toBe("json");
  });
  it("returns 'plain' when --plain is set", () => {
    expect(pickOutputMode({ plain: true })).toBe("plain");
  });
  it("returns 'interactive' when --interactive is set", () => {
    expect(pickOutputMode({ interactive: true })).toBe("interactive");
  });
  it("returns 'auto' when no flags are set", () => {
    expect(pickOutputMode({})).toBe("auto");
  });
  it("--json wins over --plain and --interactive", () => {
    expect(pickOutputMode({ json: true, plain: true, interactive: true })).toBe("json");
  });
});

describe("runMultimode", () => {
  let writes: string[];
  let origWrite: typeof process.stdout.write;

  beforeEach(() => {
    writes = [];
    origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = origWrite;
  });

  it("emits JSON in json mode", async () => {
    await runMultimode({
      mode: "json",
      fetchData: () => ({ a: 1 }),
      plain: () => undefined,
    });
    expect(writes.join("")).toContain('"a": 1');
  });

  it("uses the json shaper when provided", async () => {
    await runMultimode({
      mode: "json",
      fetchData: () => ({ a: 1 }),
      plain: () => undefined,
      json: (d) => ({ wrapped: d }),
    });
    expect(writes.join("")).toContain('"wrapped"');
  });

  it("falls through to plain when interactive throws", async () => {
    const plain = mock((_data: string) => undefined);
    const interactive = mock(async (_data: string) => {
      throw new Error("opentui missing");
    });
    await runMultimode({
      mode: "interactive",
      fetchData: () => "data",
      plain,
      interactive,
    });
    expect(interactive).toHaveBeenCalledTimes(1);
    expect(plain).toHaveBeenCalledTimes(1);
  });

  it("uses plain in plain mode", async () => {
    const plain = mock((_data: number) => undefined);
    await runMultimode({
      mode: "plain",
      fetchData: () => 1,
      plain,
    });
    expect(plain).toHaveBeenCalledTimes(1);
    expect(plain).toHaveBeenCalledWith(1);
  });

  it("falls back to plain in auto mode when no interactive renderer", async () => {
    const plain = mock((_data: string) => undefined);
    await runMultimode({
      mode: "auto",
      fetchData: () => "x",
      plain,
    });
    expect(plain).toHaveBeenCalledTimes(1);
  });
});

describe("maybePrintJson", () => {
  it("prints when --json is on and returns true", () => {
    const writes: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      const printed = maybePrintJson({ json: true }, { ok: true });
      expect(printed).toBe(true);
      expect(writes.join("")).toContain('"ok": true');
    } finally {
      process.stdout.write = orig;
    }
  });

  it("returns false when --json is off", () => {
    expect(maybePrintJson({}, { ok: true })).toBe(false);
  });
});
