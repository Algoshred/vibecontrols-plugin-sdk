import { describe, it, expect, mock } from "bun:test";

import { BroadcastEmitter } from "../../src/broadcast/index.js";

describe("BroadcastEmitter", () => {
  it("forwards type + payload through hostServices.broadcast", () => {
    const broadcast = mock((_type: string, _payload: unknown) => undefined);
    new BroadcastEmitter({ broadcast }).broadcast("evt", { count: 1 });
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith("evt", { count: 1 });
  });

  it("is a no-op when broadcast is absent on the host", () => {
    expect(() => new BroadcastEmitter({}).broadcast("e", 1)).not.toThrow();
  });

  it("is a no-op when hostServices is absent", () => {
    expect(() => new BroadcastEmitter().broadcast("e", 1)).not.toThrow();
  });
});
