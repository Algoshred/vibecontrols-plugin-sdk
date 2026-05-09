import { describe, it, expect, mock } from "bun:test";

import { BoundLogger } from "../../src/log/index.js";

type LogFn = (source: string, message: string, meta?: Record<string, unknown>) => void;

describe("BoundLogger", () => {
  it("binds source on every level call", () => {
    const info = mock<LogFn>(() => undefined);
    const warn = mock<LogFn>(() => undefined);
    const error = mock<LogFn>(() => undefined);
    const debug = mock<LogFn>(() => undefined);
    const log = new BoundLogger({ info, warn, error, debug }, "demo-src");
    log.info("msg-i", { a: 1 });
    log.warn("msg-w");
    log.error("msg-e", { b: 2 });
    log.debug("msg-d");
    expect(info).toHaveBeenCalledWith("demo-src", "msg-i", { a: 1 });
    expect(warn).toHaveBeenCalledWith("demo-src", "msg-w", undefined);
    expect(error).toHaveBeenCalledWith("demo-src", "msg-e", { b: 2 });
    expect(debug).toHaveBeenCalledWith("demo-src", "msg-d", undefined);
  });

  it("is a no-op when underlying logger is undefined", () => {
    const log = new BoundLogger(undefined, "demo");
    expect(() => log.info("ok")).not.toThrow();
    expect(() => log.warn("ok")).not.toThrow();
    expect(() => log.error("ok")).not.toThrow();
    expect(() => log.debug("ok")).not.toThrow();
  });

  it("is a no-op when individual level fns are missing", () => {
    const log = new BoundLogger({}, "demo");
    expect(() => log.info("ok")).not.toThrow();
  });
});
