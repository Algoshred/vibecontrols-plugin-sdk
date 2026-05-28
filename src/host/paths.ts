/**
 * @vibecontrols/plugin-sdk/host/paths
 *
 * Cross-platform path helpers. Plugins that need an XDG-style directory or
 * a platform-correct executable name should import from here rather than
 * hand-rolling `process.platform === "win32" ? "...exe" : "..."` ternaries
 * or `process.env.HOME ?? "."` fallbacks (the latter is broken on Windows,
 * where USERPROFILE is the canonical variable).
 *
 * The exports are pure functions backed by `node:os` + `node:path`, so they
 * work without any host wiring. The agent supplies HostServices.paths as a
 * field for forward-compat, but plugins can also import the default `paths`
 * const directly when the host hasn't injected one.
 */

import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";

export interface PathHelpers {
  /** OS-correct user home (`HOME` on POSIX, `USERPROFILE` on Windows). */
  homeDir(): string;
  /**
   * OS-correct per-app config directory:
   *   linux:  `$XDG_CONFIG_HOME/<scope>` or `~/.config/<scope>`
   *   darwin: `~/Library/Application Support/<scope>`
   *   win32:  `%APPDATA%\<scope>`
   */
  configDir(scope: string): string;
  /** Same shape as configDir but for cache (`~/.cache`, `~/Library/Caches`, `%LOCALAPPDATA%\<scope>\Cache`). */
  cacheDir(scope: string): string;
  /** Same shape as configDir but for state/data (`~/.local/share`, `~/Library/Application Support`, `%LOCALAPPDATA%\<scope>`). */
  dataDir(scope: string): string;
  /** OS-correct temp dir (`/tmp`, `%TEMP%` on Windows). */
  tmpDir(): string;
  /** Returns the executable name with `.exe` appended on Windows, unchanged elsewhere. */
  exeName(base: string): string;
}

const HOME = (): string => homedir();

export const paths: PathHelpers = {
  homeDir: HOME,
  configDir(scope: string): string {
    const p = platform();
    if (p === "win32") {
      return join(process.env.APPDATA ?? join(HOME(), "AppData", "Roaming"), scope);
    }
    if (p === "darwin") {
      return join(HOME(), "Library", "Application Support", scope);
    }
    return join(process.env.XDG_CONFIG_HOME ?? join(HOME(), ".config"), scope);
  },
  cacheDir(scope: string): string {
    const p = platform();
    if (p === "win32") {
      return join(process.env.LOCALAPPDATA ?? join(HOME(), "AppData", "Local"), scope, "Cache");
    }
    if (p === "darwin") {
      return join(HOME(), "Library", "Caches", scope);
    }
    return join(process.env.XDG_CACHE_HOME ?? join(HOME(), ".cache"), scope);
  },
  dataDir(scope: string): string {
    const p = platform();
    if (p === "win32") {
      return join(process.env.LOCALAPPDATA ?? join(HOME(), "AppData", "Local"), scope);
    }
    if (p === "darwin") {
      return join(HOME(), "Library", "Application Support", scope);
    }
    return join(process.env.XDG_DATA_HOME ?? join(HOME(), ".local", "share"), scope);
  },
  tmpDir(): string {
    return tmpdir();
  },
  exeName(base: string): string {
    return platform() === "win32" ? `${base}.exe` : base;
  },
};
