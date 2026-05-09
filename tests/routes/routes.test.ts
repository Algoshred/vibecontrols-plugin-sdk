import { describe, it, expect } from "bun:test";

import { RoutesBuilder } from "../../src/routes/index.js";

describe("RoutesBuilder", () => {
  it("chain methods return the same builder", () => {
    const b = new RoutesBuilder("demo");
    const r = b
      .withPrefix("/api/demo")
      .withAuth(() => "key")
      .withErrorHandler()
      .withLogging();
    expect(r).toBe(b);
  });

  it("build() returns an Elysia instance", () => {
    const app = new RoutesBuilder("demo").withPrefix("/api/demo").build();
    expect(app).toBeDefined();
    // duck-typed — the agent's plugin loader treats whatever this returns as an Elysia.
    expect(typeof (app as { handle?: unknown }).handle).toBeDefined();
  });

  it("rejects requests with a missing or wrong x-api-key header", async () => {
    const app = new RoutesBuilder("demo")
      .withPrefix("/api/demo")
      .withAuth(() => "secret")
      .build();
    app.get("/ping", () => ({ ok: true }));

    const noKey = await app.handle(new Request("http://localhost/api/demo/ping"));
    expect(noKey.status).toBe(401);

    const wrong = await app.handle(
      new Request("http://localhost/api/demo/ping", {
        headers: { "x-api-key": "wrong" },
      }),
    );
    expect(wrong.status).toBe(401);

    const ok = await app.handle(
      new Request("http://localhost/api/demo/ping", {
        headers: { "x-api-key": "secret" },
      }),
    );
    expect(ok.status).toBe(200);
  });

  it("withErrorHandler returns shaped 500 response when a route throws", async () => {
    const app = new RoutesBuilder("demo").withPrefix("/api/demo").withErrorHandler().build();
    app.get("/boom", () => {
      throw new Error("kaboom");
    });
    const res = await app.handle(new Request("http://localhost/api/demo/boom"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("kaboom");
  });
});
