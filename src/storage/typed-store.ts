/**
 * Typed wrappers over a `StorageProvider`.
 *
 * `TypedStore<T>` is a single-key handle: `get/set/delete` against a fixed
 * (namespace, key) pair, with JSON serialisation + corrupt-payload recovery.
 * `NamespaceStore` groups multiple typed handles under one namespace and
 * exposes raw get/set/delete for ad-hoc access.
 */

import type { SdkLogger, StorageProvider } from "../contract/index.js";

export class TypedStore<T> {
  constructor(
    private readonly storage: StorageProvider,
    private readonly namespace: string,
    private readonly key: string,
    private readonly logger?: SdkLogger,
    private readonly pluginName: string = "plugin",
  ) {}

  async get(): Promise<T | null> {
    const raw = await this.storage.get<unknown>(this.namespace, this.key);
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "string") {
      // Adapter already deserialised — trust it.
      return raw as T;
    }
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger?.error?.(this.pluginName, "TypedStore: corrupt JSON", {
        namespace: this.namespace,
        key: this.key,
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async set(value: T): Promise<void> {
    await this.storage.set(this.namespace, this.key, JSON.stringify(value));
  }

  async delete(): Promise<boolean> {
    return this.storage.delete(this.namespace, this.key);
  }
}

export class NamespaceStore {
  constructor(
    private readonly storage: StorageProvider,
    private readonly namespace: string,
    private readonly logger?: SdkLogger,
    private readonly pluginName: string = "plugin",
  ) {}

  /** Get a typed handle for `(this.namespace, key)`. */
  typed<T>(key: string): TypedStore<T> {
    return new TypedStore<T>(this.storage, this.namespace, key, this.logger, this.pluginName);
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    return this.storage.get<T>(this.namespace, key);
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    return this.storage.set<T>(this.namespace, key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.storage.delete(this.namespace, key);
  }
}
