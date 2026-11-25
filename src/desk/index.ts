/**
 * @vibecontrols/plugin-sdk/desk
 *
 * The agent side of the Stewards desk contract (BOFF-16556; BotManor spec
 * `10-STEWARDS-TECH-SPEC.md` §7). A desk provider plugin (browser, x11,
 * macOS, Windows) implements {@link DeskBackend} and registers it under the
 * `desk` provider kind. The `vibe-plugin-desk` meta wraps every backend in
 * {@link createDeskGuard}, which enforces the rules every provider must
 * follow, once, instead of in each backend:
 *
 * - fencing: the highest fencing token seen per desk wins; lower ones are
 *   refused with `STALE_FENCING_TOKEN`, and a person taking over raises it;
 * - idempotency: a repeated key returns the stored result and does not act;
 * - workspace folder: `shell`, `read_file` and `write_file` stay inside the
 *   configured folder after symlinks are resolved (`OUTSIDE_WORKSPACE_FOLDER`);
 * - timeouts: an action that overruns returns `TIMEOUT` and its signal aborts;
 * - provenance: every result is `UNTRUSTED`, whatever the backend says;
 * - kill switch and local consent: refused before the backend is called.
 *
 * The action vocabulary is BOFF-15340's, extended for the desktop, and is the
 * same one the BotManor server defines (`src/modules/stewards/desk/`). Keep
 * the two in lockstep; do not add a third vocabulary.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

export type DeskTarget =
  /** Accessibility-tree ref from the last `snapshot`. Preferred. */
  | { by: "ref"; ref: string }
  /** Pixels. Fallback only: pixel targets break when layout shifts. */
  | { by: "point"; x: number; y: number }
  /** Desktop providers only. */
  | { by: "window"; app: string; title?: string };

export type DeskAction =
  | { type: "screenshot" }
  | { type: "snapshot" }
  | {
      type: "click";
      target: DeskTarget;
      button?: "left" | "right";
      count?: 1 | 2;
    }
  | { type: "type"; target?: DeskTarget; text: string }
  /** Resolved on the desk side; the value never appears in a result, log or frame. */
  | {
      type: "secret_fill";
      target: DeskTarget;
      secretRef: string;
      expectedOrigin: string;
    }
  | { type: "key"; keys: string[] }
  | { type: "scroll"; target?: DeskTarget; dx: number; dy: number }
  | { type: "navigate"; url: string }
  | { type: "focus_window"; app: string; title?: string }
  | { type: "shell"; command: string; cwd?: string; timeoutMs: number }
  | { type: "read_file"; path: string; maxBytes: number }
  | { type: "write_file"; path: string; content: string };

export type DeskActionType = DeskAction["type"];

export const DESK_ACTION_TYPES = [
  "screenshot",
  "snapshot",
  "click",
  "type",
  "secret_fill",
  "key",
  "scroll",
  "navigate",
  "focus_window",
  "shell",
  "read_file",
  "write_file",
] as const satisfies readonly DeskActionType[];

export const DESK_ERROR_CODES = [
  "STALE_FENCING_TOKEN",
  "LEASE_PREEMPTED",
  "TARGET_NOT_FOUND",
  "URL_BLOCKED",
  "ORIGIN_MISMATCH",
  "OUTSIDE_WORKSPACE_FOLDER",
  "KILL_SWITCH",
  "LOCAL_CONSENT_OFF",
  "TIMEOUT",
  "DESK_OFFLINE",
] as const;

export type DeskErrorCode = (typeof DESK_ERROR_CODES)[number];

export interface DeskActResult {
  ok: boolean;
  /** Redacted by the backend before it leaves the machine (spec §5.8). */
  screenshotPng?: Uint8Array;
  snapshot?: unknown;
  text?: string;
  provenance: "UNTRUSTED";
  error?: { code: DeskErrorCode; message: string };
}

/** What a backend returns. The guard forces `provenance` and fills defaults. */
export type DeskBackendResult = Omit<DeskActResult, "provenance">;

/** Paths a backend receives for file and shell actions, already confined. */
export interface ConfinedPaths {
  /** Absolute, symlink-resolved, inside the workspace folder. */
  path?: string;
  cwd?: string;
}

/** One desk implementation: the browser, x11, macOS or Windows provider. */
export interface DeskBackend {
  /** e.g. "browser", "x11", "macos", "windows". */
  readonly kind: string;
  /** Actions this backend can run. Anything else is refused by the guard. */
  readonly actions: readonly DeskActionType[];
  /**
   * Run one action. `signal` aborts when the guard's timeout fires. File and
   * shell actions receive the confined paths in `paths`; use those, never the
   * raw `action.path` / `action.cwd`.
   */
  act(
    action: DeskAction,
    context: { deskId: string; signal: AbortSignal; paths: ConfinedPaths },
  ): Promise<DeskBackendResult>;
}

export interface DeskActRequest {
  deskId: string;
  /** Decimal string on the wire (JSON has no bigint), or a bigint in process. */
  fencingToken: bigint | string;
  idempotencyKey: string;
  timeoutMs: number;
  action: DeskAction;
}

export interface DeskGuardOptions {
  /** The only folder file and shell actions may touch. Must exist. */
  workspaceFolder: string;
  /** Local safety (own machine). Returning false refuses every action. */
  consentGranted?: () => boolean;
  /** Pressed kill switch. Returning true refuses every action. */
  killSwitchEngaged?: () => boolean;
  /** Idempotency entries kept per guard (default 1000). Oldest are dropped first. */
  maxIdempotencyEntries?: number;
}

