import { describe, it, expect } from "bun:test";
import { Command } from "commander";

import { CliCommandBuilder } from "../../src/cli/command-builder.js";

describe("CliCommandBuilder", () => {
  it("adds a status sub-command with --json and --plain options", () => {
    const program = new Command();
    new CliCommandBuilder(program).addStatusCommand("status", {
      description: "Show status",
      fetchData: () => ({ ok: true }),
    });

    const sub = program.commands.find((c) => c.name() === "status");
    expect(sub).toBeDefined();
    const optionFlags = sub?.options.map((o) => o.long);
    expect(optionFlags).toContain("--json");
    expect(optionFlags).toContain("--plain");
  });

  it("returns the underlying commander program from .command()", () => {
    const program = new Command();
    const builder = new CliCommandBuilder(program);
    expect(builder.command()).toBe(program);
  });

  it("redacts data when redact: true is passed and emits JSON", async () => {
    const program = new Command();
    program.exitOverride();
    new CliCommandBuilder(program).addStatusCommand("status", {
      description: "show",
      fetchData: () => ({ token: "abc", value: "ok" }),
      redact: true,
    });

    const writes: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "test", "status", "--json"]);
    } finally {
      process.stdout.write = orig;
    }
    const out = writes.join("");
    expect(out).toContain("[redacted]");
    expect(out).not.toContain('"token": "abc"');
  });
});
