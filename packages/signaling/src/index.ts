/**
 * Stele signaling — brokers WebRTC SDP / ICE exchange between paired Stele
 * artifacts.
 *
 * Storage model: ONE Durable Object instance per pairing_id (room). All
 * reads and writes for that room are serialised through the DO, giving us
 * strongly consistent ordering across all regions. Two peers on opposite
 * sides of the planet still see each other's offer/answer/ICE within a
 * single round-trip — no KV propagation lag.
 *
 * The previous KV-backed implementation had two flaws this fixes:
 *   - Eventual consistency could delay cross-region reads up to 60s,
 *     causing the ICE handshake to time out before the answer arrived
 *     when the initiator opened first.
 *   - Free-tier KV list quota (1000/day) was tiny relative to polling.
 *
 * Trust model:
 * - The signaling server sees envelopes (SDP / ICE) but never the artifact's
 *   payload after the WebRTC data channel comes up — that's encrypted
 *   peer-to-peer with the ECDH-derived AES-GCM key.
 * - The pairing_id is the secret. It's a long random string distributed in
 *   the artifact files; guessing it is intractable. The server applies no
 *   per-message auth.
 *
 * Endpoints:
 *
 *   POST /messages
 *     body: { pairingId, from, payload }
 *     Appends one signal to this peer's queue inside the room DO.
 *
 *   GET  /messages?pairingId=…&peer=…&since=…
 *     Returns the partner peer's signals with ts > since. Strongly
 *     consistent — what's there is what's there, no propagation window.
 *
 *   GET /turn-credentials
 *     Mints short-lived TURN credentials via Cloudflare Realtime / Calls.
 */

interface Env {
  ROOMS: DurableObjectNamespace;
  /** Cloudflare Realtime / Calls TURN App ID. Set via `wrangler secret put CALLS_TOKEN_ID`. */
  CALLS_TOKEN_ID?: string;
  /** Cloudflare Realtime / Calls TURN API token. Set via `wrangler secret put CALLS_API_TOKEN`. */
  CALLS_API_TOKEN?: string;
}

interface SignalMessage {
  from: string;
  payload: unknown;
  ts: number;
}

const MAX_PAYLOAD_BYTES = 32 * 1024;
/** Cap how many messages we retain per peer inside the DO. */
const MAX_MESSAGES_PER_PEER = 100;
/** Idle TTL — DO storage clears itself this long after the last write. */
const IDLE_TTL_MS = 10 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────────────

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
  return /^[A-Za-z0-9._\-:]{1,128}$/.test(id);
}

// ── Durable Object: one instance per pairing_id ──────────────────────

/**
 * Each room's request stream is serialised inside its DO instance, so the
 * read-modify-write append on a peer's queue is atomic without us needing
 * any external locking. Storage is strongly consistent: a write is visible
 * to the very next read, in any region.
 */
