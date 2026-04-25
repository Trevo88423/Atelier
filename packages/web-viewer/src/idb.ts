/**
 * Tiny IndexedDB wrapper for the web viewer.
 *
 * Two object stores, both keyed on compound paths so we can scope per artifact:
 *
 * - 'storage'     — value: string. Keys: [artifactId, scope, key].
 *                   `scope` is '__shared__' for window.storage(_, true) entries
 *                   and the artifactId itself otherwise.
 * - 'permissions' — value: { grantedAt: number }. Keys: [artifactId, capability].
 *
 * No migrations beyond version 1; add a v2 with onupgradeneeded if the schema
 * evolves. All errors surface as rejected promises — callers decide whether
 * to fall back gracefully (the bridge does for storage; consent flow does too).
 */

const DB_NAME = 'stele-web';
const DB_VERSION = 1;
const STORE_STORAGE = 'storage';
const STORE_PERMISSIONS = 'permissions';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_STORAGE)) {
        db.createObjectStore(STORE_STORAGE, { keyPath: ['artifactId', 'scope', 'key'] });
      }
      if (!db.objectStoreNames.contains(STORE_PERMISSIONS)) {
        db.createObjectStore(STORE_PERMISSIONS, { keyPath: ['artifactId', 'capability'] });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Wait for an IDB transaction to commit. */
function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ── Storage ───────────────────────────────────────────────────────────

export interface StorageRow {
  artifactId: string;
  scope: string;
  key: string;
  value: string;
}

export async function storageGet(artifactId: string, scope: string, key: string): Promise<string | undefined> {
  const db = await open();
  const tx = db.transaction(STORE_STORAGE, 'readonly');
  const row = await promisify<StorageRow | undefined>(tx.objectStore(STORE_STORAGE).get([artifactId, scope, key]));
  return row?.value;
}

export async function storagePut(artifactId: string, scope: string, key: string, value: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE_STORAGE, 'readwrite');
  tx.objectStore(STORE_STORAGE).put({ artifactId, scope, key, value });
  await txComplete(tx);
}

export async function storageDelete(artifactId: string, scope: string, key: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE_STORAGE, 'readwrite');
  tx.objectStore(STORE_STORAGE).delete([artifactId, scope, key]);
  await txComplete(tx);
}

export async function storageList(artifactId: string, scope: string, prefix: string): Promise<Array<{ key: string; value: string }>> {
  const db = await open();
  const tx = db.transaction(STORE_STORAGE, 'readonly');
  // Bound the cursor to keys that start with [artifactId, scope, prefix...].
  const lower = [artifactId, scope, prefix];
  const upper = [artifactId, scope, prefix + '\uffff'];
  const range = IDBKeyRange.bound(lower, upper);
  const out: Array<{ key: string; value: string }> = [];
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_STORAGE).openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(out); return; }
      const row = cursor.value as StorageRow;
      out.push({ key: row.key, value: row.value });
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Permissions ───────────────────────────────────────────────────────

export interface PermissionRow {
  artifactId: string;
  capability: string;
  grantedAt: number;
}

export async function permissionsGet(artifactId: string): Promise<Set<string>> {
  const db = await open();
  const tx = db.transaction(STORE_PERMISSIONS, 'readonly');
  const range = IDBKeyRange.bound([artifactId], [artifactId, '\uffff']);
  const out = new Set<string>();
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_PERMISSIONS).openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(out); return; }
      const row = cursor.value as PermissionRow;
      out.add(row.capability);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function permissionsAdd(artifactId: string, capabilities: string[]): Promise<void> {
  if (capabilities.length === 0) return;
  const db = await open();
  const tx = db.transaction(STORE_PERMISSIONS, 'readwrite');
  const store = tx.objectStore(STORE_PERMISSIONS);
  const now = Date.now();
  for (const c of capabilities) {
    store.put({ artifactId, capability: c, grantedAt: now });
  }
  await txComplete(tx);
}
