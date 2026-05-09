/**
 * @vibecontrols/plugin-sdk/log
 *
 * `BoundLogger` binds the `source` field once so plugin code reads
 * `log.info("started")` instead of `logger.info("my-plugin", "started")`
 * at every call-site. No-op when the underlying logger is absent.
 */

import type { SdkLogger } from "../contract/index.js";

type Meta = Record<string, unknown>;

export class BoundLogger {
  constructor(
    private readonly logger: SdkLogger | undefined,
    private readonly source: string,
  ) {}

  info(message: string, meta?: Meta): void {
    this.logger?.info?.(this.source, message, meta);
  }

  warn(message: string, meta?: Meta): void {
    this.logger?.warn?.(this.source, message, meta);
  }

  error(message: string, meta?: Meta): void {
    this.logger?.error?.(this.source, message, meta);
  }

  debug(message: string, meta?: Meta): void {
    this.logger?.debug?.(this.source, message, meta);
  }
}
