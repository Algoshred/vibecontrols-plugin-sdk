/**
 * Multi-mode output dispatcher.
 *
 * Lifted from vibecontrols-agent/src/cli/utils/multimode.ts but trimmed:
 * the SDK doesn't ship the agent's `isInteractive()` helper since plugins
 * can't depend on opentui from the SDK. Instead we use a stdout-isTTY +
 * env CI/NO_COLOR check inline.
 */

export type OutputMode = "auto" | "interactive" | "plain" | "json";

export interface OutputFlags {
  json?: boolean;
  plain?: boolean;
  interactive?: boolean;
}

export interface MultimodeOptions<T> {
  fetchData: () => Promise<T> | T;
  plain: (data: T) => void | Promise<void>;
  interactive?: (data: T) => Promise<void>;
  json?: (data: T) => unknown;
  mode?: OutputMode;
}

/** Resolve user-supplied CLI flags into an OutputMode. */
export function pickOutputMode(flags: OutputFlags): OutputMode {
  if (flags.json) return "json";
  if (flags.plain) return "plain";
  if (flags.interactive) return "interactive";
  return "auto";
}

function isCi(): boolean {
  return !!process.env.CI || !!process.env.NO_COLOR || process.env.TERM === "dumb";
}

function stdoutIsTty(): boolean {
  return Boolean(process.stdout.isTTY);
}

export async function runMultimode<T>(opts: MultimodeOptions<T>): Promise<void> {
  const data = await opts.fetchData();
  const mode = opts.mode ?? "auto";

  if (mode === "json") {
    const shaped = opts.json ? opts.json(data) : data;
    process.stdout.write(`${JSON.stringify(shaped, null, 2)}\n`);
    return;
  }

  if (mode === "plain") {
    await opts.plain(data);
    return;
  }

  const wantInteractive =
    (mode === "interactive" || (stdoutIsTty() && !isCi())) && !!opts.interactive;

  if (wantInteractive && opts.interactive) {
    try {
      await opts.interactive(data);
      return;
    } catch {
      // Interactive renderer failed (missing dep, render glitch). Fall
      // through to plain so the user still sees output.
    }
  }

  await opts.plain(data);
}

/**
 * Convenience: emit `data` as JSON if `--json` is set; return `true` when
 * something was printed. Mutating commands (start/stop/install/...) reach
 * for this when they want a scriptable JSON opt-in.
 */
export function maybePrintJson(flags: OutputFlags, data: unknown): boolean {
  if (!flags.json) return false;
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  return true;
}
