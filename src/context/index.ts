/**
 * @vibecontrols/plugin-sdk/context
 *
 * Lets a plugin contribute a structured snapshot of its runtime state to the
 * agent's combined context endpoint. The agent calls every registered provider
 * in parallel, applies a per-provider timeout, and serves the merged result
 * over `/api/profiles/:profile/context*`.
 *
 * Registration is held in a module-scoped map so multiple plugins can register
 * distinct providers (the host's `ServiceRegistry.getProvider(type)` returns
 * only the default-resolved provider per type, so we can't use it for a
 * name-keyed lookup). All providers are still mirrored into the host registry
 * for discoverability via `listProvidersForType("context")`.
 *
 * Contract:
 *   - One provider per `name`; re-registering replaces.
 *   - `getContext` must be safe to call concurrently and idempotent. It should
 *     respond within `timeoutMs` (defaults to 2000ms in the agent's aggregator).
 *   - The returned `data` is opaque to the agent — plugins decide shape.
 *   - Consumer plugins MUST redact credentials before returning. The aggregator
 *     does not sanitise contributions.
 */
import type { HostServices } from "../contract/index.js";

/** Single context contribution returned by a plugin. */
export interface ContextContribution {
  /** Stable identifier of the contributing plugin. */
  pluginName: string;
  /** Free-form description so LLMs / humans understand the section. */
  description?: string;
  /** Optional ISO-8601 timestamp. Agent fills `generatedAt` if absent. */
  generatedAt?: string;
  /** Structured payload. Shape is plugin-defined. */
  data: Record<string, unknown>;
}

/** Optional args passed by the agent to scope a contribution. */
export interface ContextRequest {
  /** Profile name the agent is serving. */
  profile: string;
  /** Vibe id, if the caller scoped the request. */
  vibeId?: string;
}

/** Provider plugins register one of these per provider name. */
export interface ContextProvider {
  /** Stable identifier — must be unique across the agent process. */
  name: string;
  /** Max time the aggregator waits before recording a timeout. Defaults to 2000ms in the agent. */
  timeoutMs?: number;
  getContext(req: ContextRequest): Promise<ContextContribution>;
}

/** Provider-type tag used in the shared host service registry. */
export const CONTEXT_PROVIDER_TYPE = "context";

/**
 * Module-scoped registry. Lives for the lifetime of the host process and is
 * shared across every plugin importing this SDK (modules are cached per
 * package path in Node/Bun).
 */
const contextProviders = new Map<string, ContextProvider>();

/** Register a context provider. Re-registering with the same name replaces. */
export function registerContextProvider(
  provider: ContextProvider,
  hostServices?: HostServices,
): void {
  if (!provider || typeof provider.name !== "string" || provider.name.length === 0) {
    throw new Error("ContextProvider.name is required");
  }
  if (typeof provider.getContext !== "function") {
    throw new Error("ContextProvider.getContext must be a function");
  }
  contextProviders.set(provider.name, provider);
  hostServices?.serviceRegistry?.registerProvider?.(CONTEXT_PROVIDER_TYPE, provider, provider.name);
}

/** Returns every registered context provider, in insertion order. */
export function listContextProviders(): ContextProvider[] {
  return Array.from(contextProviders.values());
}

/** Resolve a context provider by name, or `undefined` if not registered. */
export function getContextProvider(name: string): ContextProvider | undefined {
  return contextProviders.get(name);
}

/** Test helper — wipe the registry. Not exported from the SDK barrel. */
export function __resetContextProvidersForTests(): void {
  contextProviders.clear();
}
