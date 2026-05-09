import { describe, it, expect, mock } from "bun:test";

import { ProviderRegistry } from "../../src/providers/index.js";
import type { HostServices } from "../../src/contract/index.js";

describe("ProviderRegistry", () => {
  function makeHost(): {
    hs: HostServices;
    registerProvider: ReturnType<
      typeof mock<(type: string, provider: unknown, name: string) => void>
    >;
    getProvider: ReturnType<typeof mock<(type: string) => unknown>>;
    list: ReturnType<
      typeof mock<(t: string) => string[] | Array<{ pluginName: string; isDefault: boolean }>>
    >;
    addStatus: ReturnType<typeof mock<(s: unknown) => void>>;
    addDoctor: ReturnType<typeof mock<(c: unknown) => void>>;
  } {
    const registerProvider = mock((_type: string, _provider: unknown, _name: string) => undefined);
    const getProvider = mock((_type: string): unknown => undefined);
    const list = mock(
      (_t: string): string[] | Array<{ pluginName: string; isDefault: boolean }> => [
        { pluginName: "a", isDefault: true },
        { pluginName: "b", isDefault: false },
      ],
    );
    const addStatus = mock((_s: unknown) => undefined);
    const addDoctor = mock((_c: unknown) => undefined);
    const hs: HostServices = {
      serviceRegistry: {
        registerProvider,
        getProvider: getProvider as unknown as <T>(t: string) => T | undefined,
        listProvidersForType: list,
      },
      cliContributors: {
        addStatusSection: addStatus,
        addDoctorCheck: addDoctor,
      },
    };
    return { hs, registerProvider, getProvider, list, addStatus, addDoctor };
  }

  it("registerProvider routes through the registry with (type, provider, name)", () => {
    const { hs, registerProvider } = makeHost();
    const provider = { id: 1 };
    new ProviderRegistry(hs).registerProvider("tunnel", "cf", provider);
    expect(registerProvider).toHaveBeenCalledWith("tunnel", provider, "cf");
  });

  it("getProvider proxies to the registry's type-keyed lookup", () => {
    const { hs, getProvider } = makeHost();
    new ProviderRegistry(hs).getProvider("tunnel");
    expect(getProvider).toHaveBeenCalledWith("tunnel");
  });

  it("getProvider with (type, name) resolves via listProvidersForType + getProvider", () => {
    const { hs, getProvider } = makeHost();
    new ProviderRegistry(hs).getProvider("tunnel", "a");
    expect(getProvider).toHaveBeenCalledWith("tunnel");
  });

  it("getProvider with (type, name) returns undefined for unknown name", () => {
    const { hs, getProvider } = makeHost();
    expect(new ProviderRegistry(hs).getProvider("tunnel", "missing")).toBeUndefined();
    expect(getProvider).not.toHaveBeenCalled();
  });

  it("listProviders normalises both string[] and entry-object shapes", () => {
    const { hs, list } = makeHost();
    expect(new ProviderRegistry(hs).listProviders("tunnel")).toEqual(["a", "b"]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("withCliContribution forwards each section + check", () => {
    const { hs, addStatus, addDoctor } = makeHost();
    new ProviderRegistry(hs).withCliContribution({
      statusSections: [{ s: 1 }, { s: 2 }],
      doctorChecks: [{ d: 1 }],
    });
    expect(addStatus).toHaveBeenCalledTimes(2);
    expect(addDoctor).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when hostServices is absent", () => {
    const reg = new ProviderRegistry();
    expect(() => reg.registerProvider("t", "n", {})).not.toThrow();
    expect(reg.getProvider("t")).toBeUndefined();
    expect(reg.getProvider("t", "n")).toBeUndefined();
    expect(reg.listProviders("t")).toEqual([]);
    reg.withCliContribution({ statusSections: [{}], doctorChecks: [{}] });
  });

  it("getServiceRegistry returns undefined when absent", () => {
    expect(new ProviderRegistry().getServiceRegistry()).toBeUndefined();
  });
});