export class RoomDO implements DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST') return this.handlePost(request);
    if (request.method === 'GET')  return this.handleGet(url);
    return new Response('Method not allowed', { status: 405 });
  }

  private async handlePost(request: Request): Promise<Response> {
    let body: unknown;
    try { body = await request.json(); }
    catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

    const { from, payload } = body as Record<string, unknown>;
    if (typeof from !== 'string' || !from || from.length > 1024) {
      return new Response(JSON.stringify({ error: 'invalid from' }), { status: 400 });
    }
    if (payload === undefined) {
      return new Response(JSON.stringify({ error: 'payload required' }), { status: 400 });
    }

    const message: SignalMessage = { from, payload, ts: Date.now() };
    if (JSON.stringify(message).length > MAX_PAYLOAD_BYTES) {
      return new Response(JSON.stringify({ error: `Message too large (limit ${MAX_PAYLOAD_BYTES})` }), { status: 413 });
    }

    const key = `peer:${from}`;
    const existing = (await this.state.storage.get<SignalMessage[]>(key)) ?? [];
    existing.push(message);
    if (existing.length > MAX_MESSAGES_PER_PEER) {
      existing.splice(0, existing.length - MAX_MESSAGES_PER_PEER);
    }
    await this.state.storage.put(key, existing);

    // Reset the idle TTL; the alarm wipes the room when it fires.
    await this.state.storage.setAlarm(Date.now() + IDLE_TTL_MS);

    return new Response(JSON.stringify({ ts: message.ts }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  private async handleGet(url: URL): Promise<Response> {
    const peer = url.searchParams.get('peer');
    const since = Number(url.searchParams.get('since') ?? '0');
    if (!peer || peer.length > 1024) {
      return new Response(JSON.stringify({ error: 'peer required' }), { status: 400 });
    }

    const all = (await this.state.storage.get<SignalMessage[]>(`peer:${peer}`)) ?? [];
    const messages = all.filter((m) => typeof m?.ts === 'number' && m.ts > since);
    return new Response(JSON.stringify({ messages, now: Date.now() }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  /** Idle expiry — wipe the room. Resets every time a new message arrives. */
  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }
}

// ── Top-level worker — validates + routes to the room DO ─────────────

async function routeToRoom(request: Request, env: Env, pairingId: string): Promise<Response> {
  const id = env.ROOMS.idFromName(pairingId);
  const stub = env.ROOMS.get(id);
  // Pass through with the original method + body. The DO doesn't care about
  // the path it sees, just method + querystring.
  const passUrl = new URL(request.url);
  const inner = await stub.fetch(passUrl.toString(), {
    method: request.method,
    headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' },
    body: request.method === 'POST' ? await request.text() : undefined,
  });
  // Re-wrap with public CORS headers.
  const text = await inner.text();
  return new Response(text, {
    status: inner.status,
    headers: corsHeaders({ 'content-type': inner.headers.get('content-type') ?? 'application/json' }),
  });
}

async function handleMessagesPost(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try { body = await request.clone().json(); }
  catch { return jsonError('Invalid JSON body', 400); }

  if (typeof body !== 'object' || body === null) return jsonError('Body must be a JSON object', 400);
  const { pairingId } = body as Record<string, unknown>;
  if (typeof pairingId !== 'string' || !isSafePairingId(pairingId)) {
    return jsonError('pairingId must be 1..128 chars of [A-Za-z0-9._-:]', 400);
  }
  return routeToRoom(request, env, pairingId);
}

async function handleMessagesGet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pairingId = url.searchParams.get('pairingId');
  const peer = url.searchParams.get('peer');
  const since = Number(url.searchParams.get('since') ?? '0');

  if (!pairingId || !isSafePairingId(pairingId)) {
    return jsonError('pairingId required (1..128 chars of [A-Za-z0-9._-:])', 400);
  }
  if (!peer || peer.length > 1024) {
    return jsonError('peer required (partner pubkey)', 400);
  }
  if (!Number.isFinite(since) || since < 0) {
    return jsonError('since must be a non-negative number (ms timestamp)', 400);
  }
  return routeToRoom(request, env, pairingId);
}

// ── TURN credentials (unchanged) ─────────────────────────────────────

const TURN_TTL_SECONDS = 3600;

async function handleTurnCredentials(env: Env): Promise<Response> {
  const stunOnly = {
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }],
    note: 'TURN not configured on this signaling deployment — STUN-only fallback. Cross-NAT pairs may fail.',
  };

  if (!env.CALLS_TOKEN_ID || !env.CALLS_API_TOKEN) {
    return jsonOk(stunOnly);
  }

  try {
    const resp = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.CALLS_TOKEN_ID}/credentials/generate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CALLS_API_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
      },
    );
    if (!resp.ok) {
      const body = await resp.text();
      console.error('[turn-credentials] Cloudflare Calls API error:', resp.status, body);
      return jsonOk(stunOnly);
    }
    const data = await resp.json() as { iceServers?: { urls: string | string[]; username?: string; credential?: string } };
    if (!data.iceServers) return jsonOk(stunOnly);

    return jsonOk({
      iceServers: [
        { urls: 'stun:stun.cloudflare.com:3478' },
        data.iceServers,
      ],
    });
  } catch (err) {
    console.error('[turn-credentials] fetch failed:', err);
    return jsonOk(stunOnly);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    const url = new URL(request.url);
    if (url.pathname === '/messages') {
      if (request.method === 'POST') return handleMessagesPost(request, env);
      if (request.method === 'GET')  return handleMessagesGet(request, env);
      return jsonError(`Method ${request.method} not allowed`, 405);
    }
    if (url.pathname === '/turn-credentials') {
      if (request.method !== 'GET') return jsonError(`Method ${request.method} not allowed`, 405);
      return handleTurnCredentials(env);
    }
    return jsonError(`Unknown path '${url.pathname}'`, 404);
  },
};
