# Plugin Scaffold Template

Recommended layout for a new `@vibecontrols/vibe-plugin-*` package built on the SDK. Copy the relevant files from `boilerplate/` (see `boilerplate/README.md` for the full list) and structure your sources like:

```
vibe-plugin-myplugin/
├── package.json          # extends boilerplate/package.template.json
├── bunfig.toml           # copy from boilerplate/bunfig.toml
├── tsconfig.json         # extends boilerplate/tsconfig.base.json
├── eslint.config.js      # spreads boilerplate/eslint.config.base.js
├── lefthook.yml          # copy from boilerplate/lefthook.base.yml
├── .github/workflows/
│   └── release.yml       # copy from boilerplate/.github/workflows/release.template.yml
├── src/
│   ├── index.ts          # createPlugin factory + boilerplate-free lifecycle
│   ├── routes.ts         # uses RoutesBuilder
│   └── commands.ts       # uses CliCommandBuilder
└── tests/
    └── plugin.test.ts    # uses createMockHostServices / createMockProfileContext
```

## src/index.ts skeleton

```ts
import { createLifecycleHooks, TelemetryEmitter } from "@vibecontrols/plugin-sdk";
import type { VibePlugin, VibePluginFactory } from "@vibecontrols/plugin-sdk/contract";

import { createMyRoutes } from "./routes.js";
import { registerMyCommands } from "./commands.js";

export const createPlugin: VibePluginFactory = (_ctx): VibePlugin => {
  const tel = new TelemetryEmitter("myplugin", "0.0.1");
  const lifecycle = createLifecycleHooks({
    name: "myplugin",
    telemetryEventName: "myplugin.ready",
    onInit: async (hs) => {
      tel["hostServices" as never] = hs as never; // assign once on init if needed
    },
  });

  return {
    name: "myplugin",
    version: "0.0.1",
    description: "Example plugin built on @vibecontrols/plugin-sdk",
    tags: ["backend", "cli"],
    capabilities: { storage: "rw", telemetry: true, audit: true },
    apiPrefix: "/api/myplugin",
    createRoutes: () => createMyRoutes(),
    onServerStart: lifecycle.onServerStart,
    onServerStop: lifecycle.onServerStop,
    onCliSetup: (program, hs) => registerMyCommands(program, hs),
  };
};
```
