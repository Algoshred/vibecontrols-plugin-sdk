/**
 * @vibecontrols/plugin-sdk/providers
 *
 * Thin façade over `hostServices.serviceRegistry` — provider plugins call
 * `register` and consumer plugins call `get` / `list`. Every method is a
 * graceful no-op when the host has no registry.
 */

import type {
  HostServices,
  MetaProviderRef,
  ServiceRegistry,
  SupportedOS,
} from "../contract/index.js";
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

/** Map `process.platform` onto the SDK's `SupportedOS` union (defaults to linux). */
export function currentSupportedOS(p: NodeJS.Platform = process.platform): SupportedOS {
  if (p === "darwin") return "darwin";
  if (p === "win32") return "win32";
  return "linux";
}

/**
 * The single, shared META→provider provisioning sequence. A META plugin calls
 * this from its `provisionProviders` hook with its own `metaProviders`; the
 * agent injects `host.plugins` (the provisioning façade). For each provider
 * that is a platform default (`defaultOn` includes the current OS) this runs:
 *
 *   install → loadProvider → runPrereqs → electDefault
 *
 * Opt-in providers (no `defaultOn` match) are skipped — they install on demand.
 * Honours `host.plugins.skipInstall()` (operator `--no-install-deps`): providers
 * are still loaded + elected, but no package/binary install is attempted.
 * No-ops cleanly when `host.plugins` is absent (older agent / untrusted plugin).
 * Best-effort and isolated per provider — one provider failing never aborts the
 * others, so a META degrades gracefully rather than blocking boot.
 */
export async function provisionMetaProviders(
  host: HostServices,
  metaProviders: ReadonlyArray<MetaProviderRef> | undefined,
  platform: SupportedOS = currentSupportedOS(),
): Promise<void> {
  const plugins = host.plugins;
  if (!plugins || !metaProviders?.length) return;
  const skip = plugins.skipInstall?.() ?? false;
  for (const ref of metaProviders) {
    if (!ref.defaultOn?.includes(platform)) continue; // opt-in providers install on demand
    try {
      if (!skip) await plugins.install?.(ref.packageName, { refreshLatest: true });
      await plugins.loadProvider?.(ref.packageName);
      await plugins.runPrereqs?.(ref.packageName, { skipInstall: skip });
      if (ref.providerType && ref.pluginName) {
        await plugins.electDefault?.(ref.providerType, ref.pluginName);
      }
    } catch {
      // best-effort: the META owns its own degraded-mode UX.
    }
  }
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
   * Previously the two-argument form bug-existed: it
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
