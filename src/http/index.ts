/**
 * @vibecontrols/plugin-sdk/http
 *
 * Minimal `HttpClient` with timeout (AbortController), retries with
 * exponential backoff, and JSON parse helpers. Wraps the platform-native
 * `fetch` (Bun + Node 24 both ship it). No third-party HTTP deps so this
 * module stays peerless.
 */

export interface HttpClientOptions {
  /** Per-request timeout in ms. Default 10_000. */
  timeoutMs?: number;
  /** Total attempts (initial + retries). Default 3. */
  maxAttempts?: number;
  /** Default headers merged into every request. */
  defaultHeaders?: Record<string, string>;
  /** Override fetch implementation (tests). */
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export class HttpClient {
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    options: HttpClientOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...(options?.headers ?? {}),
    };
    if (body !== undefined && headers["content-type"] === undefined) {
      headers["content-type"] = "application/json";
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      // Compose the caller's signal with our timeout signal — abort either side.
      const callerSignal = options?.signal;
      const onCallerAbort = () => controller.abort();
      callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

      try {
        const res = await this.fetchImpl(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText} for ${method} ${url}`);
        }
        const text = await res.text();
        if (!text) return undefined as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          return text as unknown as T;
        }
      } catch (err) {
        lastError = err;
        if (attempt >= this.maxAttempts) break;
        const backoff = 100 * 2 ** (attempt - 1);
        await new Promise((r) => setTimeout(r, backoff));
      } finally {
        clearTimeout(timer);
        callerSignal?.removeEventListener("abort", onCallerAbort);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`HttpClient: request failed for ${method} ${url}`);
  }
}
