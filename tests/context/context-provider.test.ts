import { describe, it, expect, beforeEach } from "bun:test";

import {
  __resetContextProvidersForTests,
  getContextProvider,
  listContextProviders,
  registerContextProvider,
  type ContextProvider,
} from "../../src/context/index.js";
import { ProviderRegistry } from "../../src/providers/index.js";

const make = (name: string, payload: Record<string, unknown> = {}): ContextProvider => ({
  name,
  async getContext() {
    return { pluginName: name, data: payload };
  },
});

describe("context provider registry", () => {
  beforeEach(() => {
    __resetContextProvidersForTests();
  });

  it("registers and retrieves a provider by name", () => {
    const p = make("ai", { hello: "world" });
    registerContextProvider(p);
    expect(getContextProvider("ai")).toBe(p);
  });

  it("lists providers in insertion order", () => {
    registerContextProvider(make("a"));
    registerContextProvider(make("b"));
    registerContextProvider(make("c"));
    expect(listContextProviders().map((p) => p.name)).toEqual(["a", "b", "c"]);
  });

  it("re-registering same name replaces the prior entry", () => {
    registerContextProvider(make("dup", { v: 1 }));
    registerContextProvider(make("dup", { v: 2 }));
    const list = listContextProviders();
    expect(list.length).toBe(1);
    const p = getContextProvider("dup");
    expect(p).toBeDefined();
  });

  it("throws on missing name", () => {
    expect(() =>
      registerContextProvider({
        name: "",
        async getContext() {
          return { pluginName: "", data: {} };
        },
      }),
    ).toThrow();
  });

  it("throws on missing getContext", () => {
    expect(() => registerContextProvider({ name: "bad" } as unknown as ContextProvider)).toThrow();
  });

  it("getContextProvider returns undefined for unknown name", () => {
    expect(getContextProvider("nope")).toBeUndefined();
  });
});

describe("ProviderRegistry context convenience methods", () => {
  beforeEach(() => {
    __resetContextProvidersForTests();
  });

  it("delegates to the standalone helpers", () => {
    const reg = new ProviderRegistry();
    reg.registerContextProvider(make("x"));
    reg.registerContextProvider(make("y"));
    expect(reg.listContextProviders().map((p) => p.name)).toEqual(["x", "y"]);
    expect(reg.getContextProvider("x")?.name).toBe("x");
    expect(reg.getContextProvider("missing")).toBeUndefined();
  });

  it("mirrors registrations into the host serviceRegistry when present", () => {
    const calls: Array<[string, unknown, string]> = [];
    const hostServices = {
      serviceRegistry: {
        registerProvider(type: string, provider: unknown, pluginName: string) {
          calls.push([type, provider, pluginName]);
        },
      },
    };
    const reg = new ProviderRegistry(hostServices);
    reg.registerContextProvider(make("ai"));
    expect(calls.length).toBe(1);
    expect(calls[0]?.[0]).toBe("context");
    expect(calls[0]?.[2]).toBe("ai");
  });
});
