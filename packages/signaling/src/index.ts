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
  RATE_LIMITS: DurableObjectNamespace;
  /** Cloudflare Realtime / Calls TURN App ID. Set via `wrangler secret put CALLS_TOKEN_ID`. */
  CALLS_TOKEN_ID?: string;
  /** Cloudflare Realtime / Calls TURN API token. Set via `wrangler secret put CALLS_API_TOKEN`. */
  CALLS_API_TOKEN?: string;
  /**
   * Demo kill switch. When set to a truthy string (e.g. "1"), every endpoint
   * returns 503 with a redirect to the self-host instructions. Toggle via:
   *   wrangler secret put DEMO_PAUSED
   *   wrangler secret delete DEMO_PAUSED
   */
  DEMO_PAUSED?: string;
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

/**
 * Per-IP rate limits. Sized so two peers behind the same NAT (e.g. test
 * tabs on one machine, or LAN peers) can pair without the burst of ICE
 * candidates + 1Hz polling tripping the cap.
 *
 * Per-session traffic from one IP with both peers behind it:
 *   - polling: ~1 GET/s per peer = ~120/min
 *   - SDP + ICE bursts: ~10-30 POSTs in first minute
 *   - turn-credentials: 1 per peer = 2 × 5 cost = 10
 *   - peak: ~150/min, sustained: ~120/min
 *
 * 300/min comfortably fits 2 concurrent pair sessions; 10k/day is ~50
 * sessions per IP per day — well above any single user, well below the
 * cost of becoming an actual abuse problem.
 */
const RATE_LIMIT_PER_MIN = 300;
const RATE_LIMIT_PER_DAY = 10_000;
/** Stale rate-limit DOs wipe their storage after this idle window. */
const RATE_LIMIT_IDLE_TTL_MS = 26 * 60 * 60 * 1000;

const SELF_HOST_URL = 'https://github.com/stele-app/stele#run-your-own-signaling';
const DEMO_PAUSED_MESSAGE =
  'The stele.au public signaling demo is paused. To keep using paired artifacts, ' +
  `run your own signaling Worker — see ${SELF_HOST_URL}. ` +
  'Existing artifacts can be repointed via the manifest\'s `signaling:` field.';

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

// ── Durable Object: one instance per client IP, rate-limit counters ──

interface RateWindow { startMs: number; count: number }

/**
 * Tracks two rolling counters per IP — a 60-second burst window and a
 * 24-hour daily window. Both are kept in DO storage so they survive
 * isolate eviction. An alarm wipes idle-IP DOs after ~26h so storage
 * doesn't accumulate forever.
 */
export class RateLimitDO implements DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const now = Date.now();
    const url = new URL(request.url);
    // Caller passes ?cost= so different endpoints can charge different amounts.
    // Default 1; turn-credentials charges more (it hits the Calls API).
    const cost = Math.max(1, Math.min(10, Number(url.searchParams.get('cost') ?? '1')));

    const minute = (await this.state.storage.get<RateWindow>('minute')) ?? { startMs: now, count: 0 };
    if (now - minute.startMs > 60_000) {
      minute.startMs = now;
      minute.count = 0;
    }
    const day = (await this.state.storage.get<RateWindow>('day')) ?? { startMs: now, count: 0 };
    if (now - day.startMs > 86_400_000) {
      day.startMs = now;
      day.count = 0;
    }

    if (minute.count + cost > RATE_LIMIT_PER_MIN) {
      const retryAfter = Math.max(1, Math.ceil((60_000 - (now - minute.startMs)) / 1000));
      return jsonResponse({ ok: false, retryAfter, reason: 'minute' });
    }
    if (day.count + cost > RATE_LIMIT_PER_DAY) {
      const retryAfter = Math.max(1, Math.ceil((86_400_000 - (now - day.startMs)) / 1000));
      return jsonResponse({ ok: false, retryAfter, reason: 'day' });
    }

    minute.count += cost;
    day.count += cost;
    await this.state.storage.put('minute', minute);
    await this.state.storage.put('day', day);
    await this.state.storage.setAlarm(now + RATE_LIMIT_IDLE_TTL_MS);

    return jsonResponse({ ok: true, minuteRemaining: RATE_LIMIT_PER_MIN - minute.count, dayRemaining: RATE_LIMIT_PER_DAY - day.count });
  }

  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

interface RateCheckResult { ok: boolean; retryAfter?: number; reason?: string }

async function checkRateLimit(env: Env, ip: string, cost = 1): Promise<RateCheckResult> {
  // Fail-open: if rate-limit DO can't be reached, let the request through.
  // Better to serve real users than block everything during an outage.
  try {
    const id = env.RATE_LIMITS.idFromName(`ip:${ip}`);
    const stub = env.RATE_LIMITS.get(id);
    const resp = await stub.fetch(`https://internal/check?cost=${cost}`);
    return await resp.json() as RateCheckResult;
  } catch (err) {
    console.error('[rate-limit] DO call failed, failing open:', err);
    return { ok: true };
  }
}

function rateLimitedResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      message: `Rate limit exceeded. Retry in ${retryAfter}s. Heavy users should run their own signaling Worker — see ${SELF_HOST_URL}.`,
      retryAfter,
    }),
    {
      status: 429,
      headers: corsHeaders({
        'content-type': 'application/json',
        'retry-after': String(retryAfter),
      }),
    },
  );
}

function demoPausedResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'demo paused', message: DEMO_PAUSED_MESSAGE, selfHost: SELF_HOST_URL }),
    {
      status: 503,
      headers: corsHeaders({
        'content-type': 'application/json',
        'retry-after': '0',
      }),
    },
  );
}

function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
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
    // CORS preflights bypass everything — even a paused demo needs to answer
    // the browser's preflight so it can see the 503 from the real request.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (env.DEMO_PAUSED) return demoPausedResponse();

    const url = new URL(request.url);
    // turn-credentials hits the Cloudflare Calls API — charge more so
    // abusers can't burn API quota faster than they burn signaling quota.
    const cost = url.pathname === '/turn-credentials' ? 5 : 1;
    const ip = clientIp(request);
    const limit = await checkRateLimit(env, ip, cost);
    if (!limit.ok) return rateLimitedResponse(limit.retryAfter ?? 60);

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
