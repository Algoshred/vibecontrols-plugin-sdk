/**
 * @vibecontrols/plugin-sdk/lifecycle
 *
 * Collapses the boilerplate every plugin re-types around `onServerStart` /
 * `onServerStop`: emit a one-shot ready telemetry, optionally skip on a
 * platform list, dispatch user init/shutdown hooks.
 *
 * Cross-platform: pure JS, no fs / spawn.
 */

import type { HostServices } from "../contract/index.js";

export interface LifecycleSpec {
  /** Plugin name — used for telemetry tagging + skip log messages. */
  name: string;
  /** Optional init handler — called with hostServices on onServerStart. */
  onInit?: (hostServices: HostServices) => void | Promise<void>;
  /** Optional shutdown handler — called with hostServices on onServerStop. */
  onShutdown?: (hostServices: HostServices) => void | Promise<void>;
  /** Telemetry event name to auto-emit on init (after onInit returns). */
  telemetryEventName?: string;
  /** process.platform values the plugin does NOT support — early-return on match. */
  skipPlatforms?: NodeJS.Platform[];
}

export interface LifecycleHooks {
  onServerStart: (app: unknown, hostServices: HostServices) => Promise<void>;
  onServerStop: (hostServices: HostServices) => Promise<void>;
}

export function createLifecycleHooks(spec: LifecycleSpec): LifecycleHooks {
  const { name, onInit, onShutdown, telemetryEventName, skipPlatforms } = spec;

  return {
    onServerStart: async (_app: unknown, hostServices: HostServices) => {
      if (skipPlatforms && skipPlatforms.includes(process.platform)) {
        // Use stderr write directly — keeps lint clean of console.* and
        // matches Bun's preferred low-level write path for CLI notices.
        process.stderr.write(
          `[${name}] skipping init on unsupported platform '${process.platform}'\n`,
        );
        return;
      }
      if (onInit) {
        await onInit(hostServices);
      }
      if (telemetryEventName) {
        hostServices.telemetry?.emit(telemetryEventName, { plugin: name });
      }
    },
    onServerStop: async (hostServices: HostServices) => {
      if (onShutdown) {
        await onShutdown(hostServices);
      }
    },
  };
}
