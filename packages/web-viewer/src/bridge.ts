/**
 * Web-viewer bridge adapter.
 *
 * Mirrors the desktop bridge protocol (MessagePort RPC + window-channel
 * init/status) but swaps the platform-specific backends:
 *
 * - Storage   → in-memory Map (persistent IndexedDB is a follow-up).
 * - shell.open → window.open.
 * - server.fetch (Archetype B) → same proxied fetch, host-side auth
 *                               injection. Web tokens will later be read
 *                               from URL fragments; for now the token is
 *                               passed in explicitly via BridgeOptions.
 */

export type BridgeStatus = 'loading' | 'ready' | 'mounted' | 'error';

export interface BridgeCallbacks {
  onStatusChange: (status: BridgeStatus) => void;
  onError: (message: string) => void;
}

export interface BridgeOptions {
  /** Manifest.server for Archetype B artifacts. Enables `server.fetch` RPC. */
  serverOrigin?: string | null;
  /** Bearer token for Archetype B. Injected as Authorization header. */
  token?: string | null;
}

const storageByArtifact = new Map<string, Map<string, string>>();

function storageScope(artifactId: string, shared: boolean): string {
  return shared ? '__shared__' : artifactId;
}

function getScope(scope: string): Map<string, string> {
  let m = storageByArtifact.get(scope);
  if (!m) { m = new Map(); storageByArtifact.set(scope, m); }
  return m;
}

function storageGet(artifactId: string, key: string, shared: boolean) {
  const m = getScope(storageScope(artifactId, shared));
  const value = m.get(key);
  return value !== undefined ? { key, value, shared } : null;
}
function storageSet(artifactId: string, key: string, value: string, shared: boolean) {
  getScope(storageScope(artifactId, shared)).set(key, value);
}
function storageDelete(artifactId: string, key: string, shared: boolean) {
  getScope(storageScope(artifactId, shared)).delete(key);
}
function storageList(artifactId: string, prefix: string, shared: boolean) {
  const m = getScope(storageScope(artifactId, shared));
  const out: Array<{ key: string; value: string }> = [];
  for (const [k, v] of m) if (k.startsWith(prefix)) out.push({ key: k, value: v });
  return out;
}

function isSafeExternalUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function serverFetch(
  serverOrigin: string,
  token: string | null | undefined,
  params: { path?: unknown; method?: unknown; headers?: unknown; body?: unknown },
) {
  const path = typeof params.path === 'string' ? params.path : '';
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    throw new Error(`server.fetch: path must start with '/' and stay within the server origin`);
  }
  const url = new URL(path, serverOrigin);
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

export function attachBridge(
  iframe: HTMLIFrameElement,
  artifactId: string,
  callbacks: BridgeCallbacks,
  options: BridgeOptions = {},
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
        case 'storage.get':
          reply(storageGet(artifactId, msg.params.key, msg.params.shared));
          break;
        case 'storage.set':
          storageSet(artifactId, msg.params.key, msg.params.value, msg.params.shared);
          reply(null);
          break;
        case 'storage.delete':
          storageDelete(artifactId, msg.params.key, msg.params.shared);
          reply(null);
          break;
        case 'storage.list':
          reply(storageList(artifactId, msg.params.prefix || '', msg.params.shared));
          break;
        case 'shell.open': {
          const url = String(msg.params?.url ?? '');
          if (!isSafeExternalUrl(url)) {
            reply(null, `Blocked: unsupported URL scheme for '${url}'`);
            break;
          }
          window.open(url, '_blank', 'noopener');
          reply(null);
          break;
        }
        case 'server.fetch': {
          if (!options.serverOrigin) {
            reply(null, 'server.fetch is only available for client-view artifacts with a declared server');
            break;
          }
          const result = await serverFetch(options.serverOrigin, options.token, msg.params || {});
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

    if (msg.kind === 'init' && !port && ev.ports.length > 0) {
      port = ev.ports[0];
      port.onmessage = portHandler;
      return;
    }

    if (msg.kind === 'ready')   { callbacks.onStatusChange('ready'); return; }
    if (msg.kind === 'mounted') { callbacks.onStatusChange('mounted'); return; }
    if (msg.kind === 'error')   {
      callbacks.onStatusChange('error');
      callbacks.onError(msg.message || 'Unknown error');
      return;
    }
  };

  window.addEventListener('message', windowHandler);
  return () => {
    window.removeEventListener('message', windowHandler);
    port?.close();
    port = null;
  };
}
