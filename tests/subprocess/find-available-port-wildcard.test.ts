/**
 * Regression: findAvailablePort must skip a port already bound on the WILDCARD
 * address (0.0.0.0), exactly as ttyd binds it.
 *
 * Before the fix, isPortFree probed `127.0.0.1:<port>` (a specific address,
 * with Node's default SO_REUSEADDR), which does NOT conflict with a wildcard
 * `0.0.0.0:<port>` bind — so a held port was reported "free" and
 * findAvailablePort handed the SAME port to every caller. In the agent that
 * meant only the FIRST ttyd bound and every subsequent session's ttyd died on
 * bind ("only one terminal per agent / Terminal not running for this session").
 */
import { afterEach, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:net";

import { findAvailablePort } from "../../src/subprocess/index.js";

async function listenWildcard(port: number): Promise<Server> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ port, host: "0.0.0.0" }, () => resolve());
  });
  return server;
}

describe("findAvailablePort — wildcard-held port detection", () => {
  let held: Server | null = null;

  afterEach(async () => {
    if (held) {
      await new Promise<void>((resolve) => held!.close(() => resolve()));
      held = null;
    }
  });

  it("does NOT return a port that is already bound on 0.0.0.0", async () => {
    const base = await findAvailablePort(48000, 200);
    held = await listenWildcard(base);

    const next = await findAvailablePort(base, 50);
    expect(next).not.toBe(base);
    expect(next).toBeGreaterThan(base);
  });

  it("hands distinct ports to back-to-back callers while the first is held", async () => {
    const p1 = await findAvailablePort(48500, 200);
    held = await listenWildcard(p1);

    const p2 = await findAvailablePort(p1, 50);
    expect(p2).not.toBe(p1);
  });
});
