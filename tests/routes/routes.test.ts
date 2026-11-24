import { describe, it, expect } from "bun:test";

import { AGENT_API_KEY_HEADER, RoutesBuilder, apiKeyFromRequest } from "../../src/routes/index.js";

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

  function authedApp(expected: string) {
    const app = new RoutesBuilder("demo")
      .withPrefix("/api/demo")
      .withAuth(() => expected)
      .build();
    app.get("/ping", () => ({ ok: true }));
    return app;
  }

  function ping(app: ReturnType<typeof authedApp>, headers: Record<string, string> = {}) {
    return app.handle(new Request("http://localhost/api/demo/ping", { headers }));
  }

  it("accepts the agent's x-agent-api-key header", async () => {
    const res = await ping(authedApp("secret"), { [AGENT_API_KEY_HEADER]: "secret" });
    expect(res.status).toBe(200);
  });

  it("accepts an Authorization: Bearer token, like the agent", async () => {
    const res = await ping(authedApp("secret"), { authorization: "Bearer secret" });
    expect(res.status).toBe(200);
  });

  it("rejects a missing or wrong key", async () => {
    const app = authedApp("secret");
    expect((await ping(app)).status).toBe(401);
    expect((await ping(app, { [AGENT_API_KEY_HEADER]: "wrong" })).status).toBe(401);
    expect((await ping(app, { [AGENT_API_KEY_HEADER]: "secre" })).status).toBe(401);
    expect((await ping(app, { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await ping(app, { authorization: "Basic secret" })).status).toBe(401);
    expect((await ping(app, { authorization: "Bearer " })).status).toBe(401);
  });

  it("no longer honours the legacy x-api-key header the agent never sent", async () => {
    const res = await ping(authedApp("secret"), { "x-api-key": "secret" });
    expect(res.status).toBe(401);
  });

  it("fails closed when the resolver yields an empty key", async () => {
    const res = await ping(authedApp(""), { [AGENT_API_KEY_HEADER]: "" });
    expect(res.status).toBe(401);
  });

  it("supports an async key resolver", async () => {
    const app = new RoutesBuilder("demo")
      .withPrefix("/api/demo")
      .withAuth(async () => "secret")
      .build();
    app.get("/ping", () => ({ ok: true }));
    expect((await ping(app, { [AGENT_API_KEY_HEADER]: "secret" })).status).toBe(200);
  });

  it("apiKeyFromRequest prefers the header over a bearer token", () => {
    const req = new Request("http://localhost/", {
      headers: { [AGENT_API_KEY_HEADER]: "from-header", authorization: "Bearer from-bearer" },
    });
    expect(apiKeyFromRequest(req)).toBe("from-header");
    expect(apiKeyFromRequest(new Request("http://localhost/?apiKey=x"))).toBeNull();
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
