/**
 * @vibecontrols/plugin-sdk/providers
 *
 * Thin façade over `hostServices.serviceRegistry` — provider plugins call
 * `register` and consumer plugins call `get` / `list`. Every method is a
 * graceful no-op when the host has no registry.
 */

import type { HostServices, ServiceRegistry } from "../contract/index.js";
import {
  type ContextProvider,
  registerContextProvider as registerContextProviderImpl,
  listContextProviders as listContextProvidersImpl,
  getContextProvider as getContextProviderImpl,
} from "../context/index.js";

export interface CliContribution {
  statusSections?: unknown[];
  doctorChecks?: unknown[];
}

export class ProviderRegistry {
  constructor(private readonly hostServices?: HostServices) {}

  /**
   * Register a context provider. Convenience wrapper for the standalone
   * `registerContextProvider` helper exported from `@vibecontrols/plugin-sdk/context`.
   */
  registerContextProvider(provider: ContextProvider): void {
    registerContextProviderImpl(provider, this.hostServices);
  }

  /** List every registered context provider. */
  listContextProviders(): ContextProvider[] {
    return listContextProvidersImpl();
  }

  /** Resolve a context provider by name. */
  getContextProvider(name: string): ContextProvider | undefined {
    return getContextProviderImpl(name);
  }

  getServiceRegistry(): ServiceRegistry | undefined {
    return this.hostServices?.serviceRegistry;
  }

  /**
   * Register a provider implementation (session / tunnel / ai) on the
   * agent's per-type provider registry. Maps onto the agent's
   * `registerProvider(type, provider, pluginName)` shape.
   */
  registerProvider<T>(type: string, name: string, provider: T): void {
    this.hostServices?.serviceRegistry?.registerProvider?.(type, provider, name);
  }

  /**
   * Resolve a provider for a given type. With one argument, returns the
   * default-resolved provider (matching the agent's
   * `serviceRegistry.getProvider<T>(type)` shape). With two arguments,
   * resolves a *specific* provider by `(type, name)` via the agent's
   * `getProviderByName` — which is what consumers like session-manager
   * actually want when iterating registered providers.
   *
   * Previously the two-argument form bug-existed (BOFF-2620): it
   * verified the name was present in `listProvidersForType` but then
   * returned the type's *default* provider regardless, so every
   * per-name lookup yielded the same object. We now call
   * `getProviderByName` when the host exposes it, and only fall back
   * to the default-resolved getter for hosts that pre-date that
   * method.
   */
  getProvider<T>(type: string, name?: string): T | undefined {
    const reg = this.hostServices?.serviceRegistry;
    if (!reg) return undefined;
    if (name === undefined) return reg.getProvider?.<T>(type);
    if (reg.getProviderByName) return reg.getProviderByName<T>(type, name);
    // Legacy fallback for hosts without `getProviderByName`: verify
    // presence in the list and return the default. Honest about the
    // limitation — we cannot resolve by name on these hosts.
    if (!reg.listProvidersForType) return undefined;
    const entries = reg.listProvidersForType(type) ?? [];
    const present = entries.some((entry) =>
      typeof entry === "string" ? entry === name : entry.pluginName === name,
    );
    if (!present) return undefined;
    return reg.getProvider?.<T>(type);
  }

  listProviders(type: string): string[] {
    const reg = this.hostServices?.serviceRegistry;
    const entries = reg?.listProvidersForType?.(type) ?? [];
    return entries.map((entry) => (typeof entry === "string" ? entry : entry.pluginName));
  }

  /**
   * Register a CLI contribution bundle (status sections + doctor checks).
   * No-op when the host doesn't expose `cliContributors`.
   */
  withCliContribution(contribution: CliContribution): void {
    const contributors = this.hostServices?.cliContributors;
    if (!contributors) return;
    for (const section of contribution.statusSections ?? []) {
      contributors.addStatusSection?.(section);
    }
    for (const check of contribution.doctorChecks ?? []) {
      contributors.addDoctorCheck?.(check);
    }
  }
}
