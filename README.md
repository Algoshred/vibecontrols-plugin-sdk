# @vibecontrols/plugin-sdk

Shared contract, lifecycle, CLI, telemetry, storage, and HTTP helpers consumed by every `@vibecontrols/vibe-plugin-*` package and by the agent itself.

## Install

```bash
bun add @vibecontrols/plugin-sdk
# or
npm install @vibecontrols/plugin-sdk
```

## Modules

Granular subpath imports so plugins tree-shake aggressively. The most-used helpers are also re-exported from the root barrel `@vibecontrols/plugin-sdk`.

### `contract` — types

The plugin contract v2 surface. `VibePlugin`, `HostServices`, `PluginCapabilities`, `Prerequisite`, `StorageProvider`, `ServiceRegistry`, plus `FULL_TRUST_CAPS`. Every host-side field is optional so plugins keep working against partial hosts.

```ts
import type { VibePluginFactory, VibePlugin } from "@vibecontrols/plugin-sdk/contract";

export const createPlugin: VibePluginFactory = (ctx) => ({
  name: "demo",
  version: "1.0.0",
  capabilities: { storage: "rw", telemetry: true },
  tags: ["backend"],
});
```

### `lifecycle` — boilerplate-free init / shutdown

`createLifecycleHooks` collapses `onServerStart` / `onServerStop` boilerplate, emits a one-shot `<plugin>.ready` telemetry event, and skips on unsupported platforms.

```ts
import { createLifecycleHooks } from "@vibecontrols/plugin-sdk/lifecycle";

const { onServerStart, onServerStop } = createLifecycleHooks({
  name: "demo",
  telemetryEventName: "demo.ready",
  onInit: async (hostServices) => {
    /* ... */
  },
});
```

### `cli` — multimode + redaction + command builder

`runMultimode<T>` selects between JSON / plain / interactive renderers from a single `fetchData` call. `redact(value)` strips secrets recursively. `CliCommandBuilder` registers status sub-commands with `--json` / `--plain` baked in.

```ts
import { CliCommandBuilder, redact } from "@vibecontrols/plugin-sdk/cli";

new CliCommandBuilder(program).addStatusCommand("status", {
  description: "Show plugin status",
  fetchData: () => fetchStatus(),
  redact: true,
});
```

### `routes` — Elysia fluent builder

```ts
import { RoutesBuilder } from "@vibecontrols/plugin-sdk/routes";

const app = new RoutesBuilder("demo", hostServices)
  .withPrefix("/api/demo")
  .withAuth(() => process.env.AGENT_API_KEY ?? "")
  .withErrorHandler()
  .withLogging()
  .build();

app.get("/ping", () => ({ ok: true }));
```

### `telemetry` — auto-tagged emitter

```ts
import { TelemetryEmitter } from "@vibecontrols/plugin-sdk/telemetry";

const tel = new TelemetryEmitter("demo", "1.0.0", hostServices);
tel.emitReady({ port: 3005 });
tel.emitError(new Error("boom"));
```

### `log` — source-bound logger

```ts
import { BoundLogger } from "@vibecontrols/plugin-sdk/log";

const log = new BoundLogger(hostServices.logger, "demo");
log.info("started", { port: 3005 });
```

### `storage` — typed JSON-encoded helpers

```ts
import { TypedStore, NamespaceStore } from "@vibecontrols/plugin-sdk/storage";

const ns = new NamespaceStore(hostServices.storage!, "demo");
const settings = ns.typed<{ enabled: boolean }>("settings");
await settings.set({ enabled: true });
const current = await settings.get();
```

### `config` — env + host config + defaults

```ts
import { ConfigManager } from "@vibecontrols/plugin-sdk/config";

const cfg = new ConfigManager("demo", hostServices, hostServices.logger);
const port = (await cfg.getInt("port", 3005))!;
const apiKey = await cfg.getRequired("api_key"); // throws if missing
```

### `subprocess` — cross-platform process helpers

