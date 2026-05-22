import { defineConfig } from "tsup";

const entries = [
  "src/index.ts",
  "src/contract/index.ts",
  "src/lifecycle/index.ts",
  "src/cli/index.ts",
  "src/routes/index.ts",
  "src/telemetry/index.ts",
  "src/log/index.ts",
  "src/storage/index.ts",
  "src/config/index.ts",
  "src/subprocess/index.ts",
  "src/http/index.ts",
  "src/providers/index.ts",
  "src/context/index.ts",
  "src/audit/index.ts",
  "src/broadcast/index.ts",
  "src/testing/index.ts",
];

export default defineConfig({
  entry: entries,
  format: ["esm"],
  target: "es2022",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  // bun:test ships with the Bun runtime — never bundle it. Consumers that
  // import `@vibecontrols/plugin-sdk/testing` must run on Bun.
  external: ["bun:test", "bun", "elysia", "commander"],
});
