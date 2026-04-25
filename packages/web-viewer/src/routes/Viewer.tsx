/**
 * Web viewer route: /view?src=<URL>[#token=<T>]
 *
 * Fetches the artifact from the URL, parses the manifest, transforms JSX/TSX
 * if needed, and renders the sandbox. Token for Archetype B is read from the
 * URL fragment — fragments never travel over the wire, so logs and referers
 * don't see the token.
 *
 * MVP limitations:
 * - Direct fetch only (CORS proxy comes in Week 3).
 * - No permission consent dialog yet — capabilities declared in the manifest
 *   are NOT granted, so artifacts that need network / camera / etc. will hit
 *   the default-deny sandbox. UI for consent comes later.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  buildSandboxDoc,
  parseManifest,
  transformArtifact,
  type Archetype,
  type Manifest,
} from '@stele/runtime';
import { attachBridge, type BridgeStatus } from '../bridge';

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; source: string; kind_: 'jsx' | 'tsx' | 'html' }
  | { kind: 'err'; message: string; reason: 'http' | 'network' };

function detectKind(url: string, contentType: string | null): 'jsx' | 'tsx' | 'html' {
  const ext = url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
  if (ext === 'tsx') return 'tsx';
  if (ext === 'jsx' || ext === 'stele') return 'jsx';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (contentType?.includes('html')) return 'html';
  return 'jsx';
}

function hashToken(): string | null {
  const h = window.location.hash;
  if (h.startsWith('#token=')) return decodeURIComponent(h.slice('#token='.length));
  return null;
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

export default function Viewer() {
  const [params] = useSearchParams();
  const src = params.get('src');

  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'idle' });
  const [status, setStatus] = useState<BridgeStatus | 'transforming' | 'idle'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Stable artifact id for the lifetime of this page load — content hash
  // would be nice but we'd need crypto.subtle.digest; for MVP, use the URL.
  const artifactId = useMemo(() => src ?? 'no-src', [src]);
  const token = useMemo(() => hashToken(), []);

  // Fetch the artifact source.
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    setFetchState({ kind: 'loading' });

    (async () => {
      try {
        const resp = await fetch(src, { mode: 'cors' });
        if (!resp.ok) {
          // HTTP error — distinguish from CORS / network errors so the hint
          // in the UI is accurate.
          if (!cancelled) setFetchState({ kind: 'err', message: `HTTP ${resp.status} ${resp.statusText}`, reason: 'http' });
          return;
        }
        const source = await resp.text();
        const kind_ = detectKind(src, resp.headers.get('content-type'));
        if (!cancelled) setFetchState({ kind: 'ok', source, kind_ });
      } catch (err) {
        // TypeError thrown by fetch usually means CORS, DNS failure, or the
        // server blocked the request before returning headers.
        if (!cancelled) setFetchState({ kind: 'err', message: String(err instanceof Error ? err.message : err), reason: 'network' });
      }
    })();

    return () => { cancelled = true; };
  }, [src]);

  // Parse manifest (JSX/TSX only).
  const { manifest, parseErr } = useMemo(() => {
    if (fetchState.kind !== 'ok' || fetchState.kind_ === 'html') {
      return { manifest: null as Manifest | null, parseErr: null as string | null };
    }
    try {
      return { manifest: parseManifest(fetchState.source), parseErr: null };
    } catch (err) {
      return { manifest: null, parseErr: String(err instanceof Error ? err.message : err) };
    }
  }, [fetchState]);

  // Build sandbox doc when source + manifest are ready.
  const [sandboxDoc, setSandboxDoc] = useState<string | null>(null);
  useEffect(() => {
    if (fetchState.kind !== 'ok') { setSandboxDoc(null); return; }
    let cancelled = false;
    setStatus('transforming');

    (async () => {
      try {
        if (fetchState.kind_ === 'html') {
          // HTML artifacts don't go through transform — embed as-is.
          setSandboxDoc(fetchState.source);
          setStatus('loading');
          return;
        }

        const transformed = await transformArtifact(fetchState.source, fetchState.kind_);
        const doc = await buildSandboxDoc({
          transformedCode: transformed,
          artifactSource: fetchState.source,
          // MVP: no granted capabilities. Permission consent UI is a follow-up.
          grantedNetworkOrigins: [],
        });
        if (!cancelled) {
          setSandboxDoc(doc);
          setStatus('loading');
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err instanceof Error ? err.message : err));
          setStatus('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [fetchState]);

  // Attach bridge to the iframe.
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !sandboxDoc) return;

    const cleanup = attachBridge(
      iframe,
      artifactId,
      {
        onStatusChange: (s) => { setStatus(s); if (s !== 'error') setError(null); },
        onError: (msg) => setError(msg),
      },
      {
        serverOrigin: manifest?.archetype === 'client-view' ? manifest.server ?? null : null,
        token,
      },
    );
    return cleanup;
  }, [sandboxDoc, artifactId, manifest, token]);

  if (!src) {
    return (
      <Layout>
        <div style={{ color: '#fca5a5' }}>Missing <code>?src=</code> query parameter. Go back to <Link to="/" style={{ color: '#93c5fd' }}>the landing page</Link>.</div>
      </Layout>
    );
  }

  return (
    <Layout header={
      <Header
        src={src}
        manifest={manifest}
        parseErr={parseErr}
        status={fetchState.kind === 'loading' ? 'fetching' : status}
      />
    }>
      {fetchState.kind === 'loading' && <Centered>Fetching artifact…</Centered>}
      {fetchState.kind === 'err' && (
        <Centered>
          <div style={{ color: '#fca5a5', fontFamily: 'ui-monospace, monospace', fontSize: 13, maxWidth: 640, textAlign: 'center' }}>
            Could not fetch <code>{src}</code>
            <div style={{ marginTop: 8, color: '#94a3b8' }}>{fetchState.message}</div>
            <div style={{ marginTop: 16, fontSize: 12, color: '#64748b' }}>
              {fetchState.reason === 'http'
                ? 'The server responded — check the URL and that the file exists.'
                : 'The request was blocked before a response arrived. Usually this means CORS, DNS, or an offline server. A CORS proxy is planned for a future release.'}
            </div>
          </div>
        </Centered>
      )}
      {fetchState.kind === 'ok' && parseErr && (
        <Centered>
          <div style={{ color: '#fca5a5', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
            Manifest error: {parseErr}
          </div>
        </Centered>
      )}
      {fetchState.kind === 'ok' && !parseErr && sandboxDoc && (
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts allow-downloads"
          srcDoc={sandboxDoc}
          style={{ width: '100%', height: '100%', border: 'none', background: 'white', flex: 1 }}
          title="Artifact sandbox"
        />
      )}
      {error && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          right: 16,
          padding: '12px 16px',
          background: '#1e1215',
          border: '1px solid #7f1d1d',
          borderRadius: 8,
          color: '#fca5a5',
          fontSize: 13,
          fontFamily: 'ui-monospace, monospace',
          maxHeight: 200,
          overflow: 'auto',
        }}>
          {error}
        </div>
      )}
    </Layout>
  );
}

function Layout({ header, children }: { header?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {header}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      {children}
    </div>
  );
}

function Header({ src, manifest, parseErr, status }: {
  src: string;
  manifest: Manifest | null;
  parseErr: string | null;
  status: string;
}) {
  return (
    <div style={{
      padding: '10px 16px',
      borderBottom: '1px solid #1e293b',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0,
      background: '#0a0f1d',
    }}>
      <Link to="/" style={{
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid #334155',
        color: '#94a3b8',
        fontSize: 13,
        textDecoration: 'none',
      }}>Back</Link>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
        {manifest?.name || hostOf(src)}
      </span>
      {manifest && <ArchetypeBadge manifest={manifest} />}
      {parseErr && (
        <span style={{
          fontSize: 11,
          padding: '2px 6px',
          borderRadius: 4,
          background: '#1e1215',
          color: '#fca5a5',
          border: '1px solid #7f1d1d',
        }}>
          manifest error
        </span>
      )}
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 12, color: '#64748b' }}>{status}</span>
    </div>
  );
}

const ARCHETYPE_THEME: Record<Archetype, { label: string; background: string; color: string; border: string; tooltip: string }> = {
  'self-contained': {
    label: 'self-contained',
    background: '#0f2a1f',
    color: '#86efac',
    border: '#14532d',
    tooltip: 'Runs offline. No server dependency.',
  },
  'client-view': {
    label: 'client view',
    background: '#0f1e3a',
    color: '#93c5fd',
    border: '#1e3a8a',
    tooltip: 'View of data on a remote server. Needs connection.',
  },
  'paired': {
    label: 'paired',
    background: '#1f0f3a',
    color: '#c4b5fd',
    border: '#4c1d95',
    tooltip: 'Linked to a partner artifact. Both are required.',
  },
};

function ArchetypeBadge({ manifest }: { manifest: Manifest }) {
  const theme = ARCHETYPE_THEME[manifest.archetype];
  const label = manifest.archetype === 'client-view' && manifest.server
    ? `client view · ${hostOf(manifest.server)}`
    : theme.label;
  return (
    <span
      title={theme.tooltip}
      style={{
        fontSize: 11,
        padding: '2px 6px',
        borderRadius: 4,
        background: theme.background,
        color: theme.color,
        border: `1px solid ${theme.border}`,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
