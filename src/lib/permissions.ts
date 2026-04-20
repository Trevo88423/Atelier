/**
 * Capability grant persistence.
 *
 * Reads/writes the `artifact_permissions` table. Each row is a single
 * (artifact_id, capability) grant. Absence of a row = not granted.
 */

import { getDb } from './db';

// In-memory fallback for browser dev mode (no Tauri/SQLite).
const memGrants = new Map<string, Set<string>>();

function memGet(artifactId: string): Set<string> {
  let s = memGrants.get(artifactId);
  if (!s) { s = new Set(); memGrants.set(artifactId, s); }
  return s;
}

/** All granted capability ids for an artifact. */
export async function getGranted(artifactId: string): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set(memGet(artifactId));

  const rows = await db.select<Array<{ capability: string }>>(
    'SELECT capability FROM artifact_permissions WHERE artifact_id = $1',
    [artifactId]
  );
  return new Set(rows.map(r => r.capability));
}

/** Grant a batch of capabilities for an artifact. Idempotent. */
export async function grantAll(artifactId: string, capabilityIds: string[]): Promise<void> {
  if (capabilityIds.length === 0) return;
  const now = Date.now();

  const db = await getDb();
  if (!db) {
    const s = memGet(artifactId);
    capabilityIds.forEach(c => s.add(c));
    notify();
    return;
  }

  for (const cap of capabilityIds) {
    await db.execute(
      `INSERT INTO artifact_permissions (artifact_id, capability, granted_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(artifact_id, capability) DO NOTHING`,
      [artifactId, cap, now]
    );
  }
  notify();
}

/** Revoke a single capability for an artifact. */
export async function revoke(artifactId: string, capabilityId: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    memGet(artifactId).delete(capabilityId);
    notify();
    return;
  }

  await db.execute(
    'DELETE FROM artifact_permissions WHERE artifact_id = $1 AND capability = $2',
    [artifactId, capabilityId]
  );
  notify();
}

/** Revoke all capabilities for an artifact (used when deleting an artifact). */
export async function revokeAll(artifactId: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    memGrants.delete(artifactId);
    notify();
    return;
  }

  await db.execute(
    'DELETE FROM artifact_permissions WHERE artifact_id = $1',
    [artifactId]
  );
  notify();
}

export interface GrantedPermission {
  artifactId: string;
  capability: string;
  grantedAt: number;
}

/** All grants across all artifacts — for the Settings page. */
export async function getAllGrants(): Promise<GrantedPermission[]> {
  const db = await getDb();
  if (!db) {
    const out: GrantedPermission[] = [];
    for (const [id, caps] of memGrants) {
      for (const c of caps) out.push({ artifactId: id, capability: c, grantedAt: 0 });
    }
    return out;
  }

  const rows = await db.select<Array<{ artifact_id: string; capability: string; granted_at: number }>>(
    'SELECT artifact_id, capability, granted_at FROM artifact_permissions ORDER BY granted_at DESC'
  );
  return rows.map(r => ({ artifactId: r.artifact_id, capability: r.capability, grantedAt: r.granted_at }));
}

// ── Reactive subscriptions (for Settings page live updates) ─────────

let listeners: Array<() => void> = [];

function notify() {
  listeners.forEach(fn => fn());
}

export function subscribePermissions(fn: () => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}
