/**
 * @vibecontrols/plugin-sdk/telemetry
 *
 * `TelemetryEmitter` auto-tags every event with the plugin name + version
 * + ISO timestamp before forwarding to `hostServices.telemetry?.emit`.
 * No-op when the host doesn't expose the telemetry surface (e.g. plugin
 * loaded without the `telemetry: true` capability).
 */

import type { HostServices } from "../contract/index.js";

export class TelemetryEmitter {
  constructor(
    private readonly pluginName: string,
    private readonly pluginVersion: string,
    private readonly hostServices?: HostServices,
  ) {}

  /** Emit `eventName` with auto-tagged plugin/version/timestamp. */
  emit(eventName: string, payload?: Record<string, unknown>): void {
    const target = this.hostServices?.telemetry;
    if (!target) return;
    target.emit(eventName, {
      plugin: this.pluginName,
      version: this.pluginVersion,
      timestamp: new Date().toISOString(),
      ...(payload ?? {}),
    });
  }

  /** `<pluginName>.ready` shorthand. */
  emitReady(context?: Record<string, unknown>): void {
    this.emit(`${this.pluginName}.ready`, context);
  }

  /** `<pluginName>.error` shorthand — extracts message from Error. */
  emitError(error: Error, context?: Record<string, unknown>): void {
    this.emit(`${this.pluginName}.error`, {
      message: error.message,
      ...(context ?? {}),
    });
  }

  /** Generic event-type emit (alias of emit). */
  emitEvent(type: string, payload?: Record<string, unknown>): void {
    this.emit(type, payload);
  }
}
