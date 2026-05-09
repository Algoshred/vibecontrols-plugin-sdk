import { describe, it, expect, mock } from "bun:test";

import { ProviderRegistry } from "../../src/providers/index.js";
import type { HostServices } from "../../src/contract/index.js";

describe("ProviderRegistry", () => {
  function makeHost(): {
    hs: HostServices;
    register: ReturnType<typeof mock<(t: string, n: string, i: unknown) => void>>;
    get: ReturnType<typeof mock<(t: string, n: string) => unknown>>;
    list: ReturnType<typeof mock<(t: string) => string[]>>;
    addStatus: ReturnType<typeof mock<(s: unknown) => void>>;
    addDoctor: ReturnType<typeof mock<(c: unknown) => void>>;
  } {
    const register = mock((_t: string, _n: string, _i: unknown) => undefined);
    const get = mock((_t: string, _n: string): unknown => undefined);
    const list = mock((_t: string): string[] => ["a", "b"]);
    const addStatus = mock((_s: unknown) => undefined);
    const addDoctor = mock((_c: unknown) => undefined);
    const hs: HostServices = {
      serviceRegistry: {
        registerService: register,
        // ServiceRegistry.getService is generic over T at the contract level;
        // the mock returns `unknown` and we cast to the call-site shape.
        getService: get as unknown as <T>(t: string, n: string) => T | undefined,
        listProvidersForType: list,
      },
      cliContributors: {
        addStatusSection: addStatus,
        addDoctorCheck: addDoctor,
      },
    };
    return { hs, register, get, list, addStatus, addDoctor };
  }

  it("registerProvider routes through the registry", () => {
    const { hs, register } = makeHost();
    new ProviderRegistry(hs).registerProvider("tunnel", "cf", { id: 1 });
    expect(register).toHaveBeenCalledWith("tunnel", "cf", { id: 1 });
  });

  it("getProvider proxies to getService", () => {
    const { hs, get } = makeHost();
    new ProviderRegistry(hs).getProvider("tunnel", "cf");
    expect(get).toHaveBeenCalledWith("tunnel", "cf");
  });

  it("listProviders returns the registry's list", () => {
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
    expect(reg.getProvider("t", "n")).toBeUndefined();
    expect(reg.listProviders("t")).toEqual([]);
    reg.withCliContribution({ statusSections: [{}], doctorChecks: [{}] });
  });

  it("getServiceRegistry returns undefined when absent", () => {
    expect(new ProviderRegistry().getServiceRegistry()).toBeUndefined();
  });
});
