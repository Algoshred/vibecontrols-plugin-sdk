/**
 * @vibecontrols/plugin-sdk/broadcast
 *
 * Type-safe wrapper over `hostServices.broadcast` — no-op when absent.
 */

import type { HostServices } from "../contract/index.js";

export class BroadcastEmitter {
  constructor(private readonly hostServices?: HostServices) {}

  broadcast<T>(type: string, payload: T): void {
    this.hostServices?.broadcast?.(type, payload);
  }
}
