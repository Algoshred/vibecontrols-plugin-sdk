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

import type { OsAdapter } from "../host/os.js";
import type { PathHelpers } from "../host/paths.js";

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

export type SupportedOS = "linux" | "darwin" | "win32";

export interface Prerequisite {
  name: string;
  kind: PrerequisiteKind;
  requiresSudo: boolean;
  version?: string;
  install?: string;
  /**
   * Human-readable rationale shown in the first-run consent prompt. Lives on
   * the plugin (the agent no longer keeps a hardcoded tool→reason table).
   */
  reason?: string;
}

/**
 * A provider plugin a META plugin routes to. META plugins declare these so the
 * agent never hardcodes provider package names: the agent installs the meta,
 * reads its `providers`, then installs the platform-appropriate default(s).
 */
export interface MetaProviderRef {
  /** Provider package name, e.g. "@vibecontrols/vibe-plugin-session-wezterm". */
  packageName: string;
  /** Short provider name (matches the provider plugin manifest `name`). */
  pluginName?: string;
  /**
   * Platforms on which this provider is the auto-installed DEFAULT for the
   * meta. Empty/undefined = opt-in only (never auto-installed at bootstrap).
   */
  defaultOn?: ReadonlyArray<SupportedOS>;
}

// ── Nuke lifecycle ─────────────────────────────────────────────────────

/**
 * Context passed to a plugin's `onNuke` hook. The agent calls `onNuke`
 * during `vibe nuke` while the daemon is still running — so the plugin's
 * in-memory state and registered provider instances are reachable — and
 * BEFORE the plugin package is uninstalled.
 */
export interface PluginNukeContext {
  /** Absolute per-agent data dir for the active profile, when known. */
  agentDir?: string;
  /** Report-only: enumerate what WOULD be reaped, change nothing. */
  dryRun: boolean;
}

/**
 * What a plugin reaped during `onNuke`, surfaced in the operator's nuke
 * output. Both fields are optional — a plugin that cleans nothing silently
 * may return nothing at all.
 */
export interface NukeResult {
  /** Short labels of processes/resources the plugin reaped. */
  reaped?: string[];
  /** Non-fatal notes (e.g. "left binary installed — shared/user-owned"). */
  notes?: string[];
}

// ── Storage Provider ───────────────────────────────────────────────────

export interface StorageProvider {
  get<T = unknown>(namespace: string, key: string): Promise<T | null>;
  set<T = unknown>(namespace: string, key: string, value: T): Promise<void>;
  delete(namespace: string, key: string): Promise<boolean>;
  list?(namespace: string): Promise<string[]>;
}

// ── Service Registry (minimal façade) ──────────────────────────────────

/**
 * Minimal façade over the agent's ServiceRegistry. Mirrors the agent's
 * actual signatures (vibecontrols-agent/src/core/service-registry.ts):
 *
 *   - `registerProvider(type, provider, pluginName)` — register a
 *     provider implementation under a provider type ("session", "tunnel",
 *     "ai"). The agent multiplexes providers per type and resolves a
 *     default via `getProvider<T>(type)`.
 *   - `getProvider<T>(type)` — return the default-resolved provider for
 *     the given type.
 *   - `registerService(pluginName, serviceName, service)` /
 *     `getService(pluginName, serviceName)` — namespaced bag for plugin-
 *     to-plugin services that aren't provider implementations.
 *
 * Every member is optional so SDK consumers tolerate partial or alt
 * hosts. The SDK's `ProviderRegistry` wrapper picks the right method.
 */
export interface ServiceRegistry {
  registerProvider?(type: string, provider: unknown, pluginName: string): void;
  getProvider?<T>(type: string): T | undefined;
  /**
   * Resolve a *specific* provider by `(type, pluginName)`. Mirrors the
   * agent's `serviceRegistry.getProviderByName<T>(type, pluginName)`
   * (`vibecontrols-agent/src/core/service-registry.ts:168`). Lets
   * `ProviderRegistry.getProvider(type, name)` actually return the
   * named provider instead of silently falling back to the type's
   * default — without this the session-manager's `/providers` route
   * returns the same default-provider object for every plugin name it
   * looks up.
   */
  getProviderByName?<T>(type: string, pluginName: string): T | undefined;
  registerService?(pluginName: string, serviceName: string, service: unknown): void;
  getService?<T>(pluginName: string, serviceName: string): T | undefined;
  listProvidersForType?(type: string): string[] | Array<{ pluginName: string; isDefault: boolean }>;
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
  /**
   * OS adapter — the agent injects an instance of its own OsAdapter at
   * boot (see vibecontrols-agent/src/core/os-adapter.ts). Plugins should
   * import the `OsAdapter` type from `@vibecontrols/plugin-sdk/host/os`
   * for type-only references and treat every field as optional.
   */
  os?: OsAdapter;
  /**
   * Cross-platform path helpers. Defaults to the pure-functions impl
   * exported from `@vibecontrols/plugin-sdk/host/paths` (`paths`); the
   * agent overrides only if it needs to override scope behaviour.
   */
  paths?: PathHelpers;
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
  /**
   * META plugins (session, tunnel, ai, storage, gitops) declare the provider
   * plugins they route to + per-platform defaults here. The thin agent reads
   * this to decide what to install at bootstrap, so it never hardcodes
   * provider package names or their prerequisites. Named `metaProviders` (not
   * `providers`) to avoid colliding with the agent's runtime provider-
   * registration descriptor of the same short name.
   */
  metaProviders?: ReadonlyArray<MetaProviderRef>;
  cliCommand?: string;
  apiPrefix?: string;
  createRoutes?: () => unknown;
  onServerStart?: (app: unknown, hostServices: HostServices) => void | Promise<void>;
  /**
   * Optional post-start hook — agent fires this AFTER `onServerStart` and
   * after the Elysia app is listening, so plugins can schedule background
   * work (queue processors, watchers) or register context providers.
   */
  onServerReady?: (app: unknown, hostServices: HostServices) => void | Promise<void>;
  onServerStop?: (hostServices: HostServices) => void | Promise<void>;
  /**
   * Nuke lifecycle. The agent invokes this on `vibe nuke` BEFORE the plugin
   * package is uninstalled, while the daemon is still running, so the plugin
   * reaps ITS OWN detached processes (a tunnel binary, a terminal server, …),
   * clears ITS OWN persisted state, and releases any other resource it created.
   *
   * This keeps every provider-specific name (process names, ports, binaries)
   * inside the plugin: the agent loops over installed plugins and calls this
   * uniform hook without referencing any provider or its prerequisites. The
   * agent isolates failures and continues, so a throw never aborts the nuke.
   * Honour `ctx.dryRun` (report, change nothing).
   */
  onNuke?: (
    hostServices: HostServices,
    ctx: PluginNukeContext,
  ) => void | NukeResult | Promise<void | NukeResult>;
  onCliSetup?: (program: unknown, hostServices: HostServices) => void;
}

export type VibePluginFactory = (ctx: ProfileContext) => VibePlugin;
