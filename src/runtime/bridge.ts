/**
 * Host-side bridge.
 *
 * RPC flows over a MessagePort transferred from the sandbox at init time.
 * The port is unforgeable from within the iframe — anything posted via
 * `window.parent.postMessage` after init is silently dropped on the RPC path.
 *
 * Status messages (`ready` / `mounted` / `error`) stay on the window channel
 * because they're advisory UI state, not capability-granting.
 *
 * Storage is backed by SQLite via @tauri-apps/plugin-sql when available,
 * with an in-memory Map fallback for browser dev mode.
 */

import { getDb } from '../lib/db';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { getToken } from '../lib/tokens';

/** Only http/https URLs are permitted for external navigation. */
function isSafeExternalUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

interface ServerFetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * Proxied fetch for Archetype B (client-view) artifacts. Path must be
 * relative to the declared server origin — absolute or protocol-relative
 * URLs are rejected so artifacts cannot pivot away from their server.
 */
async function serverFetch(
  artifactId: string,
  serverOrigin: string,
  params: { path?: unknown; method?: unknown; headers?: unknown; body?: unknown },
): Promise<ServerFetchResult> {
  const path = typeof params.path === 'string' ? params.path : '';
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    throw new Error(`server.fetch: path must start with '/' and stay within the server origin`);
  }

  let url: URL;
  try {
    url = new URL(path, serverOrigin);
  } catch {
    throw new Error(`server.fetch: invalid path '${path}'`);
  }

  const origin = new URL(serverOrigin).origin;
  if (url.origin !== origin) {
    throw new Error(`server.fetch: resolved URL '${url.href}' is outside the server origin '${origin}'`);
  }

  const method = typeof params.method === 'string' ? params.method.toUpperCase() : 'GET';
  const headers: Record<string, string> = {};
  if (params.headers && typeof params.headers === 'object') {
    for (const [k, v] of Object.entries(params.headers as Record<string, unknown>)) {
      if (typeof v === 'string') headers[k] = v;
    }
  }
  const token = getToken(artifactId);
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const init: RequestInit = { method, headers };
  if (params.body !== undefined && params.body !== null && method !== 'GET' && method !== 'HEAD') {
    init.body = typeof params.body === 'string' ? params.body : JSON.stringify(params.body);
  }

  const resp = await fetch(url.href, init);
  const text = await resp.text();
  const respHeaders: Record<string, string> = {};
  resp.headers.forEach((v, k) => { respHeaders[k] = v; });

  return {
    ok: resp.ok,
    status: resp.status,
    statusText: resp.statusText,
    headers: respHeaders,
    body: text,
  };
}

export type BridgeStatus = 'loading' | 'ready' | 'mounted' | 'error';

export interface BridgeCallbacks {
  onStatusChange: (status: BridgeStatus) => void;
  onError: (message: string) => void;
}

// In-memory fallback for when SQLite isn't available
const memoryStorage = new Map<string, string>();

function storageScope(artifactId: string, shared: boolean): string {
  return shared ? '__shared__' : artifactId;
}

async function storageGet(artifactId: string, key: string, shared: boolean) {
  const scope = storageScope(artifactId, shared);
  const db = await getDb();
  if (db) {
    const rows = await db.select<Array<{ value: string }>>(
      'SELECT value FROM storage WHERE artifact_id = $1 AND scope = $2 AND key = $3',
      [artifactId, scope, key]
    );
    if (rows.length > 0) {
      return { key, value: rows[0].value, shared };
    }
    return null;
  }
  // Fallback
  const k = `${scope}::${key}`;
  const value = memoryStorage.get(k);
  return value !== undefined ? { key, value, shared } : null;
}

async function storageSet(artifactId: string, key: string, value: string, shared: boolean) {
  const scope = storageScope(artifactId, shared);
  const db = await getDb();
  if (db) {
    await db.execute(
      `INSERT INTO storage (artifact_id, scope, key, value, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(artifact_id, scope, key) DO UPDATE SET value = $4, updated_at = $5`,
      [artifactId, scope, key, value, Date.now()]
    );
    return;
  }
  memoryStorage.set(`${scope}::${key}`, value);
}

