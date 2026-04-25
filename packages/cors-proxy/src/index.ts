/**
 * Stele CORS proxy — fetches artifact text on behalf of the web viewer so
 * it can open .stele files from sources that don't allow cross-origin GETs
 * (GitHub raw works, random shared drives do not).
 *
 * Contract:
 *   GET /fetch?url=<absolute https URL>
 *
 *   200 → text body of the upstream resource, with CORS headers.
 *   4xx → JSON { error: string } explaining why the request was rejected.
 *
 * Policies:
 * - https only. No http://, no file://, no other schemes.
 * - Extension allowlist: .stele, .jsx, .tsx, .html, .svg, .md, .mermaid.
 * - 5 MB hard cap on the response body (checked against Content-Length first,
 *   then enforced while streaming).
 * - Hostname must not look like an IP literal in a private or loopback range.
 *   (Full rebind protection would need DNS + TOCTOU handling; the literal
 *   check covers naive SSRF attempts.)
 * - No rate limiting in this MVP — add via Cloudflare KV / Durable Objects
 *   before exposing publicly to untrusted traffic.
 */

const ALLOWED_EXTENSIONS = new Set(['stele', 'jsx', 'tsx', 'html', 'svg', 'md', 'mermaid']);
const MAX_BYTES = 5 * 1024 * 1024;

// Common CORS headers applied to every response.
function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    ...extra,
  };
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders({ 'content-type': 'application/json' }),
  });
}

function extensionOf(pathname: string): string | null {
  const idx = pathname.lastIndexOf('.');
  if (idx < 0) return null;
  return pathname.slice(idx + 1).toLowerCase();
}

/** Reject IP-literal hostnames in private / loopback / link-local / meta ranges. */
function isDisallowedIpLiteral(host: string): boolean {
  // IPv4
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    if (a === 10) return true;                        // 10.0.0.0/8
    if (a === 127) return true;                       // 127.0.0.0/8
    if (a === 169 && b === 254) return true;          // 169.254.0.0/16 (link-local, incl. AWS metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 0) return true;                          // 0.0.0.0/8
    return false;
  }
  // IPv6 literals (bracketed or bare)
  const stripped = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (stripped === '::1') return true;
  if (stripped.startsWith('fe80:') || stripped.startsWith('fc') || stripped.startsWith('fd')) return true;
  return false;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'GET') {
      return jsonError('Only GET is supported', 405);
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname !== '/fetch') {
      return jsonError(`Unknown path '${requestUrl.pathname}'. Use /fetch?url=...`, 404);
    }

    const raw = requestUrl.searchParams.get('url');
    if (!raw) return jsonError("Missing 'url' query parameter", 400);

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return jsonError(`Malformed url: ${raw}`, 400);
    }

    if (target.protocol !== 'https:') {
      return jsonError(`Only https:// URLs are allowed (got ${target.protocol})`, 400);
    }
    if (isDisallowedIpLiteral(target.hostname)) {
      return jsonError(`Hostname ${target.hostname} is in a disallowed IP range`, 403);
    }

    const ext = extensionOf(target.pathname);
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return jsonError(
        `Unsupported extension '${ext ?? '(none)'}'. Allowed: ${Array.from(ALLOWED_EXTENSIONS).map((e) => '.' + e).join(', ')}`,
        400,
      );
    }

    let upstream: Response;
    try {
      upstream = await fetch(target.href, {
        method: 'GET',
        // Don't forward client headers — upstream should serve a public asset.
        headers: { 'User-Agent': 'Stele-CORS-Proxy/0.1' },
        redirect: 'follow',
      });
    } catch (err) {
      return jsonError(`Upstream fetch failed: ${err instanceof Error ? err.message : String(err)}`, 502);
    }

    if (!upstream.ok) {
      return jsonError(`Upstream responded with ${upstream.status} ${upstream.statusText}`, upstream.status === 404 ? 404 : 502);
    }

    const declaredLength = upstream.headers.get('content-length');
    if (declaredLength && Number(declaredLength) > MAX_BYTES) {
      return jsonError(`Upstream body too large (${declaredLength} bytes > ${MAX_BYTES})`, 413);
    }

    // Stream into a buffer while enforcing the size cap.
    const reader = upstream.body?.getReader();
    if (!reader) return jsonError('Upstream body was empty', 502);

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return jsonError(`Upstream body exceeded ${MAX_BYTES} bytes`, 413);
      }
      chunks.push(value);
    }

    const body = new Blob(chunks, { type: upstream.headers.get('content-type') || 'text/plain' });
    return new Response(body, {
      status: 200,
      headers: corsHeaders({
        'content-type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
        'x-stele-proxied-from': target.href,
      }),
    });
  },
};
