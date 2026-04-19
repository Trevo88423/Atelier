/**
 * JSX/TSX viewer — transforms and renders React artifacts in a sandboxed iframe.
 */

import { useState, useRef, useEffect } from 'react';
import { transformArtifact } from '../runtime/transform';
import { buildSandboxDoc } from '../runtime/sandbox';
import { attachBridge, type BridgeStatus } from '../runtime/bridge';

interface JsxViewerProps {
  source: string;
  artifactId: string;
  kind: 'jsx' | 'tsx';
  onStatusChange?: (status: BridgeStatus | 'transforming') => void;
  onError?: (message: string) => void;
}

export default function JsxViewer({ source, artifactId, kind, onStatusChange, onError }: JsxViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [sandboxDoc, setSandboxDoc] = useState<string | null>(null);

  // Transform on mount
  useEffect(() => {
    let cancelled = false;
    onStatusChange?.('transforming');

    (async () => {
      try {
        const loader = kind === 'tsx' ? 'tsx' : 'jsx';
        const transformed = await transformArtifact(source, loader);
        const doc = await buildSandboxDoc(transformed, source);
        if (!cancelled) {
          setSandboxDoc(doc);
          onStatusChange?.('loading');
        }
      } catch (err) {
        if (!cancelled) {
          onError?.(String(err));
          onStatusChange?.('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [source, kind, onStatusChange, onError]);

  // Attach bridge
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !sandboxDoc) return;

    cleanupRef.current?.();
    const cleanup = attachBridge(iframe, artifactId, {
      onStatusChange: (s) => onStatusChange?.(s),
      onError: (msg) => onError?.(msg),
    });
    cleanupRef.current = cleanup;
    return cleanup;
  }, [sandboxDoc, artifactId, onStatusChange, onError]);

  if (!sandboxDoc) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
      }}>
        Compiling artifact...
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      srcDoc={sandboxDoc}
      style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
      title="Artifact Sandbox"
    />
  );
}