async function storageDelete(artifactId: string, key: string, shared: boolean) {
  const scope = storageScope(artifactId, shared);
  const db = await getDb();
  if (db) {
    await db.execute(
      'DELETE FROM storage WHERE artifact_id = $1 AND scope = $2 AND key = $3',
      [artifactId, scope, key]
    );
    return;
  }
  memoryStorage.delete(`${scope}::${key}`);
}

async function storageList(artifactId: string, prefix: string, shared: boolean) {
  const scope = storageScope(artifactId, shared);
  const db = await getDb();
  if (db) {
    const rows = await db.select<Array<{ key: string; value: string }>>(
      'SELECT key, value FROM storage WHERE artifact_id = $1 AND scope = $2 AND key LIKE $3',
      [artifactId, scope, `${prefix}%`]
    );
    return rows;
  }
  // Fallback
  const entries: Array<{ key: string; value: string }> = [];
  const fullPrefix = `${scope}::${prefix}`;
  for (const [k, v] of memoryStorage) {
    if (k.startsWith(fullPrefix)) {
      entries.push({ key: k.slice(scope.length + 2), value: v });
    }
  }
  return entries;
}

export interface BridgeOptions {
  /** Manifest.server for Archetype B artifacts. Enables `server.fetch` RPC. */
  serverOrigin?: string | null;
}

export function attachBridge(
  iframe: HTMLIFrameElement,
  artifactId: string,
  callbacks: BridgeCallbacks,
  options: BridgeOptions = {}
): () => void {
  let port: MessagePort | null = null;

  const portHandler = async (pev: MessageEvent) => {
    const msg = pev.data;
    if (!port || !msg || msg.kind !== 'rpc' || typeof msg.method !== 'string') return;

    const reply = (result: unknown, error?: string) => {
      port?.postMessage({ kind: 'rpc-result', id: msg.id, result, error });
    };

    try {
      switch (msg.method) {
        case 'storage.get': {
          const result = await storageGet(artifactId, msg.params.key, msg.params.shared);
          reply(result);
          break;
        }
        case 'storage.set': {
          await storageSet(artifactId, msg.params.key, msg.params.value, msg.params.shared);
          reply(null);
          break;
        }
        case 'storage.delete': {
          await storageDelete(artifactId, msg.params.key, msg.params.shared);
          reply(null);
          break;
        }
        case 'storage.list': {
          const entries = await storageList(artifactId, msg.params.prefix || '', msg.params.shared);
          reply(entries);
          break;
        }
        case 'shell.open': {
          const url = String(msg.params?.url ?? '');
          if (!isSafeExternalUrl(url)) {
            reply(null, `Blocked: unsupported URL scheme for '${url}'`);
            break;
          }
          try {
            await shellOpen(url);
          } catch {
            // Fallback for browser dev mode
            window.open(url, '_blank', 'noopener');
          }
          reply(null);
          break;
        }
        case 'server.fetch': {
          if (!options.serverOrigin) {
            reply(null, 'server.fetch is only available for client-view artifacts with a declared server');
            break;
          }
          const result = await serverFetch(artifactId, options.serverOrigin, msg.params || {});
          reply(result);
          break;
        }
        default:
          reply(null, `Unknown RPC method: ${msg.method}`);
      }
    } catch (err) {
      reply(null, String(err));
    }
  };

  const windowHandler = (ev: MessageEvent) => {
    if (ev.source !== iframe.contentWindow) return;
    const msg = ev.data;
    if (!msg || typeof msg.kind !== 'string') return;

    // One-time port handshake. Transferred port is the sole RPC channel.
    if (msg.kind === 'init' && !port && ev.ports.length > 0) {
      port = ev.ports[0];
      port.onmessage = portHandler;
      return;
    }

    // Advisory status messages — not privilege-granting, so window channel is fine.
    if (msg.kind === 'ready')   { callbacks.onStatusChange('ready'); return; }
    if (msg.kind === 'mounted') { callbacks.onStatusChange('mounted'); return; }
    if (msg.kind === 'error')   {
      callbacks.onStatusChange('error');
      callbacks.onError(msg.message || 'Unknown error');
      return;
    }

    // Anything else (including forged RPC on the window channel) is dropped.
  };

  window.addEventListener('message', windowHandler);
  return () => {
    window.removeEventListener('message', windowHandler);
    port?.close();
    port = null;
  };
}
