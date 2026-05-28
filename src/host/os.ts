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

export interface OsAdapter {
  readonly platform?: SupportedPlatform;
  readonly isWSL?: boolean;
  readonly homeDir?: string;
  readonly tmpDir?: string;
  readonly pathSep?: string;
  readonly eol?: string;
  /** Executable suffix ("" on POSIX, ".exe" on Windows). */
  readonly executableSuffix?: string;
  /** Returns the absolute path to a command on PATH, or null when missing. */
  which?(cmd: string): string | null;
  isProcessAlive?(pid: number): boolean;
  killProcessTree?(pid: number, signal: NodeJS.Signals): boolean;
  listChildPids?(parentPid: number): number[];
  npmGlobalBin?(): string | null;
  bunGlobalBin?(): string | null;
  /** Quote a string for inclusion in a shell command on this OS. */
  shellQuote?(value: string): string;
  shellInvocation?(): { cmd: string; flag: string };
  /** Build a Bun.spawn argv that runs a shell pipeline through the native shell. */
  shellArgv?(script: string): string[];
  processGroupSpawnOpts?(): Record<string, unknown>;
}
