/**
 * @vibecontrols/plugin-sdk/providers
 *
 * Thin façade over `hostServices.serviceRegistry` — provider plugins call
 * `register` and consumer plugins call `get` / `list`. Every method is a
 * graceful no-op when the host has no registry.
 */

import type { HostServices, ServiceRegistry } from "../contract/index.js";

export interface CliContribution {
  statusSections?: unknown[];
  doctorChecks?: unknown[];
}

export class ProviderRegistry {
  constructor(private readonly hostServices?: HostServices) {}

  getServiceRegistry(): ServiceRegistry | undefined {
    return this.hostServices?.serviceRegistry;
  }

  registerProvider<T>(type: string, name: string, provider: T): void {
    this.hostServices?.serviceRegistry?.registerService<T>(type, name, provider);
  }

  getProvider<T>(type: string, name: string): T | undefined {
    return this.hostServices?.serviceRegistry?.getService<T>(type, name);
  }

  listProviders(type: string): string[] {
    const reg = this.hostServices?.serviceRegistry;
    return reg?.listProvidersForType?.(type) ?? [];
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
