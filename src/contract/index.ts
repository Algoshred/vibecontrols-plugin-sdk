/**
 * @vibecontrols/plugin-sdk/contract
 *
 * The plugin contract v2 surface. Mirrors the agent's `HostServices` /
 * `ProfileContext` / `PluginCapabilities` types but every host-side field
 * is **optional** so a plugin author writing against the SDK can rely on
 * partial host implementations (tests, alt-hosts, future agents that drop
 * obsolete services). Plugins MUST optional-chain every host-side call.
 *
 * Source of truth (READ-ONLY mirror): vibecontrols-agent/src/core/plugin-system.ts:155-242,
 *                                    vibecontrols-agent/src/core/profile-context.ts:62-151,
 *                                    vibecontrols-agent/src/core/plugin-capabilities.ts.
 */

// ── Capabilities ───────────────────────────────────────────────────────

export interface PluginCapabilities {
  storage?: "none" | "read" | "rw";
  secrets?: "none" | "read" | "rw";
  gateway?: boolean;
  broadcast?: boolean;
  subprocess?: boolean;
  audit?: boolean;
  telemetry?: boolean;
  singletonOnly?: boolean;
  requiresIsolation?: boolean;
}

export const FULL_TRUST_CAPS: Required<PluginCapabilities> = {
  storage: "rw",
  secrets: "rw",
  gateway: true,
  broadcast: true,
  subprocess: true,
  audit: true,
  telemetry: true,
  singletonOnly: false,
  requiresIsolation: false,
};

// ── Tags & Prerequisites ───────────────────────────────────────────────

export type PluginTag = "backend" | "frontend" | "cli" | "provider" | "adapter" | "integration";

export type PrerequisiteKind = "binary" | "npm" | "pip" | "cargo" | "manual";

export interface Prerequisite {
  name: string;
  kind: PrerequisiteKind;
  requiresSudo: boolean;
  version?: string;
  install?: string;
}

// ── Storage Provider ───────────────────────────────────────────────────

export interface StorageProvider {
  get<T = unknown>(namespace: string, key: string): Promise<T | null>;
  set<T = unknown>(namespace: string, key: string, value: T): Promise<void>;
  delete(namespace: string, key: string): Promise<boolean>;
  list?(namespace: string): Promise<string[]>;
}

// ── Service Registry (minimal façade) ──────────────────────────────────

export interface ServiceRegistry {
  registerService<T>(type: string, name: string, instance: T): void;
  getService<T>(type: string, name: string): T | undefined;
  listProvidersForType?(type: string): string[];
}

// ── Logger surface ─────────────────────────────────────────────────────

export interface SdkLogger {
  debug?(source: string, message: string, metadata?: Record<string, unknown>): void;
  info?(source: string, message: string, metadata?: Record<string, unknown>): void;
  warn?(source: string, message: string, metadata?: Record<string, unknown>): void;
  error?(source: string, message: string, metadata?: Record<string, unknown>): void;
  setLevel?(level: string): void;
}

// ── Host Services ──────────────────────────────────────────────────────

/**
 * The host surface a plugin can rely on. Every member is optional —
 * downstream plugins must defensively use optional chaining or check
 * presence before invoking. Mirrors agent's `HostServices` (plugin-system.ts:155-242)
 * but type-loosened so SDK consumers don't need to depend on the agent.
 */
export interface HostServices {
  storage?: StorageProvider;
  logger?: SdkLogger;
  serviceRegistry?: ServiceRegistry;
  getProvider?<T = unknown>(type: string): T | undefined;
  getAgentBaseUrl?(): string;
  getAgentVersion?(): string;
  broadcast?(type: string, payload: unknown): void;
  workspaceQuery?<T = Record<string, unknown>>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<{ data?: T; errors?: Array<{ message: string }> }>;
  isGatewayConfigured?(): boolean;
  getAgentRecordId?(): Promise<string | null>;
  getWorkspaceId?(): Promise<string | null>;
  getConfig?(key: string): Promise<string | undefined>;
  getPluginRegistry?(): string;
  getDataDir?(): string;
  cliContributors?: {
    addStatusSection?(section: unknown): void;
    addDoctorCheck?(check: unknown): void;
  };
  audit?: { emit(event: string, payload?: Record<string, unknown>): void };
  telemetry?: { emit(event: string, payload?: Record<string, unknown>): void };
  os?: unknown;
}

// ── ProfileContext (minimal SDK shape) ─────────────────────────────────

export interface ProfileContext {
  name: string;
  dataDir: string;
  logger?: SdkLogger;
  audit?: { emit(source: string, event: string, payload?: Record<string, unknown>): void };
  telemetry?: { emit(event: string, payload?: Record<string, unknown>): void };
}

// ── Plugin Contract ────────────────────────────────────────────────────

export interface VibePlugin {
  name: string;
  version: string;
  description?: string;
  tags?: PluginTag[];
  capabilities?: PluginCapabilities;
  prerequisites?: Prerequisite[];
  cliCommand?: string;
  apiPrefix?: string;
  createRoutes?: () => unknown;
  onServerStart?: (app: unknown, hostServices: HostServices) => void | Promise<void>;
  onServerStop?: (hostServices: HostServices) => void | Promise<void>;
  onCliSetup?: (program: unknown, hostServices: HostServices) => void;
}

export type VibePluginFactory = (ctx: ProfileContext) => VibePlugin;
