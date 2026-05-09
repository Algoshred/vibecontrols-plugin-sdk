/**
 * @vibecontrols/plugin-sdk — root barrel.
 *
 * Re-exports the most commonly-used helpers so a downstream plugin can:
 *
 *   import {
 *     createLifecycleHooks,
 *     TelemetryEmitter,
 *     BoundLogger,
 *     TypedStore,
 *     ConfigManager,
 *     gracefulKill,
 *     ProviderRegistry,
 *     AuditLogger,
 *     BroadcastEmitter,
 *     RoutesBuilder,
 *     redact,
 *     pickOutputMode,
 *     CliCommandBuilder,
 *     HttpClient,
 *     type VibePlugin,
 *     type HostServices,
 *   } from "@vibecontrols/plugin-sdk";
 *
 * Subpath imports (`@vibecontrols/plugin-sdk/cli`, etc.) remain available
 * for tighter tree-shaking on big plugins.
 */

// contract
export {
  FULL_TRUST_CAPS,
  type PluginCapabilities,
  type PluginTag,
  type Prerequisite,
  type PrerequisiteKind,
  type StorageProvider,
  type ServiceRegistry,
  type SdkLogger,
  type HostServices,
  type ProfileContext,
  type VibePlugin,
  type VibePluginFactory,
} from "./contract/index.js";

// lifecycle
export {
  createLifecycleHooks,
  type LifecycleSpec,
  type LifecycleHooks,
} from "./lifecycle/index.js";

// cli
export {
  runMultimode,
  pickOutputMode,
  maybePrintJson,
  redact,
  CliCommandBuilder,
  type OutputMode,
  type OutputFlags,
  type MultimodeOptions,
  type StatusCommandSpec,
} from "./cli/index.js";

// routes
export { RoutesBuilder, type ApiKeyResolver } from "./routes/index.js";

// telemetry
export { TelemetryEmitter } from "./telemetry/index.js";

// log
export { BoundLogger } from "./log/index.js";

// storage
export { TypedStore, NamespaceStore } from "./storage/index.js";

// config
export { ConfigManager } from "./config/index.js";

// subprocess
export { gracefulKill, isProcessAlive, findAvailablePort, sleep } from "./subprocess/index.js";

// http
export { HttpClient, type HttpClientOptions, type RequestOptions } from "./http/index.js";

// providers
export { ProviderRegistry, type CliContribution } from "./providers/index.js";

// audit / broadcast
export { AuditLogger } from "./audit/index.js";
export { BroadcastEmitter } from "./broadcast/index.js";