export interface DeskGuard {
  act(request: DeskActRequest): Promise<DeskActResult>;
  /** A person took over (or the lease moved): every token below `token` is now stale. */
  raiseFence(deskId: string, token: bigint | string): void;
  /** The highest token seen for a desk, or null before the first call. */
  fenceOf(deskId: string): bigint | null;
}

const fail = (code: DeskErrorCode, message: string): DeskActResult => ({
  ok: false,
  provenance: "UNTRUSTED",
  error: { code, message },
});

function toToken(value: bigint | string): bigint | null {
  if (typeof value === "bigint") return value >= 0n ? value : null;
  if (!/^\d{1,30}$/.test(value)) return null;
  return BigInt(value);
}

/**
 * Resolve `input` inside `root`, following symlinks on every existing
 * component. Returns null when the result escapes the root. `root` must
 * already be a realpath.
 */
export async function confineToFolder(root: string, input: string): Promise<string | null> {
  if (!input || input.includes("\0")) return null;
  const candidate = path.resolve(root, input);
  // Walk up to the nearest existing ancestor and realpath it, so a symlinked
  // parent cannot point outside; the missing tail is appended unchanged.
  let existing = candidate;
  const tail: string[] = [];
  for (;;) {
    try {
      const real = await fs.realpath(existing);
      const resolved = path.join(real, ...tail);
      const rel = path.relative(root, resolved);
      if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
        return resolved;
      }
      return null;
    } catch {
      const parent = path.dirname(existing);
      if (parent === existing) return null;
      tail.unshift(path.basename(existing));
      existing = parent;
    }
  }
}

export function createDeskGuard(backend: DeskBackend, options: DeskGuardOptions): DeskGuard {
  const fences = new Map<string, bigint>();
  const completed = new Map<string, DeskActResult>();
  const maxEntries = options.maxIdempotencyEntries ?? 1000;
  let rootPromise: Promise<string> | null = null;
  const root = () => (rootPromise ??= fs.realpath(options.workspaceFolder));

  // Replays return the stored outcome WITHOUT the screenshot: holding up to
  // `maxEntries` PNGs per desk would cost hundreds of MB. A caller that needs
  // the screen after a replay asks for a fresh `screenshot`.
  const remember = (key: string, result: DeskActResult) => {
    const { screenshotPng: _dropped, ...kept } = result;
    completed.set(key, kept);
    while (completed.size > maxEntries) {
      const oldest = completed.keys().next().value;
      if (oldest === undefined) break;
      completed.delete(oldest);
    }
  };

  async function confine(action: DeskAction): Promise<ConfinedPaths | DeskActResult> {
    if (action.type === "read_file" || action.type === "write_file") {
      const p = await confineToFolder(await root(), action.path);
      if (!p) {
        return fail("OUTSIDE_WORKSPACE_FOLDER", "path is outside the workspace folder");
      }
      return { path: p };
    }
    if (action.type === "shell") {
      const cwd = await confineToFolder(await root(), action.cwd ?? ".");
      if (!cwd) {
        return fail(
          "OUTSIDE_WORKSPACE_FOLDER",
          "working directory is outside the workspace folder",
        );
      }
      return { cwd };
    }
    return {};
  }

  async function run(request: DeskActRequest): Promise<DeskActResult> {
    if (options.killSwitchEngaged?.()) {
      return fail("KILL_SWITCH", "the kill switch is engaged");
    }
    if (options.consentGranted && !options.consentGranted()) {
      return fail("LOCAL_CONSENT_OFF", "remote control is off on this machine");
    }
    if (!backend.actions.includes(request.action.type)) {
      return fail("DESK_OFFLINE", `this ${backend.kind} desk cannot ${request.action.type}`);
    }
    let paths: ConfinedPaths | DeskActResult;
    try {
      paths = await confine(request.action);
    } catch {
      return fail("DESK_OFFLINE", "the workspace folder is not available");
    }
    if ("ok" in paths) return paths;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<DeskActResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(fail("TIMEOUT", `action did not finish in ${request.timeoutMs}ms`));
      }, request.timeoutMs);
    });
    try {
      const outcome = await Promise.race([
        backend
          .act(request.action, {
            deskId: request.deskId,
            signal: controller.signal,
            paths,
          })
          .then((r): DeskActResult => ({ ...r, provenance: "UNTRUSTED" })),
        timeout,
      ]);
      return outcome;
    } catch (err) {
      return fail("DESK_OFFLINE", err instanceof Error ? err.message : "desk backend failed");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async act(request) {
      const token = toToken(request.fencingToken);
      if (token === null) {
        return fail("STALE_FENCING_TOKEN", "malformed fencing token");
      }
      if (!request.idempotencyKey) {
        return fail("DESK_OFFLINE", "idempotencyKey is required");
      }
      if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) {
        return fail("TIMEOUT", "timeoutMs must be positive");
      }
      const highest = fences.get(request.deskId);
      if (highest !== undefined && token < highest) {
        return fail("STALE_FENCING_TOKEN", `fencing token ${token} is below ${highest}`);
      }
      fences.set(request.deskId, token);

      const key = `${request.deskId}\u0000${request.idempotencyKey}`;
      const stored = completed.get(key);
      if (stored) return stored;

      const result = await run(request);
      remember(key, result);
      return result;
    },

    raiseFence(deskId, value) {
      const token = toToken(value);
      if (token === null) return;
      const highest = fences.get(deskId);
      if (highest === undefined || token > highest) fences.set(deskId, token);
    },

    fenceOf(deskId) {
      return fences.get(deskId) ?? null;
    },
  };
}
