/**
 * Test fixtures for downstream plugin authors.
 *
 * Currently exports a minimal `samplePlugin` factory that satisfies
 * `VibePluginFactory` — handy as a baseline plugin object in tests.
 */

import type { ProfileContext, VibePlugin, VibePluginFactory } from "../contract/index.js";

export const samplePlugin: VibePluginFactory = (_ctx: ProfileContext): VibePlugin => ({
  name: "sample-plugin",
  version: "0.0.0",
  description: "Sample plugin for SDK fixture use",
  tags: ["backend"],
  capabilities: { storage: "rw", telemetry: true },
});
