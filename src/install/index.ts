/**
 * @vibecontrols/plugin-sdk/install
 *
 * Cross-platform binary auto-installer for provider plugins. A provider that
 * needs an external binary (a tunnel daemon, a terminal server, …) ships a
 * per-platform download manifest and calls `installBinary()` from its
 * `/prereqs/install`. The binary lands in a stable per-machine cache that the
 * provider resolves by ABSOLUTE PATH, so it is immune to the PATH snapshot
 * `Bun.which()` takes at process start — a mid-run install is otherwise
 * invisible to the daemon until a restart (notably on Windows, where a freshly
 * installed tool's directory isn't on the running process's PATH at all).
 *
 * This keeps binary ownership inside the provider: the thin agent installs no
 * provider tool itself; it only triggers the provider's `/prereqs` protocol.
 *
 * Resolution order: provider cache → $PATH (current env) → download.
 * sha256 is OPTIONAL — when a manifest entry pins it, the download is verified
 * before use; otherwise the HTTPS download plus an optional `--version` sanity
 * check are the integrity gate.
 *
 * Cross-platform: pure node built-ins + Bun.which. Archive extraction shells
 * out to `tar` (POSIX + Windows 10+) / `unzip` (POSIX, with a `tar.exe`
 * fallback on Windows).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, promises as fs } from "node:fs";
import { homedir, tmpdir } from "node:os";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export type ToolPlatform =
  | "linux-x64"
  | "linux-arm64"
  | "darwin-x64"
  | "darwin-arm64"
  | "win32-x64"
  | "win32-arm64";

export function currentPlatform(): ToolPlatform {
  const arch = process.arch === "x64" ? "x64" : "arm64";
  const osName =
    process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
  return `${osName}-${arch}` as ToolPlatform;
}

export interface BinaryDownload {
  /** Direct download URL for this platform (HTTPS). */
  url: string;
  /** Optional sha256 of the downloaded artifact; verified before use when set. */
  sha256?: string;
  /** Archive format. Inferred from the URL extension when omitted. */
  archive?: "tar.gz" | "zip" | "raw";
  /** Path to the binary inside the archive (for tar.gz/zip). */
  binaryWithinArchive?: string;
}

export interface InstallLogger {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
}

export interface InstallBinarySpec {
  /** Tool key — also the cache subdir and default binary name. */
  name: string;
  /** Installed binary filename (`.exe` is appended on Windows if absent). */
  binaryName?: string;
  /** Per-platform download manifest. */
  downloads: Partial<Record<ToolPlatform, BinaryDownload>>;
  /** Args used for the post-install / PATH sanity check. Default `["--version"]`. */
  versionArgs?: string[];
  /** Regex applied to the version output to accept a PATH/cache binary. */
  versionMatcher?: string;
  /** Override platform detection (testing). */
  platform?: ToolPlatform;
  /** Override the cache root (testing). Default `~/.boff/vibecontrols/tools`. */
  cacheRoot?: string;
  log?: InstallLogger;
}

/** Stable per-machine cache root for provider-installed binaries. */
export function toolsCacheRoot(): string {
  return path.join(homedir(), ".boff", "vibecontrols", "tools");
}

function binFileName(name: string, binaryName?: string): string {
  const base = binaryName ?? name;
  if (process.platform === "win32" && !base.toLowerCase().endsWith(".exe")) {
    return `${base}.exe`;
  }
  return base;
}

/** Absolute path the binary lives at once installed by this module. */
export function cachedBinaryPath(name: string, binaryName?: string, cacheRoot?: string): string {
  return path.join(cacheRoot ?? toolsCacheRoot(), name, binFileName(name, binaryName));
}

/**
 * Resolve a binary WITHOUT downloading — synchronous, safe to call from hot
 * paths (e.g. a `resolve<tool>Cmd()` used on every spawn). Checks the provider
 * cache first (absolute path, immune to the PATH snapshot), then `$PATH` using
 * the CURRENT `process.env.PATH` (not the snapshot `Bun.which` would otherwise
 * use). Returns the absolute path, or null when not installed.
 */
export function resolveBinary(
  name: string,
  binaryName?: string,
  cacheRoot?: string,
): string | null {
  const cached = cachedBinaryPath(name, binaryName, cacheRoot);
  if (existsSync(cached)) return cached;
  try {
    const onPath =
      typeof Bun !== "undefined" && typeof Bun.which === "function"
        ? Bun.which(binaryName ?? name, { PATH: process.env.PATH })
        : null;
    if (onPath) return onPath;
  } catch {
    /* fall through */
  }
  return null;
}

