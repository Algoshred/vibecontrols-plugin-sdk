import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type DeskAction,
  type DeskActRequest,
  type DeskBackend,
  DESK_ACTION_TYPES,
  DESK_ERROR_CODES,
  confineToFolder,
  createDeskGuard,
} from "../../src/desk/index.js";

let base: string;
let folder: string;
let outside: string;

beforeAll(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "vc-desk-")));
  folder = join(base, "workspace");
  outside = join(base, "outside");
  mkdirSync(join(folder, "sub"), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(outside, "secret.txt"), "nope");
  symlinkSync(outside, join(folder, "escape"));
  symlinkSync(join(outside, "secret.txt"), join(folder, "link.txt"));
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

interface Call {
  action: DeskAction;
  paths: { path?: string; cwd?: string };
}

function fakeBackend(overrides: Partial<DeskBackend> = {}) {
  const calls: Call[] = [];
  const backend: DeskBackend = {
    kind: "fake",
    actions: DESK_ACTION_TYPES,
    async act(action, { paths }) {
      calls.push({ action, paths });
      return { ok: true, screenshotPng: new Uint8Array([1, 2, 3]), text: action.type };
    },
    ...overrides,
  };
  return { backend, calls };
}

let n = 0;
const req = (action: DeskAction, over: Partial<DeskActRequest> = {}): DeskActRequest => ({
  deskId: "d1",
  fencingToken: "1",
  idempotencyKey: `k${++n}`,
  timeoutMs: 1000,
  action,
  ...over,
});

describe("desk contract", () => {
  it("lists the spec vocabulary and error codes", () => {
    expect(DESK_ACTION_TYPES).toHaveLength(12);
    expect(DESK_ERROR_CODES).toHaveLength(10);
  });
});

