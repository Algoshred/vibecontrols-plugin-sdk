/**
 * Mock factories for unit-testing plugins built on the SDK.
 *
 * The mocks return concrete `HostServices` / `ProfileContext` shapes with
 * every function backed by Bun's built-in `mock()`. Consumers must run
 * tests with `bun test` (the SDK is Bun-native by design).
 */

import { mock } from "bun:test";

import type {
  HostServices,
  ProfileContext,
  ServiceRegistry,
  StorageProvider,
} from "../contract/index.js";

export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/**
 * Build a fully-stubbed `HostServices`. Every function is a Bun `mock()`,
 * so tests can assert call counts / args. Pass `overrides` to replace
 * specific fields (e.g. `{ telemetry: { emit: customMock } }`).
 */
export function createMockHostServices(overrides: DeepPartial<HostServices> = {}): HostServices {
  const storage: StorageProvider = {
    get: mock(async () => null),
    set: mock(async () => undefined),
    delete: mock(async () => true),
    list: mock(async () => []),
  };

  const serviceRegistry: ServiceRegistry = {
    registerProvider: mock(() => undefined),
    getProvider: mock(() => undefined),
    registerService: mock(() => undefined),
    getService: mock(() => undefined),
    listProvidersForType: mock(() => []),
  };

  const base: HostServices = {
    storage,
    logger: {
      debug: mock(() => undefined),
      info: mock(() => undefined),
      warn: mock(() => undefined),
      error: mock(() => undefined),
      setLevel: mock(() => undefined),
    },
    serviceRegistry,
    getProvider: mock(() => undefined),
    getAgentBaseUrl: mock(() => "http://localhost:3005"),
    getAgentVersion: mock(() => "test"),
    broadcast: mock(() => undefined),
    // workspaceQuery's runtime contract is generic over T; the mock returns
    // a permissive empty data shape that satisfies any caller-chosen T at
    // runtime. The cast is the standard pattern for representing a generic
    // method via a non-generic mock.
    workspaceQuery: mock(async () => ({ data: {} })) as unknown as HostServices["workspaceQuery"],
    isGatewayConfigured: mock(() => false),
    getAgentRecordId: mock(async () => null),
    getWorkspaceId: mock(async () => null),
    getConfig: mock(async () => undefined),
    getPluginRegistry: mock(() => "https://registry.npmjs.org/"),
    getDataDir: mock(() => "/tmp/sdk-test"),
    cliContributors: {
      addStatusSection: mock(() => undefined),
      addDoctorCheck: mock(() => undefined),
    },
    audit: { emit: mock(() => undefined) },
    telemetry: { emit: mock(() => undefined) },
    os: undefined,
  };

  return mergeDeep(base, overrides) as HostServices;
}

export function createMockProfileContext(
  overrides: DeepPartial<ProfileContext> = {},
): ProfileContext {
  const base: ProfileContext = {
    name: "test-profile",
    dataDir: "/tmp/sdk-test/profile",
    logger: {
      debug: mock(() => undefined),
      info: mock(() => undefined),
      warn: mock(() => undefined),
      error: mock(() => undefined),
    },
    audit: { emit: mock(() => undefined) },
    telemetry: { emit: mock(() => undefined) },
  };
  return mergeDeep(base, overrides) as ProfileContext;
}

function mergeDeep<T>(base: T, overrides: DeepPartial<T>): T {
  if (overrides === undefined || overrides === null) return base;
  if (typeof overrides !== "object" || Array.isArray(overrides)) {
    return overrides as T;
  }
  if (typeof base !== "object" || base === null || Array.isArray(base)) {
    return overrides as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(overrides as Record<string, unknown>)) {
    const baseVal = (base as Record<string, unknown>)[k];
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      baseVal !== null &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      out[k] = mergeDeep(baseVal, v as DeepPartial<typeof baseVal>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}