async function versionOk(binaryPath: string, spec: InstallBinarySpec): Promise<boolean> {
  if (!spec.versionMatcher) return true;
  return new Promise((resolve) => {
    const child = spawn(binaryPath, spec.versionArgs ?? ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (b: Buffer) => (out += b.toString()));
    child.stderr.on("data", (b: Buffer) => (out += b.toString()));
    child.on("close", () => {
      try {
        resolve(new RegExp(spec.versionMatcher as string).test(out));
      } catch {
        resolve(false);
      }
    });
    child.on("error", () => resolve(false));
  });
}

/**
 * Resolve a binary, downloading + installing it into the cache if it is not
 * already available. Returns the absolute path. Throws when no manifest entry
 * exists for the current platform or the download fails.
 */
export async function installBinary(spec: InstallBinarySpec): Promise<string> {
  const platform = spec.platform ?? currentPlatform();
  const binaryName = binFileName(spec.name, spec.binaryName);
  const cached = cachedBinaryPath(spec.name, spec.binaryName, spec.cacheRoot);

  // 1. Cache probe.
  if (existsSync(cached) && (await versionOk(cached, spec))) return cached;

  // 2. PATH probe (current env).
  try {
    const onPath =
      typeof Bun !== "undefined" && typeof Bun.which === "function"
        ? Bun.which(spec.binaryName ?? spec.name, { PATH: process.env.PATH })
        : null;
    if (onPath && (await versionOk(onPath, spec))) {
      spec.log?.info?.(`[install] using PATH binary ${spec.name} (${onPath})`);
      return onPath;
    }
  } catch {
    /* fall through to download */
  }

  // 3. Download.
  const download = spec.downloads[platform];
  if (!download) {
    throw new Error(`[install] no download manifest entry for ${spec.name} on ${platform}`);
  }
  spec.log?.info?.(`[install] downloading ${spec.name} for ${platform}`);
  await fs.mkdir(path.dirname(cached), { recursive: true });
  await downloadAndInstall(download, cached, binaryName, spec.name);
  spec.log?.info?.(`[install] installed ${spec.name} → ${cached}`);
  return cached;
}

async function downloadAndInstall(
  d: BinaryDownload,
  destBinary: string,
  binaryName: string,
  toolName: string,
): Promise<void> {
  const destDir = path.dirname(destBinary);
  const tmp = path.join(tmpdir(), `vibe-install-${toolName}-${process.pid}`);
  await fs.mkdir(tmp, { recursive: true });
  const archivePath = path.join(tmp, "artifact");

  try {
    const res = await fetch(d.url, { redirect: "follow" });
    if (!res.ok) throw new Error(`download failed (${res.status}) for ${d.url}`);
    if (!res.body) throw new Error(`empty response body for ${d.url}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(archivePath));

    if (d.sha256) {
      const actual = createHash("sha256")
        .update(await fs.readFile(archivePath))
        .digest("hex");
      if (actual !== d.sha256) {
        throw new Error(`sha256 mismatch for ${toolName}: expected ${d.sha256}, got ${actual}`);
      }
    }

    const archiveType =
      d.archive ??
      (d.url.endsWith(".tar.gz") || d.url.endsWith(".tgz")
        ? "tar.gz"
        : d.url.endsWith(".zip")
          ? "zip"
          : "raw");

    if (archiveType === "raw") {
      await fs.copyFile(archivePath, destBinary);
    } else {
      if (archiveType === "tar.gz") {
        await runProcess("tar", ["-xzf", archivePath, "-C", tmp]);
      } else {
        await extractZip(archivePath, tmp);
      }
      const inner = d.binaryWithinArchive ?? binaryName;
      await fs.copyFile(path.join(tmp, inner), destBinary);
    }

    if (process.platform !== "win32") {
      // chmod is a no-op on Windows (FS carries no POSIX exec bit).
      await fs.chmod(destBinary, 0o755);
    }
    void destDir;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

async function extractZip(archive: string, dest: string): Promise<void> {
  try {
    await runProcess("unzip", ["-q", "-o", archive, "-d", dest]);
    return;
  } catch (err) {
    // Windows rarely has `unzip`, but `tar.exe` ships with Windows 10+ and
    // handles .zip transparently.
    if (process.platform !== "win32") throw err;
    await runProcess("tar", ["-xf", archive, "-C", dest]);
  }
}

async function runProcess(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (b: Buffer) => (err += b.toString()));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}: ${err}`)),
    );
    child.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Cloudflared quick-tunnel — single shared source for the agent's pre-
