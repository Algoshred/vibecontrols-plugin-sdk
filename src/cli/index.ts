/**
 * @vibecontrols/plugin-sdk/cli — CLI scaffolding helpers.
 *
 * Re-exports `runMultimode`, `pickOutputMode`, `redact`, and the
 * `CliCommandBuilder`. commander is a peerDep — only `command-builder` /
 * the `Command` type pull it; downstream plugins that don't ship a CLI
 * can still import multimode + redact without commander installed.
 */

export {
  runMultimode,
  pickOutputMode,
  maybePrintJson,
  type OutputMode,
  type OutputFlags,
  type MultimodeOptions,
} from "./multimode.js";
export { redact } from "./redaction.js";
export { CliCommandBuilder, type StatusCommandSpec } from "./command-builder.js";
