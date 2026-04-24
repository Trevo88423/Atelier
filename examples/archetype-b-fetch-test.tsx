/**
 * @stele-manifest
 * name: Archetype B Fetch Test
 * version: 1.0.0
 * description: Exercises window.stele.server.fetch against httpbin.org. Uses whatever token you paste in the Connect dialog and echoes the headers the server saw so you can verify Authorization injection.
 * archetype: client-view
 * server: https://httpbin.org
 */

import { useState, useEffect } from 'react';

declare global {
  interface Window {
    stele: {
      server: {
        fetch: (path: string, options?: {
          method?: string;
          headers?: Record<string, string>;
          body?: string;
        }) => Promise<{
          ok: boolean;
          status: number;
          statusText: string;
          headers: Record<string, string>;
          body: string;
        }>;
      };
    };
  }
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; status: number; echoedAuth: string | null; raw: unknown }
  | { kind: 'err'; message: string };

export default function ArchetypeBFetchTest() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [postState, setPostState] = useState<State>({ kind: 'idle' });

  useEffect(() => {
    (async () => {
      setState({ kind: 'loading' });
      try {
        const resp = await window.stele.server.fetch('/get');
        const parsed = JSON.parse(resp.body) as { headers?: Record<string, string> };
        setState({
          kind: 'ok',
          status: resp.status,
          echoedAuth: parsed.headers?.Authorization ?? null,
          raw: parsed,
        });
      } catch (err) {
        setState({ kind: 'err', message: String(err) });
      }
    })();
  }, []);

  const runPost = async () => {
    setPostState({ kind: 'loading' });
    try {
      const resp = await window.stele.server.fetch('/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hello: 'stele', when: Date.now() }),
      });
      const parsed = JSON.parse(resp.body) as { headers?: Record<string, string>; json?: unknown };
      setPostState({
        kind: 'ok',
        status: resp.status,
        echoedAuth: parsed.headers?.Authorization ?? null,
        raw: parsed,
      });
    } catch (err) {
      setPostState({ kind: 'err', message: String(err) });
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 720, margin: '40px auto', padding: '0 20px', color: '#1e293b' }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Archetype B — server.fetch test</h1>
      <p style={{ color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
        This artifact hits <code>https://httpbin.org/get</code> and{' '}
        <code>https://httpbin.org/post</code> via <code>window.stele.server.fetch</code>.
        If you pasted a token, httpbin should echo it back as the{' '}
        <code>Authorization: Bearer ...</code> header it received.
      </p>

      <Section title="GET /get">
        <Result state={state} />
      </Section>

      <Section title="POST /post">
        <button
          onClick={runPost}
          disabled={postState.kind === 'loading'}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            background: postState.kind === 'loading' ? '#94a3b8' : '#3b82f6',
            color: 'white',
            fontSize: 13,
            fontWeight: 600,
            cursor: postState.kind === 'loading' ? 'not-allowed' : 'pointer',
            marginBottom: 12,
          }}
        >
          {postState.kind === 'loading' ? 'Posting…' : 'Send POST'}
        </button>
        <Result state={postState} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#0f172a' }}>{title}</h2>
      {children}
    </div>
  );
}

function Result({ state }: { state: State }) {
  if (state.kind === 'idle') return <div style={{ color: '#94a3b8', fontSize: 13 }}>Not run yet.</div>;
  if (state.kind === 'loading') return <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>;
  if (state.kind === 'err') {
    return (
      <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, border: '1px solid #fecaca', color: '#991b1b', fontSize: 13, fontFamily: 'ui-monospace, monospace' }}>
        {state.message}
      </div>
    );
  }
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: 'white' }}>
      <Row label="Status" value={String(state.status)} />
      <Row
        label="Authorization echoed"
        value={state.echoedAuth ?? '— (no token set — Skip was used)'}
        mono
        good={state.echoedAuth?.startsWith('Bearer ')}
      />
      <details style={{ borderTop: '1px solid #e2e8f0' }}>
        <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>Raw response</summary>
        <pre style={{ margin: 0, padding: 14, background: '#0f172a', color: '#e2e8f0', fontSize: 12, overflowX: 'auto', borderRadius: '0 0 6px 6px' }}>
          {JSON.stringify(state.raw, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Row({ label, value, mono, good }: { label: string; value: string; mono?: boolean; good?: boolean }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 12, fontSize: 13 }}>
      <div style={{ width: 170, color: '#64748b', flexShrink: 0 }}>{label}</div>
      <div style={{
        flex: 1,
        fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
        color: good === true ? '#15803d' : good === false ? '#b45309' : '#0f172a',
        wordBreak: 'break-all',
      }}>
        {value}
      </div>
    </div>
  );
}
