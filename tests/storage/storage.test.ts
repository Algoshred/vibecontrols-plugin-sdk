import { describe, it, expect, mock } from "bun:test";

import { TypedStore, NamespaceStore } from "../../src/storage/index.js";
import type { StorageProvider } from "../../src/contract/index.js";

function fakeStorage(): { store: Map<string, unknown>; provider: StorageProvider } {
  const store = new Map<string, unknown>();
  const provider: StorageProvider = {
    async get<T>(ns: string, key: string): Promise<T | null> {
      return (store.get(`${ns}/${key}`) as T | undefined) ?? null;
    },
    async set<T>(ns: string, key: string, value: T): Promise<void> {
      store.set(`${ns}/${key}`, value);
    },
    async delete(ns: string, key: string): Promise<boolean> {
      return store.delete(`${ns}/${key}`);
    },
    async list(ns: string): Promise<string[]> {
      return [...store.keys()].filter((k) => k.startsWith(`${ns}/`));
    },
  };
  return { store, provider };
}

type LogFn = (source: string, message: string, meta?: Record<string, unknown>) => void;

describe("TypedStore", () => {
  it("round-trips JSON values", async () => {
    const { provider } = fakeStorage();
    const ts = new TypedStore<{ x: number }>(provider, "ns", "k");
    await ts.set({ x: 7 });
    expect(await ts.get()).toEqual({ x: 7 });
  });

  it("returns null when the key is absent", async () => {
    const { provider } = fakeStorage();
    expect(await new TypedStore(provider, "ns", "missing").get()).toBe(null);
  });

  it("returns null and logs when stored value is corrupt JSON", async () => {
    const { store, provider } = fakeStorage();
    store.set("ns/bad", "{not-json");
    const error = mock<LogFn>(() => undefined);
    const ts = new TypedStore(provider, "ns", "bad", { error }, "demo");
    expect(await ts.get()).toBe(null);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("demo", expect.any(String), expect.any(Object));
  });

  it("returns the raw value when adapter returned a non-string (already deserialised)", async () => {
    const { store, provider } = fakeStorage();
    store.set("ns/k", { already: "object" });
    const ts = new TypedStore<{ already: string }>(provider, "ns", "k");
    expect(await ts.get()).toEqual({ already: "object" });
  });

  it("delete returns the underlying boolean", async () => {
    const { provider } = fakeStorage();
    const ts = new TypedStore(provider, "ns", "k");
    await ts.set({ a: 1 });
    expect(await ts.delete()).toBe(true);
    expect(await ts.delete()).toBe(false);
  });
});

describe("NamespaceStore", () => {
  it("typed() returns a TypedStore bound to the namespace + key", async () => {
    const { provider } = fakeStorage();
    const ns = new NamespaceStore(provider, "ns");
    const t = ns.typed<{ a: number }>("k");
    await t.set({ a: 1 });
    expect(await t.get()).toEqual({ a: 1 });
  });

  it("exposes raw get/set/delete on the namespace", async () => {
    const { provider } = fakeStorage();
    const ns = new NamespaceStore(provider, "ns");
    await ns.set("k", { raw: true });
    expect(await ns.get<{ raw: boolean }>("k")).toEqual({ raw: true });
    expect(await ns.delete("k")).toBe(true);
  });
});
