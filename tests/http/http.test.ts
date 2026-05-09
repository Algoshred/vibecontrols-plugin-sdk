import { describe, it, expect, mock } from "bun:test";

import { HttpClient } from "../../src/http/index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HttpClient", () => {
  it("GET returns parsed JSON on success", async () => {
    const fetchImpl = mock(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ ok: true }),
    ) as unknown as typeof fetch;
    const c = new HttpClient("https://api.local", { fetchImpl });
    const out = await c.get<{ ok: boolean }>("/x");
    expect(out.ok).toBe(true);
  });

  it("POST sends JSON body and content-type header", async () => {
    const fetchImpl = mock(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/json");
      expect(init?.body).toBe(JSON.stringify({ a: 1 }));
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;
    const c = new HttpClient("https://api.local", { fetchImpl });
    await c.post("/x", { a: 1 });
  });

  it("retries transient failures up to maxAttempts then succeeds", async () => {
    let n = 0;
    const fetchImpl = mock(async (_url: string, _init?: RequestInit) => {
      n++;
      if (n < 3) throw new Error("transient");
      return jsonResponse({ ok: n });
    }) as unknown as typeof fetch;
    const c = new HttpClient("https://api.local", { fetchImpl, maxAttempts: 3 });
    const out = await c.get<{ ok: number }>("/x");
    expect(out.ok).toBe(3);
    expect(n).toBe(3);
  });

  it("throws when retries are exhausted", async () => {
    const fetchImpl = mock(async (_url: string, _init?: RequestInit) => {
      throw new Error("always fails");
    }) as unknown as typeof fetch;
    const c = new HttpClient("https://api.local", { fetchImpl, maxAttempts: 2 });
    await expect(c.get("/x")).rejects.toThrow(/always fails/);
  });

  it("throws on non-2xx HTTP status", async () => {
    const fetchImpl = mock(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ err: "bad" }, 500),
    ) as unknown as typeof fetch;
    const c = new HttpClient("https://api.local", { fetchImpl, maxAttempts: 1 });
    await expect(c.get("/x")).rejects.toThrow(/HTTP 500/);
  });

  it("aborts when timeout elapses", async () => {
    const fetchImpl = mock(async (_url: string, init?: RequestInit) => {
      await new Promise<void>((resolve, reject) => {
        const sig = init?.signal;
        if (sig?.aborted) {
          reject(new Error("aborted"));
          return;
        }
        sig?.addEventListener("abort", () => reject(new Error("aborted")));
        setTimeout(resolve, 1000);
      });
      return jsonResponse({});
    }) as unknown as typeof fetch;
    const c = new HttpClient("https://api.local", {
      fetchImpl,
      maxAttempts: 1,
      timeoutMs: 20,
    });
    await expect(c.get("/x")).rejects.toThrow();
  });

  it("returns text when response body isn't JSON", async () => {
    const fetchImpl = mock(
      async (_url: string, _init?: RequestInit) => new Response("plain", { status: 200 }),
    ) as unknown as typeof fetch;
    const c = new HttpClient("https://api.local", { fetchImpl });
    const out = await c.get<string>("/x");
    expect(out).toBe("plain");
  });
});
