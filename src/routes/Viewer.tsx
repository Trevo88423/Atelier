import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getArtifact, markOpened, updateTags, subscribe } from '../lib/artifact-store';
import { exportAsHtml, downloadHtml } from '../lib/export-html';
import ViewerDispatch from '../viewers';
import type { BridgeStatus } from '../runtime/bridge';

export default function Viewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState<BridgeStatus | 'transforming' | 'idle'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [killed, setKilled] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [, forceUpdate] = useState(0);
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  const artifact = id ? getArtifact(id) : undefined;

  useEffect(() => {
    if (id) {
      markOpened(id);
      localStorage.setItem('atelier:lastViewed', id);
    }
  }, [id]);

  // Re-render when artifact data changes (e.g., tags updated)
  useEffect(() => subscribe(() => forceUpdate(n => n + 1)), []);

  const handleStatusChange = useCallback((s: BridgeStatus | 'transforming') => {
    setStatus(s);
    if (s !== 'error') setError(null);
  }, []);

  const handleError = useCallback((msg: string) => {
    setError(msg);
  }, []);

  // Force-kill: blank all iframes to stop computation immediately
  const handleStop = useCallback(() => {
    const container = viewerContainerRef.current;
    if (container) {
      const iframes = container.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        iframe.srcdoc = '';
        iframe.src = 'about:blank';
      });
    }
    setKilled(true);
    setStatus('idle');
    setError(null);
  }, []);

  const handleBack = useCallback(() => {
    handleStop();
    navigate('/');
  }, [handleStop, navigate]);

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
          onClick={handleBack}
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
        {/* Tags */}
        {artifact.tags.map(tag => (
          <span
            key={tag}
            onClick={() => updateTags(artifact.id, artifact.tags.filter(t => t !== tag))}
            title="Click to remove"
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '11px',
              background: '#1e293b',
              color: '#94a3b8',
              cursor: 'pointer',
              border: '1px solid #334155',
            }}
          >
            {tag} ×
          </span>
        ))}
        {showTagInput ? (
          <input
            autoFocus
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && tagInput.trim()) {
                const newTag = tagInput.trim().toLowerCase();
                if (!artifact.tags.includes(newTag)) {
                  updateTags(artifact.id, [...artifact.tags, newTag]);
                }
                setTagInput('');
                setShowTagInput(false);
              }
              if (e.key === 'Escape') {
                setTagInput('');
                setShowTagInput(false);
              }
            }}
            onBlur={() => { setTagInput(''); setShowTagInput(false); }}
            placeholder="tag name"
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid #3b82f6',
              background: '#0f172a',
              color: '#e2e8f0',
              fontSize: '11px',
              width: '80px',
              outline: 'none',
            }}
          />
        ) : (
          <button
            onClick={() => setShowTagInput(true)}
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px dashed #334155',
              background: 'transparent',
              color: '#475569',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            + tag
          </button>
        )}

        <span style={{ fontSize: '12px', color: '#64748b' }}>
          {status === 'transforming' && 'Compiling...'}
          {status === 'loading' && 'Loading...'}
          {status === 'ready' && 'Mounting...'}
          {status === 'mounted' && 'Running'}
          {status === 'error' && 'Error'}
        </span>
        <div style={{ flex: 1 }} />
        {!killed && (status === 'mounted' || status === 'loading' || status === 'ready' || status === 'transforming') && (
          <button
            onClick={handleStop}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #7f1d1d',
              background: 'transparent',
              color: '#ef4444',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Stop
          </button>
        )}
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
      <div ref={viewerContainerRef} style={{ flex: 1, position: 'relative' }}>
        {killed ? (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            color: '#64748b',
          }}>
            <div style={{ fontSize: '15px' }}>Artifact stopped</div>
            <button
              onClick={() => setKilled(false)}
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
              Restart
            </button>
          </div>
        ) : (
          <ViewerDispatch
            artifact={artifact}
            onStatusChange={handleStatusChange}
            onError={handleError}
          />
        )}

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
