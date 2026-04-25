/**
 * Stele signaling — brokers WebRTC SDP / ICE exchange between paired Stele
 * artifacts. KV-backed polling, no persistent connections.
 *
 * Trust model:
 * - The server sees the room id (manifest.pairing_id) and message envelopes
 *   but never the artifact's payload after the WebRTC data channel is up
 *   (everything goes peer-to-peer + AES-GCM-encrypted with the ECDH key).
 * - The pairing_id is the secret. It's a long random string distributed in
 *   the artifact files; guessing it is intractable. The server applies no
 *   per-message auth — a sender claiming a `from` could lie, but the
 *   receiver verifies authorship via the ECDH-encrypted handshake anyway.
 *
 * Endpoints:
 *
 *   POST /messages
 *     body: { pairingId, from, payload }
 *     Appends the message to the room. KV TTL: 5 minutes.
 *
 *   GET  /messages?pairingId=…&since=…
 *     Returns every message in the room with ts > since. The caller filters
 *     out its own messages client-side (the server doesn't track identities).
 *
 * No rate limit is enforced in code — apply Cloudflare's WAF rate-limiting
 * rules at the route level before exposing publicly.
 */

interface Env {
  SIGNALING_KV: KVNamespace;
}

interface SignalMessage {
  from: string;
  payload: unknown;
  ts: number;
}

const MESSAGE_TTL_SECONDS = 300;
const MAX_PAYLOAD_BYTES = 32 * 1024;

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: corsHeaders({ 'content-type': 'application/json' }),
  });
}

function isSafePairingId(id: string): boolean {
  // Pairing IDs are arbitrary opaque tokens, but we need to keep them KV-key-safe.
  // Reject anything containing slashes or unusual whitespace; allow URL-safe chars.
  return /^[A-Za-z0-9._\-:]{1,128}$/.test(id);
}

async function handlePost(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON body', 400); }

  if (typeof body !== 'object' || body === null) return jsonError('Body must be a JSON object', 400);
  const { pairingId, from, payload } = body as Record<string, unknown>;

  if (typeof pairingId !== 'string' || !isSafePairingId(pairingId)) {
    return jsonError('pairingId must be 1..128 chars of [A-Za-z0-9._-:]', 400);
  }
  if (typeof from !== 'string' || from.length === 0 || from.length > 1024) {
    return jsonError('from must be a non-empty string under 1024 chars', 400);
  }
  if (payload === undefined) return jsonError('payload required', 400);

  const serialized = JSON.stringify({ from, payload, ts: Date.now() } satisfies SignalMessage);
  if (serialized.length > MAX_PAYLOAD_BYTES) {
    return jsonError(`Message too large (limit ${MAX_PAYLOAD_BYTES} bytes)`, 413);
  }

  const ts = Date.now();
  // Key includes ts so list() returns chronological-ish order; suffix random
  // bytes so concurrent posts don't collide.
  const suffix = Math.random().toString(36).slice(2, 10);
  const key = `room:${pairingId}:${ts.toString().padStart(15, '0')}:${suffix}`;

  await env.SIGNALING_KV.put(key, serialized, { expirationTtl: MESSAGE_TTL_SECONDS });
  return jsonOk({ ts });
}

async function handleGet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pairingId = url.searchParams.get('pairingId');
  const since = Number(url.searchParams.get('since') ?? '0');

  if (!pairingId || !isSafePairingId(pairingId)) {
    return jsonError('pairingId required (1..128 chars of [A-Za-z0-9._-:])', 400);
  }
  if (!Number.isFinite(since) || since < 0) {
    return jsonError('since must be a non-negative number (ms timestamp)', 400);
  }

  const list = await env.SIGNALING_KV.list({ prefix: `room:${pairingId}:`, limit: 200 });

  const messages: SignalMessage[] = [];
  await Promise.all(list.keys.map(async (k) => {
    const raw = await env.SIGNALING_KV.get(k.name);
    if (!raw) return;
    try {
      const msg = JSON.parse(raw) as SignalMessage;
      if (typeof msg.ts === 'number' && msg.ts > since) messages.push(msg);
    } catch {
      // Ignore corrupt rows.
    }
  }));

  messages.sort((a, b) => a.ts - b.ts);
  return jsonOk({ messages, now: Date.now() });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    const url = new URL(request.url);
    if (url.pathname !== '/messages') return jsonError(`Unknown path '${url.pathname}'`, 404);
    if (request.method === 'POST') return handlePost(request, env);
    if (request.method === 'GET') return handleGet(request, env);
    return jsonError(`Method ${request.method} not allowed`, 405);
  },
};
