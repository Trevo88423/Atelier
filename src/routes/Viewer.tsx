import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getArtifact, markOpened } from '../lib/artifact-store';
import { exportAsHtml, downloadHtml } from '../lib/export-html';
import ViewerDispatch from '../viewers';
import type { BridgeStatus } from '../runtime/bridge';

export default function Viewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState<BridgeStatus | 'transforming' | 'idle'>('idle');
  const [error, setError] = useState<string | null>(null);

  const artifact = id ? getArtifact(id) : undefined;

  useEffect(() => {
    if (id) {
      markOpened(id);
      // Store last viewed for reopen-on-launch
      localStorage.setItem('atelier:lastViewed', id);
    }
  }, [id]);

  const handleStatusChange = useCallback((s: BridgeStatus | 'transforming') => {
    setStatus(s);
    if (s !== 'error') setError(null);
  }, []);

  const handleError = useCallback((msg: string) => {
    setError(msg);
  }, []);

  if (!artifact) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        color: '#64748b',
      }}>
        <div style={{ fontSize: '16px' }}>Artifact not found</div>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '8px 20px',
            borderRadius: '8px',
            border: 'none',
            background: '#3b82f6',
            color: 'white',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Back to Library
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Viewer header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid #334155',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Back
        </button>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>
          {artifact.title}
        </span>
        <span style={{
          fontSize: '11px',
          padding: '2px 6px',
          borderRadius: '4px',
          background: '#1e293b',
          color: '#64748b',
          textTransform: 'uppercase',
        }}>
          .{artifact.kind}
        </span>
        <span style={{ fontSize: '12px', color: '#64748b' }}>
          {status === 'transforming' && 'Compiling...'}
          {status === 'loading' && 'Loading...'}
          {status === 'ready' && 'Mounting...'}
          {status === 'mounted' && 'Running'}
          {status === 'error' && 'Error'}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={async () => {
            if (!artifact) return;
            try {
              const html = await exportAsHtml(artifact);
              const name = artifact.originalName.replace(/\.[^.]+$/, '') + '.html';
              downloadHtml(html, name);
            } catch (err) {
              setError(String(err));
            }
          }}
          style={{
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid #334155',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Export HTML
        </button>
      </div>

      {/* Viewer content */}
      <div style={{ flex: 1, position: 'relative' }}>
        <ViewerDispatch
          artifact={artifact}
          onStatusChange={handleStatusChange}
          onError={handleError}
        />

        {/* Error overlay */}
        {error && (
          <div style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            right: '16px',
            padding: '12px 16px',
            background: '#1e1215',
            border: '1px solid #7f1d1d',
            borderRadius: '8px',
            color: '#fca5a5',
            fontSize: '13px',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            zIndex: 5,
            maxHeight: '200px',
            overflow: 'auto',
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
