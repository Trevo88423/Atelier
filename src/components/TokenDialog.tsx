/**
 * Token prompt for Archetype B (client-view) artifacts.
 *
 * Shown before the artifact runs. User pastes the access token they got
 * from the originating business (via email link, portal, etc.). Stored
 * in memory only — cleared when the app closes.
 */

import { useState } from 'react';

interface TokenDialogProps {
  /** Host from manifest.server, e.g. "api.bookd.tpbkitchens.com.au". */
  serverHost: string;
  /** manifest.name, shown for context. */
  artifactName: string;
  onSubmit: (token: string) => void;
  /** User chose to proceed without a token. Artifact will see 401s from server.fetch. */
  onSkip: () => void;
}

export default function TokenDialog({ serverHost, artifactName, onSubmit, onSkip }: TokenDialogProps) {
  const [token, setToken] = useState('');

  const handleConnect = () => {
    const trimmed = token.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(2, 6, 23, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '28px',
        width: '480px',
        maxWidth: 'calc(100vw - 48px)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#93c5fd',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '6px',
          }}>
            Client view — access token
          </div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#e2e8f0' }}>
            {artifactName}
          </h2>
          <div style={{ marginTop: '10px', fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>
            This artifact is a view of data on{' '}
            <span style={{ fontFamily: 'ui-monospace, monospace', color: '#93c5fd' }}>{serverHost}</span>.
            Paste the access token you were given.
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <input
            autoFocus
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
            placeholder="paste token here"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#e2e8f0',
              fontSize: '13px',
              fontFamily: 'ui-monospace, monospace',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{
          fontSize: '12px',
          color: '#64748b',
          marginBottom: '20px',
          lineHeight: 1.5,
        }}>
          Tokens stay in memory only — they aren't written to disk or synced anywhere.
          You'll be asked again next time you open this artifact.
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onSkip}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: '1px solid #334155',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Skip
          </button>
          <button
            onClick={handleConnect}
            disabled={!token.trim()}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: token.trim() ? '#3b82f6' : '#1e3a5f',
              color: token.trim() ? 'white' : '#64748b',
              fontSize: '14px',
              fontWeight: 600,
              cursor: token.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
