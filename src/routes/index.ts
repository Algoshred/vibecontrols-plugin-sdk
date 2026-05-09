/**
 * @vibecontrols/plugin-sdk/routes
 *
 * RoutesBuilder — fluent wrapper around an Elysia instance with the four
 * concerns every plugin reimplements: prefix, API-key auth, error handler,
 * request logging.
 *
 * Elysia is a peer dependency — both type and value come from the consumer.
 * If a plugin doesn't ship HTTP routes it never imports this module so
 * elysia stays an optional peer.
 */

import { Elysia, type Elysia as ElysiaType } from "elysia";

import type { HostServices } from "../contract/index.js";

export type ApiKeyResolver = () => string | Promise<string>;

export class RoutesBuilder {
  private prefix?: string;
  private apiKeyResolver?: ApiKeyResolver;
  private errorHandlerEnabled = false;
  private loggingEnabled = false;

  constructor(
    private readonly pluginName: string,
    private readonly hostServices?: HostServices,
  ) {}

  withPrefix(prefix: string): this {
    this.prefix = prefix;
    return this;
  }

  withAuth(getApiKey: ApiKeyResolver): this {
    this.apiKeyResolver = getApiKey;
    return this;
  }

  withErrorHandler(): this {
    this.errorHandlerEnabled = true;
    return this;
  }

  withLogging(): this {
    this.loggingEnabled = true;
    return this;
  }

  /**
   * Build the configured Elysia instance. Plugins typically call
   * `.derive` / `.get` / `.post` on the result before returning it from
   * `createRoutes()`.
   */
  build(): ElysiaType {
    const opts = this.prefix ? { prefix: this.prefix } : undefined;
    const app = new Elysia(opts);

    if (this.apiKeyResolver) {
      const resolver = this.apiKeyResolver;
      app.onBeforeHandle(async ({ request, set }) => {
        const supplied = request.headers.get("x-api-key");
        const expected = await resolver();
        if (!supplied || supplied !== expected) {
          set.status = 401;
          return { error: "unauthorized" };
        }
        return;
      });
    }

    if (this.errorHandlerEnabled) {
      const pluginName = this.pluginName;
      const logger = this.hostServices?.logger;
      app.onError(({ error, set }) => {
        const message = error instanceof Error ? error.message : String(error);
        logger?.error?.(pluginName, "route error", { message });
        set.status = 500;
        return { error: message };
      });
    }

    if (this.loggingEnabled) {
      const pluginName = this.pluginName;
      const logger = this.hostServices?.logger;
      app.onRequest(({ request }) => {
        logger?.debug?.(pluginName, "request", {
          method: request.method,
          url: request.url,
        });
      });
    }

    // Elysia's strongly-typed prefix generic flips on prefix presence; the
    // SDK's return type is the default-prefix variant for ergonomics, so
    // cast through unknown to align — runtime shape is identical.
    return app as unknown as ElysiaType;
  }
}