describe("createDeskGuard", () => {
  let fake: ReturnType<typeof fakeBackend>;
  beforeEach(() => {
    fake = fakeBackend();
  });

  it("runs an action and forces UNTRUSTED provenance", async () => {
    const guard = createDeskGuard(
      { ...fake.backend, act: async () => ({ ok: true, provenance: "TRUSTED" }) as never },
      { workspaceFolder: folder },
    );
    const r = await guard.act(req({ type: "screenshot" }));
    expect(r).toMatchObject({ ok: true, provenance: "UNTRUSTED" });
  });

  it("refuses a lower fencing token and accepts equal or higher", async () => {
    const guard = createDeskGuard(fake.backend, { workspaceFolder: folder });
    expect((await guard.act(req({ type: "screenshot" }, { fencingToken: 5n }))).ok).toBe(true);
    expect((await guard.act(req({ type: "screenshot" }, { fencingToken: "5" }))).ok).toBe(true);
    const stale = await guard.act(req({ type: "screenshot" }, { fencingToken: "4" }));
    expect(stale.error?.code).toBe("STALE_FENCING_TOKEN");
    expect(guard.fenceOf("d1")).toBe(5n);
    expect(guard.fenceOf("other")).toBeNull();
    // Desks are fenced independently.
    expect(
      (await guard.act(req({ type: "screenshot" }, { deskId: "d2", fencingToken: "1" }))).ok,
    ).toBe(true);
  });

  it("fences the steward out after a takeover raises the token", async () => {
    const guard = createDeskGuard(fake.backend, { workspaceFolder: folder });
    await guard.act(req({ type: "screenshot" }, { fencingToken: "3" }));
    guard.raiseFence("d1", "7");
    guard.raiseFence("d1", "2"); // never lowers
    guard.raiseFence("d1", "garbage"); // ignored
    expect(guard.fenceOf("d1")).toBe(7n);
    expect((await guard.act(req({ type: "screenshot" }, { fencingToken: "3" }))).error?.code).toBe(
      "STALE_FENCING_TOKEN",
    );
  });

  it("rejects malformed tokens, keys and timeouts", async () => {
    const guard = createDeskGuard(fake.backend, { workspaceFolder: folder });
    for (const fencingToken of ["-1", "1.5", "abc", "", -1n]) {
      expect((await guard.act(req({ type: "screenshot" }, { fencingToken }))).error?.code).toBe(
        "STALE_FENCING_TOKEN",
      );
    }
    expect((await guard.act(req({ type: "screenshot" }, { idempotencyKey: "" }))).ok).toBe(false);
    expect((await guard.act(req({ type: "screenshot" }, { timeoutMs: 0 }))).error?.code).toBe(
      "TIMEOUT",
    );
    expect(fake.calls).toHaveLength(0);
  });

  it("replays a repeated idempotency key without acting, and without the screenshot", async () => {
    const guard = createDeskGuard(fake.backend, {
      workspaceFolder: folder,
      maxIdempotencyEntries: 2,
    });
    const first = await guard.act(
      req({ type: "click", target: { by: "ref", ref: "e1" } }, { idempotencyKey: "same" }),
    );
    expect(first.screenshotPng).toBeDefined();
    const replay = await guard.act(
      req({ type: "click", target: { by: "ref", ref: "e1" } }, { idempotencyKey: "same" }),
    );
    expect(fake.calls).toHaveLength(1);
    expect(replay).toEqual({ ok: true, text: "click", provenance: "UNTRUSTED" });

    // The cache is bounded: the oldest key is evicted and would run again.
    await guard.act(req({ type: "screenshot" }, { idempotencyKey: "b" }));
    await guard.act(req({ type: "screenshot" }, { idempotencyKey: "c" }));
    await guard.act(
      req({ type: "click", target: { by: "ref", ref: "e1" } }, { idempotencyKey: "same" }),
    );
    expect(fake.calls).toHaveLength(4);
  });

  it("refuses actions the backend does not support", async () => {
    const guard = createDeskGuard(
      { ...fake.backend, actions: ["screenshot"] },
      { workspaceFolder: folder },
    );
    const r = await guard.act(req({ type: "shell", command: "ls", timeoutMs: 10 }));
    expect(r.error?.code).toBe("DESK_OFFLINE");
    expect(r.error?.message).toContain("cannot shell");
  });

  it("checks the kill switch and local consent before the backend", async () => {
    let killed = true;
    let consent = false;
    const guard = createDeskGuard(fake.backend, {
      workspaceFolder: folder,
      killSwitchEngaged: () => killed,
      consentGranted: () => consent,
    });
    expect((await guard.act(req({ type: "screenshot" }))).error?.code).toBe("KILL_SWITCH");
    killed = false;
    expect((await guard.act(req({ type: "screenshot" }))).error?.code).toBe("LOCAL_CONSENT_OFF");
    consent = true;
    expect((await guard.act(req({ type: "screenshot" }))).ok).toBe(true);
    expect(fake.calls).toHaveLength(1);
  });

  it("times out a slow backend and aborts its signal", async () => {
    let aborted = false;
    const guard = createDeskGuard(
      {
        ...fake.backend,
        act: (_a, { signal }) =>
          new Promise((resolve) => {
            signal.addEventListener("abort", () => {
              aborted = true;
            });
            setTimeout(() => resolve({ ok: true }), 500);
          }),
      },
      { workspaceFolder: folder },
    );
    const r = await guard.act(req({ type: "screenshot" }, { timeoutMs: 20 }));
    expect(r.error?.code).toBe("TIMEOUT");
    expect(aborted).toBe(true);
  });

  it("turns a backend exception into DESK_OFFLINE", async () => {
    const guard = createDeskGuard(
      {
        ...fake.backend,
        act: async () => {
          throw new Error("display gone");
        },
      },
      { workspaceFolder: folder },
    );
    expect((await guard.act(req({ type: "screenshot" }))).error).toEqual({
      code: "DESK_OFFLINE",
      message: "display gone",
    });
    const guard2 = createDeskGuard(
      {
        ...fake.backend,
        act: () => Promise.reject("not an error"),
      },
      { workspaceFolder: folder },
    );
    expect((await guard2.act(req({ type: "screenshot" }))).error?.message).toBe(
      "desk backend failed",
    );
  });

  it("confines file and shell actions and hands the backend the resolved paths", async () => {
    const guard = createDeskGuard(fake.backend, { workspaceFolder: folder });
    expect((await guard.act(req({ type: "read_file", path: "sub/a.txt", maxBytes: 10 }))).ok).toBe(
      true,
    );
    expect(fake.calls.at(-1)?.paths).toEqual({ path: join(folder, "sub", "a.txt") });
    expect(
      (await guard.act(req({ type: "write_file", path: "new/deep/b.txt", content: "x" }))).ok,
    ).toBe(true);
    expect(fake.calls.at(-1)?.paths).toEqual({ path: join(folder, "new", "deep", "b.txt") });
    expect((await guard.act(req({ type: "shell", command: "ls", timeoutMs: 10 }))).ok).toBe(true);
    expect(fake.calls.at(-1)?.paths).toEqual({ cwd: folder });

    const before = fake.calls.length;
    for (const action of [
      { type: "read_file", path: "../outside/secret.txt", maxBytes: 1 },
      { type: "read_file", path: "/etc/passwd", maxBytes: 1 },
      { type: "read_file", path: "escape/secret.txt", maxBytes: 1 },
      { type: "read_file", path: "link.txt", maxBytes: 1 },
      { type: "write_file", path: "escape/new.txt", content: "x" },
      { type: "shell", command: "ls", cwd: "escape", timeoutMs: 10 },
      { type: "shell", command: "ls", cwd: "/", timeoutMs: 10 },
    ] as DeskAction[]) {
      expect((await guard.act(req(action))).error?.code).toBe("OUTSIDE_WORKSPACE_FOLDER");
    }
    expect(fake.calls.length).toBe(before);
  });

  it("refuses everything when the workspace folder is missing", async () => {
    const guard = createDeskGuard(fake.backend, { workspaceFolder: join(base, "missing") });
    const r = await guard.act(req({ type: "read_file", path: "a", maxBytes: 1 }));
    expect(r.error?.code).toBe("DESK_OFFLINE");
  });
});

describe("confineToFolder", () => {
  it("rejects empty and NUL paths", async () => {
    expect(await confineToFolder(folder, "")).toBeNull();
    expect(await confineToFolder(folder, "a\0b")).toBeNull();
  });

  it("accepts the folder itself", async () => {
    expect(await confineToFolder(folder, ".")).toBe(folder);
  });

  it("rejects a sibling folder sharing the prefix", async () => {
    mkdirSync(`${folder}x`, { recursive: true });
    expect(await confineToFolder(folder, `${folder}x/a`)).toBeNull();
  });
});
