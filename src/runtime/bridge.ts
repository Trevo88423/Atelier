/**
 * Host-side postMessage bridge.
 *
 * Listens for RPC calls from the sandbox iframe and dispatches them.
 * In v1 (no Tauri backend yet), storage is backed by in-memory Maps.
 * When Tauri is available, these will delegate to Rust commands via invoke().
 */

export type BridgeStatus = 'loading' | 'ready' | 'mounted' | 'error';

export interface BridgeCallbacks {
  onStatusChange: (status: BridgeStatus) => void;
  onError: (message: string) => void;
}

// In-memory storage (replaced by SQLite via Tauri in production)
const memoryStorage = new Map<string, string>();

function storageKey(artifactId: string, key: string, shared: boolean): string {
  return `${shared ? 'shared' : artifactId}::${key}`;
}

export function attachBridge(
  iframe: HTMLIFrameElement,
  artifactId: string,
  callbacks: BridgeCallbacks
): () => void {
  const handler = async (ev: MessageEvent) => {
    if (ev.source !== iframe.contentWindow) return;
    const msg = ev.data;
    if (!msg || typeof msg.kind !== 'string') return;

    // Status messages from sandbox
    if (msg.kind === 'ready') {
      callbacks.onStatusChange('ready');
      return;
    }
    if (msg.kind === 'mounted') {
      callbacks.onStatusChange('mounted');
      return;
    }
    if (msg.kind === 'error') {
      callbacks.onStatusChange('error');
      callbacks.onError(msg.message || 'Unknown error');
      return;
    }

    // RPC calls from sandbox
    if (msg.kind !== 'rpc') return;

    const reply = (result: unknown, error?: string) => {
      iframe.contentWindow?.postMessage(
        { kind: 'rpc-result', id: msg.id, result, error },
        '*'
      );
    };

    try {
      switch (msg.method) {
        case 'storage.get': {
          const k = storageKey(artifactId, msg.params.key, msg.params.shared);
          const value = memoryStorage.get(k);
          reply(value !== undefined ? { key: msg.params.key, value, shared: msg.params.shared } : null);
          break;
        }
        case 'storage.set': {
          const k = storageKey(artifactId, msg.params.key, msg.params.shared);
          memoryStorage.set(k, msg.params.value);
          reply(null);
          break;
        }
        case 'storage.delete': {
          const k = storageKey(artifactId, msg.params.key, msg.params.shared);
          memoryStorage.delete(k);
          reply(null);
          break;
        }
        case 'storage.list': {
          const prefix = msg.params.prefix || '';
          const scope = msg.params.shared ? 'shared' : artifactId;
          const entries: Array<{ key: string; value: string }> = [];
          for (const [k, v] of memoryStorage) {
            if (k.startsWith(`${scope}::${prefix}`)) {
              entries.push({ key: k.slice(scope.length + 2), value: v });
            }
          }
          reply(entries);
          break;
        }
        case 'shell.open': {
          // In Tauri, this uses @tauri-apps/plugin-shell.
          // In dev/browser, fall back to window.open.
          window.open(msg.params.url, '_blank', 'noopener');
          reply(null);
          break;
        }
        default:
          reply(null, `Unknown RPC method: ${msg.method}`);
      }
    } catch (err) {
      reply(null, String(err));
    }
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
