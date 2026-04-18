import { useState, useRef, useCallback, useEffect } from 'react';
import { transformArtifact } from './runtime/transform';
import { buildSandboxDoc } from './runtime/sandbox';
import { attachBridge, type BridgeStatus } from './runtime/bridge';

// Load the demo artifact source at build time
import demoSource from './fixtures/demo.jsx?raw';

function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<BridgeStatus | 'idle' | 'transforming'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [artifactSource, setArtifactSource] = useState<string | null>(null);
  const [sandboxDoc, setSandboxDoc] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const loadArtifact = useCallback(async (source: string, filename: string) => {
    setStatus('transforming');
    setError(null);
    setArtifactSource(source);

    try {
      const ext = filename.split('.').pop()?.toLowerCase() || 'jsx';
      const loader = ext === 'tsx' ? 'tsx' : 'jsx';
      const transformed = await transformArtifact(source, loader);
      const doc = await buildSandboxDoc(transformed);
      setSandboxDoc(doc);
      setStatus('loading');
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  }, []);

  // Attach bridge when iframe loads with new srcdoc
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !sandboxDoc) return;

    // Clean up previous bridge
    cleanupRef.current?.();

    const cleanup = attachBridge(iframe, 'demo-artifact', {
      onStatusChange: setStatus,
      onError: setError,
    });
    cleanupRef.current = cleanup;

    return cleanup;
  }, [sandboxDoc]);

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['jsx', 'tsx'].includes(ext)) {
      setError(`Unsupported file type: .${ext}. Drop a .jsx or .tsx file.`);
      setStatus('error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        loadArtifact(reader.result, file.name);
      }
    };
    reader.readAsText(file);
  }, [loadArtifact]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        padding: '12px 20px',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        flexShrink: 0,
      }}>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
          Atelier
        </h1>
        <span style={{ fontSize: '13px', color: '#64748b' }}>
          {status === 'idle' && 'Drop a .jsx or .tsx file to play it'}
          {status === 'transforming' && 'Transforming...'}
          {status === 'loading' && 'Loading sandbox...'}
          {status === 'ready' && 'Sandbox ready, mounting...'}
          {status === 'mounted' && 'Running'}
          {status === 'error' && 'Error'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button
            onClick={() => loadArtifact(demoSource, 'demo.jsx')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#e2e8f0',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Load Demo
          </button>
        </div>
      </header>

      {/* Main content */}
      <div
        style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Drop zone overlay */}
        {isDragOver && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(59, 130, 246, 0.15)',
            border: '3px dashed #3b82f6',
            borderRadius: '12px',
            margin: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}>
            <div style={{ fontSize: '20px', color: '#3b82f6', fontWeight: 500 }}>
              Drop artifact here
            </div>
          </div>
        )}

        {/* Empty state */}
        {!sandboxDoc && status !== 'transforming' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '16px',
              border: '2px dashed #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              color: '#475569',
            }}>
              +
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '4px' }}>
                Drag and drop a Claude artifact
              </div>
              <div style={{ fontSize: '13px', color: '#475569' }}>
                .jsx or .tsx files
              </div>
            </div>
            <button
              onClick={() => loadArtifact(demoSource, 'demo.jsx')}
              style={{
                marginTop: '8px',
                padding: '10px 24px',
                borderRadius: '8px',
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Try Demo Artifact
            </button>
          </div>
        )}

        {/* Transforming state */}
        {status === 'transforming' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748b',
            fontSize: '14px',
          }}>
            Compiling artifact...
          </div>
        )}

        {/* Error display */}
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

        {/* Sandbox iframe */}
        {sandboxDoc && (
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts"
            srcDoc={sandboxDoc}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'white',
            }}
            title="Artifact Sandbox"
          />
        )}
      </div>
    </div>
  );
}

export default App;
