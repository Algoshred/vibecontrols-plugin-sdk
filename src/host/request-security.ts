/**
 * @vibecontrols/plugin-sdk/host/request-security
 *
 * Local-only request gating for sensitive host mutations (e.g. killing system
 * sessions/terminals). `denyNonLocalMutation` returns an error string when a
 * request did not originate from loopback and the named env override is unset,
 * else `null`. Ported verbatim from the agent's `core/request-security.ts` so
 * meta plugins can gate their own routes without depending on agent internals.
 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

interface RequestIpServer {
  requestIP(request: Request): { address: string } | null;
}

function normalizedHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

export function isLikelyLocalRequest(request: Request, server?: RequestIpServer | null): boolean {
  const headers = request.headers;
  if (
    headers.has("cf-connecting-ip") ||
    headers.has("x-forwarded-for") ||
    headers.has("x-real-ip") ||
    headers.has("forwarded")
  ) {
    return false;
  }

  const peerAddress = server?.requestIP(request)?.address;
  if (!peerAddress) return false;
  return LOOPBACK_HOSTS.has(normalizedHost(peerAddress));
}

export function denyNonLocalMutation(
  request: Request,
  envOverride: string,
  server?: RequestIpServer | null,
): string | null {
  if (isLikelyLocalRequest(request, server)) return null;
  if (process.env[envOverride] === "1") return null;
  return `This operation is local-only by default. Set ${envOverride}=1 to allow it over a tunnel.`;
}
