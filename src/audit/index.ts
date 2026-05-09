/**
 * @vibecontrols/plugin-sdk/audit
 *
 * `AuditLogger` binds `source` to the plugin name and forwards events to
 * `hostServices.audit?.emit`. No-op when the host doesn't expose audit.
 */

import type { HostServices } from "../contract/index.js";

export class AuditLogger {
  constructor(
    private readonly source: string,
    private readonly hostServices?: HostServices,
  ) {}

  emit(event: string, payload?: Record<string, unknown>): void {
    this.hostServices?.audit?.emit(event, {
      source: this.source,
      ...(payload ?? {}),
    });
  }
}
