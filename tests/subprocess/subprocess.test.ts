import { describe, it, expect, mock } from "bun:test";

import {
  gracefulKill,
  isProcessAlive,
  findAvailablePort,
  sleep,
} from "../../src/subprocess/index.js";

describe("sleep", () => {
  it("resolves after at least the requested duration", async () => {
    const start = Date.now();
    await sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });
});

describe("isProcessAlive", () => {
  it("returns true for our own PID", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it("returns false for a definitely-dead PID", () => {
    // PID 0 / very large PID — process.kill throws ESRCH on Linux/macOS,
    // EINVAL on Windows; both branches return false.
    expect(isProcessAlive(2 ** 30)).toBe(false);
  });
});

describe("gracefulKill", () => {
  it("returns immediately when the pid is already dead", async () => {
    await expect(gracefulKill(2 ** 30, 50)).resolves.toBeUndefined();
  });

  it("logs a warn when SIGTERM throws", async () => {
    // Mock process.kill to throw on signal !== 0; the alive check
    // (signal 0) succeeds so the SIGTERM path is exercised.
    const origKill = process.kill;
    let calls = 0;
    process.kill = ((pid: number, sig?: string | number) => {
      if (sig === 0) return true;
      calls++;
      throw new Error("EPERM");
    }) as typeof process.kill;
    const warn = mock(() => undefined);
    try {
      await gracefulKill(process.pid, 50, { warn });
    } finally {
      process.kill = origKill;
    }
    expect(calls).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
  });
});

describe("findAvailablePort", () => {
  it("returns a usable port from a high range", async () => {
    const port = await findAvailablePort(45_000, 200);
    expect(port).toBeGreaterThanOrEqual(45_000);
    expect(port).toBeLessThan(45_200);
  });

  it("throws when the entire range is occupied", async () => {
    // Range of size 0 — nothing to probe — should reject.
    await expect(findAvailablePort(45_000, 0)).rejects.toThrow();
  });
});
