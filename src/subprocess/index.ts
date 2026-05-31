/**
 * @vibecontrols/plugin-sdk/subprocess
 *
 * Cross-platform subprocess helpers: graceful kill (SIGTERM → SIGKILL),
 * liveness check, port-pool probing, sleep.
 *
 * Design notes:
 * - `gracefulKill` uses SIGTERM first, polls `process.kill(pid, 0)` to
 *   detect exit, then escalates to SIGKILL. On Windows SIGTERM still
 *   arrives via Node's signal-emulation; we keep the same code path.
 * - `findAvailablePort` prefers `Bun.listen` (zero-dep, fast) and falls
 *   back to `node:net` so the helper works under pure Node hosts too.
 *
 * Cross-platform: pure Node + optional Bun runtime feature detection.
 */

import { createServer } from "node:net";

import type { SdkLogger } from "../contract/index.js";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns true if a process with `pid` is reachable from this process.
 * Uses signal 0 — POSIX + Node's Windows shim both recognise it.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Send SIGTERM, poll until the process exits or `timeoutMs` elapses, then
 * escalate to SIGKILL if necessary.
 */
export async function gracefulKill(
  pid: number,
  timeoutMs = 3000,
  logger?: SdkLogger,
): Promise<void> {
  const source = "subprocess";
  if (!isProcessAlive(pid)) return;

  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    logger?.warn?.(source, "SIGTERM failed", {
      pid,
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const pollMs = 50;
  let elapsed = 0;
  while (elapsed < timeoutMs) {
    await sleep(pollMs);
    elapsed += pollMs;
    if (!isProcessAlive(pid)) return;
  }

  // SIGTERM didn't take — force kill.
  try {
    process.kill(pid, "SIGKILL");
  } catch (err) {
    logger?.warn?.(source, "SIGKILL failed", {
      pid,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Probe ports starting at `start` for `range` consecutive numbers; resolve
 * with the first one that bind-tests cleanly. Throws if the whole range is
 * occupied.
 */
export async function findAvailablePort(start: number, range = 200): Promise<number> {
  for (let i = 0; i < range; i++) {
    const port = start + i;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`findAvailablePort: no port free in [${start}, ${start + range - 1}]`);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    try {
      // Probe the WILDCARD address (0.0.0.0), NOT a specific host. A server
      // like ttyd binds the wildcard `0.0.0.0:<port>`; probing the specific
      // `127.0.0.1:<port>` (with Node's default SO_REUSEADDR) does NOT conflict
      // with a wildcard bind, so it falsely reported a held port as free — and
      // findAvailablePort handed the SAME port to every caller, so only the
      // first server bound and every subsequent one died on bind ("only one
      // terminal per agent"). Probing the wildcard detects the in-use port.
      server.listen({ port, host: "0.0.0.0" });
    } catch {
      resolve(false);
    }
  });
}
