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
import { spawn } from "node:child_process";
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