// registration bootstrap tunnel AND the cloudflare provider. Neither hardcodes
// its own manifest/spawn, so the two can never drift.
// ---------------------------------------------------------------------------

const CLOUDFLARED_BASE = "https://github.com/cloudflare/cloudflared/releases/latest/download";

/**
 * Canonical cloudflared release-asset manifest. Imported by both the agent
 * bootstrap and the cloudflare provider — the ONE source of truth for the
 * binary the quick tunnel uses.
 */
export const CLOUDFLARED_DOWNLOADS: Partial<Record<ToolPlatform, BinaryDownload>> = {
  "linux-x64": { url: `${CLOUDFLARED_BASE}/cloudflared-linux-amd64`, archive: "raw" },
  "linux-arm64": { url: `${CLOUDFLARED_BASE}/cloudflared-linux-arm64`, archive: "raw" },
  "darwin-x64": {
    url: `${CLOUDFLARED_BASE}/cloudflared-darwin-amd64.tgz`,
    archive: "tar.gz",
    binaryWithinArchive: "cloudflared",
  },
  "darwin-arm64": {
    url: `${CLOUDFLARED_BASE}/cloudflared-darwin-arm64.tgz`,
    archive: "tar.gz",
    binaryWithinArchive: "cloudflared",
  },
  "win32-x64": { url: `${CLOUDFLARED_BASE}/cloudflared-windows-amd64.exe`, archive: "raw" },
  "win32-arm64": { url: `${CLOUDFLARED_BASE}/cloudflared-windows-arm64.exe`, archive: "raw" },
};

/** Quick-tunnel URL matcher (excludes the `api.` endpoint, not a tunnel host). */
const QUICK_TUNNEL_URL_RE = /(https:\/\/(?!api\.)[a-zA-Z0-9-]+\.trycloudflare\.com)/;

export interface QuickTunnel {
  /** The advertised public quick-tunnel URL. */
  url: string;
  /** The spawned cloudflared child (caller owns its lifecycle / handover). */
  child: ChildProcess;
}

/**
 * Open a minimal cloudflared quick tunnel to `http://127.0.0.1:<port>` and
 * resolve its public URL + child process. Installs cloudflared into the shared
 * tools cache if needed (so a later provider `resolveBinary("cloudflared")`
 * reuses it and ADOPTS this pid via `AGENT_TUNNEL_PID_*`). Storage-free and
 * never throws — returns null on any failure so the caller can degrade and
 * register once the provider starts. This is the agent's single deliberate
 * pre-registration exception; the provider owns the full tunnel lifecycle
 * post-registration.
 */
export async function openQuickTunnel(
  port: number,
  opts?: { log?: InstallLogger; timeoutMs?: number },
): Promise<QuickTunnel | null> {
  const log = opts?.log ?? {};
  let cmd: string;
  try {
    cmd = await installBinary({
      name: "cloudflared",
      downloads: CLOUDFLARED_DOWNLOADS,
      versionMatcher: "cloudflared version",
      log,
    });
  } catch (err) {
    log.warn?.(`quick-tunnel: could not obtain cloudflared: ${String(err)}`);
    return null;
  }

  let child: ChildProcess;
  try {
    // Explicit IPv4 127.0.0.1 (NOT localhost): dual-stack Windows resolves
    // localhost to ::1 first, and cloudflared then can't reach the IPv4 origin
    // (the trycloudflare URL returns HTTP 530 to every probe).
    child = spawn(cmd, ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    log.warn?.(`quick-tunnel: failed to spawn cloudflared: ${String(err)}`);
    return null;
  }

  const url = await new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (u: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(u);
    };
    const timer = setTimeout(() => {
      log.warn?.("quick-tunnel: cloudflared did not advertise a URL in time");
      finish(null);
    }, opts?.timeoutMs ?? 30_000);
    const scan = (chunk: Buffer): void => {
      const m = chunk.toString("utf8").match(QUICK_TUNNEL_URL_RE);
      if (m) {
        clearTimeout(timer);
        finish(m[0]);
      }
    };
    child.stdout?.on("data", scan);
    child.stderr?.on("data", scan);
    child.on("error", (err) => {
      clearTimeout(timer);
      log.warn?.(`quick-tunnel: cloudflared failed to spawn: ${String(err)}`);
      finish(null);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      log.warn?.(`quick-tunnel: cloudflared exited (code=${code})`);
      finish(null);
    });
  });

  if (!url) return null;
  return { url, child };
}
