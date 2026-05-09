/**
 * CliCommandBuilder — fluent helper that wires the standard `--json` /
 * `--plain` flags onto a Commander command and routes the action through
 * `runMultimode`. Removes the ~30-line boilerplate every plugin author
 * pastes for status/list commands.
 *
 * commander is a peerDep — this module imports `Command` as a *type* from
 * "commander" so the SDK builds without commander present, and runs only
 * when the consumer installed it.
 */

import type { Command } from "commander";

import { redact as redactValue } from "./redaction.js";
import { pickOutputMode, runMultimode, type OutputFlags } from "./multimode.js";

export interface StatusCommandSpec<T> {
  description: string;
  fetchData: () => Promise<T> | T;
  /** Plain renderer override. Defaults to `JSON.stringify` if absent. */
  format?: (data: T) => void | Promise<void>;
  /**
   * Apply redaction before any renderer. Strips sensitive keys recursively
   * (see ./redaction.ts).
   */
  redact?: boolean;
}

export class CliCommandBuilder {
  constructor(private readonly program: Command) {}

  /**
   * Register a `<name>` sub-command that fetches once and renders via
   * `--json` / `--plain` / interactive (when stdout is a TTY).
   */
  addStatusCommand<T>(name: string, spec: StatusCommandSpec<T>): this {
    this.program
      .command(name)
      .description(spec.description)
      .option("--json", "emit JSON for scripting")
      .option("--plain", "force plain text (no opentui)")
      .action(async (opts: OutputFlags) => {
        const mode = pickOutputMode(opts);
        await runMultimode<T>({
          mode,
          fetchData: spec.fetchData,
          plain: async (data) => {
            const view = spec.redact ? redactValue(data) : data;
            if (spec.format) {
              await spec.format(view as T);
              return;
            }
            process.stdout.write(`${JSON.stringify(view, null, 2)}\n`);
          },
          json: (data) => (spec.redact ? redactValue(data) : data),
        });
      });
    return this;
  }

  /** Escape hatch: hand back the underlying commander Command. */
  command(): Command {
    return this.program;
  }
}
