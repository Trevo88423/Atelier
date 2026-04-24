/**
 * In-memory token store for Archetype B (client-view) artifacts.
 *
 * Tokens are session-scoped — cleared when the host process exits.
 * Persisting them to disk is a deliberate non-goal for v0.3 because
 * a stolen library database + the .stele file would be a full
 * compromise. Users re-enter the token each session.
 */

const tokens = new Map<string, string>();

export function getToken(artifactId: string): string | undefined {
  return tokens.get(artifactId);
}

export function setToken(artifactId: string, token: string): void {
  tokens.set(artifactId, token);
}

export function clearToken(artifactId: string): void {
  tokens.delete(artifactId);
}

export function hasToken(artifactId: string): boolean {
  return tokens.has(artifactId);
}
