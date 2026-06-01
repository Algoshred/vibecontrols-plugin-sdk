/**
 * @vibecontrols/plugin-sdk/host/os
 *
 * OS adapter contract — the minimum surface a plugin can rely on for
 * platform-specific operations. The agent supplies a richer implementation
 * (vibecontrols-agent/src/core/os-adapter.ts); this SDK type is intentionally
 * narrow so plugins type-check against the publicly committed contract and
 * the agent stays free to add private members.
 *
 * Every method is optional so plugins must defensively use optional chaining
 * or check presence before invoking — same defensive pattern the rest of
 * HostServices follows.
 */

export type SupportedPlatform = "linux" | "darwin" | "win32";

/** Human-readable OS label for operator-facing messages. */
export type PlatformLabel = "macOS" | "Windows" | "Linux" | "WSL";

export interface OsAdapter {
  readonly platform?: SupportedPlatform;
  readonly isWSL?: boolean;
  readonly homeDir?: string;
  readonly tmpDir?: string;
  readonly pathSep?: string;
  readonly eol?: string;
  /** Executable suffix ("" on POSIX, ".exe" on Windows). */
  readonly executableSuffix?: string;
  /**
   * Returns the absolute path to a command on PATH, or null when missing.
   * The agent impl resolves against the LIVE `process.env.PATH` (not the
   * startup snapshot Bun.which captures), so a tool installed mid-run is
   * found. Pass `{ refreshPath: true }` to force re-reading the live PATH.
   */
  which?(cmd: string, opts?: { refreshPath?: boolean }): string | null;
  isProcessAlive?(pid: number): boolean;
  killProcessTree?(pid: number, signal: NodeJS.Signals): boolean;
  listChildPids?(parentPid: number): number[];
  /** npm global *bin* dir (`.../bin`) — where global executables land. */
  npmGlobalBin?(): string | null;
  /** npm global *root* dir (output of `npm root -g`) — where global packages install. */
  npmGlobalRoot?(): string | null;
  bunGlobalBin?(): string | null;
  /** Quote a string for inclusion in a shell command on this OS. */
  shellQuote?(value: string): string;
  shellInvocation?(): { cmd: string; flag: string };
  /** Build a Bun.spawn argv that runs a shell pipeline through the native shell. */
  shellArgv?(script: string): string[];
  processGroupSpawnOpts?(): Record<string, unknown>;
  /** Human-readable OS label ("macOS"/"Windows"/"Linux"/"WSL") for messages. */
  platformLabel?(): PlatformLabel;
}

/**
 * Pure helper: human-readable OS label. Use in operator-facing strings instead
 * of inlining `process.platform === "win32" ? "Windows" : ...` ternaries.
 */
export function platformLabel(p: NodeJS.Platform = process.platform, isWSL = false): PlatformLabel {
  if (p === "darwin") return "macOS";
  if (p === "win32") return "Windows";
  return isWSL ? "WSL" : "Linux";
}

/**
 * Pure helper: pick the platform-appropriate manual-install instruction from a
 * per-OS recipe map. Replaces the per-plugin `ttydManualInstall()` /
 * `tmuxManualInstall()` platform switches that were copy-pasted across plugins.
 * Falls back to the `linux` recipe when the current platform has no entry.
 */
export function manualInstallHint(
  recipes: Partial<Record<SupportedPlatform, string>>,
  p: NodeJS.Platform = process.platform,
): string {
  const key = (p === "darwin" || p === "win32" ? p : "linux") as SupportedPlatform;
  return recipes[key] ?? recipes.linux ?? "";
}
