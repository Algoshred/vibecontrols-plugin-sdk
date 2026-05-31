/**
 * @vibecontrols/plugin-sdk/host/fs-safety
 *
 * Filesystem-jail helpers for plugins that touch user-supplied paths (e.g. a
 * session's working directory). `resolveSafePath` confines access to the
 * allowed roots (`VIBECONTROLS_ALLOWED_ROOTS` or cwd/home/tmp), rejects a
 * symlinked final component, and canonicalises via realpath so parent-symlink
 * escapes are caught. Ported verbatim from the agent's internal
 * `core/safe-paths.ts` so meta plugins owning host routes (session-manager)
 * no longer reach into agent internals. Pure `node:fs`/`os`/`path`.
 */
import {
  promises as fs,
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

export interface SafePathResult {
  path: string;
  realPath: string;
}

function positiveIntFromEnv(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const MAX_FILE_READ_BYTES = positiveIntFromEnv(
  "VIBECONTROLS_MAX_FILE_READ_BYTES",
  10 * 1024 * 1024,
);

export const MAX_DIRECTORY_ENTRIES = positiveIntFromEnv("VIBECONTROLS_MAX_DIRECTORY_ENTRIES", 2000);

const SENSITIVE_PATTERNS = [
  /(?:^|\/)\.env(?:\..*)?$/,
  /\.pem$/,
  /\.key$/,
  /(?:^|\/)id_rsa(?:$|\.)/,
  /(?:^|\/)\.ssh(?:\/|$)/,
  /(?:^|\/)\.git\/config$/,
  /(?:^|\/)\.npmrc$/,
];

const POSIX_PROTECTED_PATHS = ["/", "/etc", "/usr", "/bin", "/sbin", "/var", "/opt"];

// Windows path.resolve("/etc/passwd") yields "C:\\etc\\passwd" — POSIX prefixes
// never match. Use Windows-specific protected roots instead; case-insensitive
// drive letter handled below.
const WIN32_PROTECTED_PATHS = [
  "C:\\Windows",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  "C:\\ProgramData",
];

function protectedPathsForHost(): string[] {
  return process.platform === "win32" ? WIN32_PROTECTED_PATHS : POSIX_PROTECTED_PATHS;
}

function normalizeForCompare(p: string): string {
  return process.platform === "win32" ? p.toLowerCase() : p;
}

function configuredRoots(): string[] {
  const raw = process.env.VIBECONTROLS_ALLOWED_ROOTS;
  if (raw) {
    return raw
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [process.cwd(), os.homedir(), os.tmpdir()].filter(Boolean);
}

async function realpathIfExists(candidate: string): Promise<string | null> {
  try {
    return await fs.realpath(candidate);
  } catch {
    return null;
  }
}

async function allowedRootRealpaths(): Promise<string[]> {
  const roots: string[] = [];
  for (const root of configuredRoots()) {
    const resolved = path.resolve(root);
    const real = (await realpathIfExists(resolved)) ?? resolved;
    if (!roots.includes(real)) roots.push(real);
  }
  return roots;
}

function isWithinRoot(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function assertUnderAllowedRoot(realPath: string): Promise<void> {
  const roots = await allowedRootRealpaths();
  if (!roots.some((root) => isWithinRoot(realPath, root))) {
    throw new Error("Access denied: path is outside allowed directories");
  }
}

async function nearestExistingParent(candidate: string): Promise<string> {
  let current = path.dirname(candidate);
  while (current && current !== path.dirname(current)) {
    const real = await realpathIfExists(current);
    if (real) return real;
    current = path.dirname(current);
  }
  const rootReal = await realpathIfExists(current || path.parse(candidate).root);
  if (!rootReal) throw new Error("Path parent does not exist");
  return rootReal;
}

async function assertFinalIsNotSymlink(candidate: string): Promise<void> {
  // Only reject the FINAL component being a symlink — the user-controlled
  // bit. Walking every parent caused false positives on macOS where
  // /var → /private/var (and /tmp → /private/tmp) are intrinsic OS
  // symlinks that exist on every box. The realpath-vs-allowed-root
  // check below is what actually contains escapes via parent symlinks.
  const stat = await fs.lstat(path.resolve(candidate)).catch(() => null);
  if (stat?.isSymbolicLink()) {
    throw new Error("Access denied: symbolic links are not allowed");
  }
}

export function isSensitivePath(filePath: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function looksLikePosixProtected(raw: string): boolean {
  // On Windows, `path.resolve("/etc/passwd")` yields `C:\\etc\\passwd`,
  // so the resolved form never matches POSIX prefixes. We still want
  // to flag a caller who hands us a POSIX-style absolute path that
  // clearly references a system-protected root on a POSIX deployment.
  // Use forward-slash normalization on the RAW input independently of
  // the host's path semantics.
  if (!raw.startsWith("/")) return false;
  const fwd = raw.replace(/\\/g, "/").replace(/\/+/g, "/");
  return POSIX_PROTECTED_PATHS.some((p) => fwd === p || fwd.startsWith(p === "/" ? "/" : `${p}/`));
}

export function isProtectedPath(filePath: string): boolean {
  const normalized = path.resolve(filePath);
  // Try to canonicalize so macOS-style intrinsic symlinks
  // (`/var` → `/private/var`, `/tmp` → `/private/tmp`) collapse to a
  // single comparable form. realpath also walks parents, so even when
  // the file itself doesn't exist we still get the canonical prefix
  // for whichever ancestor does.
  const realIfExists = (() => {
    try {
      return realpathSync(normalized);
    } catch {
      return null;
    }
  })();
  const candidates = realIfExists ? [normalized, realIfExists] : [normalized];

  const tmpRaw = os.tmpdir();
  const homeRaw = os.homedir();
  const tmpReal = (() => {
    try {
      return realpathSync(tmpRaw);
    } catch {
      return tmpRaw;
    }
  })();
  const homeReal = (() => {
    try {
      return realpathSync(homeRaw);
    } catch {
      return homeRaw;
    }
  })();
  const sep = path.sep;
  const allowPrefixes = [tmpRaw, tmpReal, homeRaw, homeReal];

  // User-owned scratch space (tmpdir / homedir) is never "protected"
  // even when it nominally sits under a protected root like
  // `/var/folders/...` on macOS.
  for (const candidate of candidates) {
    const cmp = normalizeForCompare(candidate);
    if (
      allowPrefixes.some((prefix) => {
        const pCmp = normalizeForCompare(prefix);
        return cmp === pCmp || cmp.startsWith(pCmp + sep);
      })
    ) {
      return false;
    }
  }

  if (
    candidates.some((candidate) => {
      const cmp = normalizeForCompare(candidate);
      return protectedPathsForHost().some((protectedPath) => {
        const pCmp = normalizeForCompare(protectedPath);
        return cmp === pCmp || cmp.startsWith(pCmp + sep);
      });
    })
  ) {
    return true;
  }

  // Cross-platform safety net: a literal "/etc/passwd" on a Windows
  // host won't match `C:\\Windows`-style prefixes but should still be
  // treated as protected — the caller's intent is clearly to reach a
  // system-protected POSIX root.
  return looksLikePosixProtected(filePath);
}

export async function resolveSafePath(
  inputPath: string,
  options: { mustExist?: boolean; forWrite?: boolean } = {},
): Promise<SafePathResult> {
  if (!inputPath || inputPath.includes("\0")) {
    throw new Error("Invalid path");
  }

  const normalized = path.resolve(inputPath);
  await assertFinalIsNotSymlink(normalized);

  const realPath = await realpathIfExists(normalized);
  if (realPath) {
    await assertUnderAllowedRoot(realPath);
    return { path: normalized, realPath };
  }

  if (options.mustExist) {
    throw new Error("Path not found");
  }

  if (!options.forWrite) {
    await assertUnderAllowedRoot(normalized);
    return { path: normalized, realPath: normalized };
  }

  const parentReal = await nearestExistingParent(normalized);
  await assertUnderAllowedRoot(parentReal);
  return { path: normalized, realPath: normalized };
}

export async function assertReadableFileSize(filePath: string): Promise<void> {
  const stats = await fs.stat(filePath);
  if (stats.isFile() && stats.size > MAX_FILE_READ_BYTES) {
    throw new Error(
      `File is too large to read safely (${stats.size} bytes, max ${MAX_FILE_READ_BYTES})`,
    );
  }
}

/**
 * A8 — atomic, symlink-safe file read.
 *
 * Closes the resolve-then-open TOCTOU window in the prior implementation
 * (a symlink swap between `lstat` and `readFile` could redirect the read
 * to /etc/passwd or any other root-owned file).
 *
 * POSIX: `open(2)` with `O_NOFOLLOW` errors with `ELOOP` if the final
 * path component is a symlink, and we read via the resulting fd so the
 * file identity is pinned for the duration of the read.
 *
 * Windows: `O_NOFOLLOW` isn't honoured the same way — we lstat, reject
 * symlinks explicitly, then re-stat by realpath and confirm the same
 * inode before reading.
 */
export function safeReadFile(filePath: string): Buffer {
  if (process.platform === "win32") {
    const lstat = lstatSync(filePath);
    if (lstat.isSymbolicLink()) {
      throw new Error("Access denied: symbolic links are not allowed");
    }
    const real = realpathSync.native(filePath);
    const realStat = statSync(real);
    if (realStat.ino !== lstat.ino) {
      throw new Error("Access denied: path swapped under check");
    }
    if (realStat.size > MAX_FILE_READ_BYTES) {
      throw new Error(
        `File is too large to read safely (${realStat.size} bytes, max ${MAX_FILE_READ_BYTES})`,
      );
    }
    const fd = openSync(real, fsConstants.O_RDONLY);
    try {
      const buf = Buffer.allocUnsafe(realStat.size);
      let read = 0;
      while (read < realStat.size) {
        const n = readSync(fd, buf, read, realStat.size - read, read);
        if (n <= 0) break;
        read += n;
      }
      return read === realStat.size ? buf : buf.subarray(0, read);
    } finally {
      closeSync(fd);
    }
  }

  let fd: number;
  try {
    fd = openSync(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ELOOP" || code === "EMLINK") {
      throw new Error("Access denied: symbolic links are not allowed", {
        cause: err,
      });
    }
    throw err;
  }
  try {
    const stat = fstatSync(fd);
    if (stat.size > MAX_FILE_READ_BYTES) {
      throw new Error(
        `File is too large to read safely (${stat.size} bytes, max ${MAX_FILE_READ_BYTES})`,
      );
    }
    const buf = Buffer.allocUnsafe(stat.size);
    let read = 0;
    while (read < stat.size) {
      const n = readSync(fd, buf, read, stat.size - read, read);
      if (n <= 0) break;
      read += n;
    }
    return read === stat.size ? buf : buf.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

export async function listDirectoryCapped(filePath: string) {
  const dir = await fs.opendir(filePath);
  const entries = [];
  try {
    for await (const entry of dir) {
      entries.push(entry);
      if (entries.length > MAX_DIRECTORY_ENTRIES) {
        throw new Error(`Directory has too many entries (>${MAX_DIRECTORY_ENTRIES})`);
      }
    }
  } finally {
    // `for await...of dir` auto-closes the handle on Bun's fs.opendir, so
    // dir.close() may return `undefined` instead of a Promise. Guard the
    // .catch() chain so the cleanup itself never throws.
    const closeResult = dir.close?.();
    if (closeResult && typeof (closeResult as Promise<void>).catch === "function") {
      await (closeResult as Promise<void>).catch(() => undefined);
    }
  }
  return entries;
}
