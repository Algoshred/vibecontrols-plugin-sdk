/**
 * @vibecontrols/plugin-sdk/config
 *
 * `ConfigManager` resolves plugin config in this order:
 *   1. env var `VIBE_<PLUGIN>_<KEY>` (uppercase, hyphen→underscore)
 *   2. `hostServices.getConfig(<plugin>.<key>)` — plugin-section config.json
 *   3. caller-supplied default
 *
 * Type coercion helpers (`getInt`, `getBoolean`) parse the resolved string
 * with sane fallbacks; invalid values warn through the logger and return
 * the default.
 */

import type { HostServices, SdkLogger } from "../contract/index.js";

export class ConfigManager {
  private readonly envPrefix: string;

  constructor(
    private readonly pluginName: string,
    private readonly hostServices?: HostServices,
    private readonly logger?: SdkLogger,
  ) {
    this.envPrefix = `VIBE_${pluginName.toUpperCase().replace(/-/g, "_")}_`;
  }

  private envName(key: string): string {
    return `${this.envPrefix}${key.toUpperCase().replace(/-/g, "_")}`;
  }

  /**
   * Resolve a string config value. Returns `defaultValue` (or undefined)
   * when neither env nor host config has it.
   */
  async get(key: string, defaultValue?: string): Promise<string | undefined> {
    const fromEnv = process.env[this.envName(key)];
    if (fromEnv !== undefined && fromEnv !== "") return fromEnv;

    const fromHost = await this.hostServices?.getConfig?.(`${this.pluginName}.${key}`);
    if (fromHost !== undefined && fromHost !== "") return fromHost;

    return defaultValue;
  }

  /** Like `get`, but throw if the key resolves to undefined / empty. */
  async getRequired(key: string): Promise<string> {
    const v = await this.get(key);
    if (v === undefined || v === "") {
      throw new Error(
        `[${this.pluginName}] required config '${key}' is missing (env ${this.envName(key)} or host config '${this.pluginName}.${key}')`,
      );
    }
    return v;
  }

  async getInt(key: string, defaultValue?: number): Promise<number | undefined> {
    const raw = await this.get(key);
    if (raw === undefined) return defaultValue;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      this.logger?.warn?.(this.pluginName, "ConfigManager: invalid int", {
        key,
        raw,
      });
      return defaultValue;
    }
    return parsed;
  }

  async getBoolean(key: string, defaultValue?: boolean): Promise<boolean | undefined> {
    const raw = await this.get(key);
    if (raw === undefined) return defaultValue;
    const v = raw.toLowerCase();
    if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
    if (v === "false" || v === "0" || v === "no" || v === "off") return false;
    this.logger?.warn?.(this.pluginName, "ConfigManager: invalid bool", {
      key,
      raw,
    });
    return defaultValue;
  }
}
