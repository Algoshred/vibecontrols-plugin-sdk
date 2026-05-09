# @vibecontrols/plugin-sdk

Shared contract, lifecycle, CLI, telemetry, storage, and HTTP helpers consumed by every `@vibecontrols/vibe-plugin-*` package and by the agent itself.

> **Status:** Phase 1A scaffold. Module surfaces are placeholders — concrete APIs land in Phase 1B onwards.

## Install

```bash
bun add @vibecontrols/plugin-sdk
# or
npm install @vibecontrols/plugin-sdk
```

## Basic Usage (Stub — Phase 3 will fill this in)

```ts
// import { definePlugin } from "@vibecontrols/plugin-sdk/contract";
// import { withLifecycle } from "@vibecontrols/plugin-sdk/lifecycle";
//
// export default definePlugin({
//   name: "vibe-plugin-example",
//   version: "0.0.1",
//   ...withLifecycle({ onStart: async () => {} }),
// });
```

## Module Overview

| Subpath                               | Purpose                           |
| ------------------------------------- | --------------------------------- |
| `@vibecontrols/plugin-sdk/contract`   | Plugin contract & manifest types  |
| `@vibecontrols/plugin-sdk/lifecycle`  | onStart / onStop / onReload hooks |
| `@vibecontrols/plugin-sdk/cli`        | Commander integration helpers     |
| `@vibecontrols/plugin-sdk/routes`     | Elysia route helpers              |
| `@vibecontrols/plugin-sdk/telemetry`  | OTel metric / span helpers        |
| `@vibecontrols/plugin-sdk/log`        | Structured logger                 |
| `@vibecontrols/plugin-sdk/storage`    | SQLite / KV helpers               |
| `@vibecontrols/plugin-sdk/config`     | Config schema + validation        |
| `@vibecontrols/plugin-sdk/subprocess` | Cross-platform process runner     |
| `@vibecontrols/plugin-sdk/http`       | HTTP client wrappers              |
| `@vibecontrols/plugin-sdk/providers`  | Provider registry                 |
| `@vibecontrols/plugin-sdk/audit`      | Audit-log helpers                 |
| `@vibecontrols/plugin-sdk/broadcast`  | Cross-plugin event bus            |
| `@vibecontrols/plugin-sdk/testing`    | Test harnesses & mocks            |

## Compatibility Matrix

| SDK Version  | Agent Version  | Status                    |
| ------------ | -------------- | ------------------------- |
| `2026.509.x` | `>=2026.509.x` | Scaffold (no runtime API) |

## Contributing

1. Run `bun install`.
2. `bun run sanity` must be green (0 errors, 0 warnings).
3. Branches: `main` only. Releases auto-versioned via CalVer in CI.

## License

Proprietary — Burdenoff Consultancy Services Pvt. Ltd. See `LICENSE`.