```ts
import {
  gracefulKill,
  isProcessAlive,
  findAvailablePort,
  sleep,
} from "@vibecontrols/plugin-sdk/subprocess";

const port = await findAvailablePort(7000);
await gracefulKill(child.pid, 3000);
```

### `http` — HttpClient with retries + timeout

```ts
import { HttpClient } from "@vibecontrols/plugin-sdk/http";

const client = new HttpClient("https://api.example.com", { timeoutMs: 5000 });
const data = await client.get<{ ok: boolean }>("/v1/status");
```

### `providers` — ProviderRegistry façade

```ts
import { ProviderRegistry } from "@vibecontrols/plugin-sdk/providers";

const reg = new ProviderRegistry(hostServices);
reg.registerProvider("tunnel", "cloudflare", myCloudflareProvider);
const all = reg.listProviders("tunnel");
```

### `audit` — bound source emitter

```ts
import { AuditLogger } from "@vibecontrols/plugin-sdk/audit";

const audit = new AuditLogger("demo", hostServices);
audit.emit("started", { port: 3005 });
```

### `broadcast` — typed WebSocket emitter

```ts
import { BroadcastEmitter } from "@vibecontrols/plugin-sdk/broadcast";

new BroadcastEmitter(hostServices).broadcast("demo.event", { count: 1 });
```

### `testing` — Bun-mock factories

Run with `bun test` (depends on the runtime `bun:test` import).

```ts
import { createMockHostServices, createMockProfileContext } from "@vibecontrols/plugin-sdk/testing";

const hs = createMockHostServices({ getAgentVersion: () => "test" });
const ctx = createMockProfileContext();
```

## Compatibility Matrix

| SDK version  | Agent version  | Plugin contract             |
| ------------ | -------------- | --------------------------- |
| `2026.509.x` | `>=2026.509.1` | v2 (`createPlugin` factory) |

## Boilerplate

Downstream plugins can extend the shared configs in `boilerplate/`:

- `tsconfig.base.json` — strict TS + ESM
- `eslint.config.base.js` — no-any, no-eslint-disable, max-warnings 0
- `lefthook.base.yml` — pre-push sanity gate
- `bunfig.toml` — npm scope wiring
- `.github/workflows/release.template.yml` — CalVer publish pipeline
- `package.template.json` — minimal starter package.json

See `templates/plugin-scaffold.md` for the recommended layout.

## Contributing

1. `bun install`
2. `bun run sanity` must be green (0 errors, 0 warnings)
3. Trunk-based: `main` only. CalVer release via `gh workflow run release.yml -f version=YYYY.MDD.PATCH`.
4. Spec: `~/products/vibecontrols/vibecontrols-specs/architecture/PLUGIN_SDK_EXTRACTION.md`

<!-- VIBECONTROLS_OSS_FOOTER_START -->

---

## About VibeControls

**VibeControls** is the agentic engineering mission control for AI-native teams. Vibe-plugins extend the VibeControls agent with new providers, tools, sessions, tunnels, storage backends, and security stages.

- Website: <https://vibecontrols.com>
- Documentation: <https://docs.vibecontrols.com>
- Plugin SDK: <https://github.com/algoshred/vibecontrols-plugin-sdk>
- All plugins: <https://github.com/algoshred?q=vibe-plugin-&type=all>

## License

Released under the [MIT License](./LICENSE).

Copyright (c) 2026 Burdenoff Consultancy Services Private Limited, Algoshred Technologies Private Limited, and all its sister companies.

Maintainer: **Vignesh T.V** — <https://github.com/tvvignesh>

**Note**: this plugin is open source under MIT. The `@vibecontrols/agent` runtime that loads and orchestrates plugins is **closed source** and proprietary to Burdenoff Consultancy Services Pvt. Ltd. If you want a fully self-hostable agent, please open an issue or contact the maintainer.

<!-- VIBECONTROLS_OSS_FOOTER_END -->
