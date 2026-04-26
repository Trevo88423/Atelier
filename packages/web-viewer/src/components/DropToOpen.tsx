/**
 * Document-level drag-and-drop handler.
 *
 * Renders nothing visible until the user starts dragging a file over the
 * window — then a full-screen overlay invites them to drop. On drop, the
 * file is read into a blob URL and the viewer navigates to it. Same handoff
 * mechanism as the /pair generator — works for any .stele / .jsx / .tsx file.
 *
 * Lives inside <BrowserRouter> so it can call useNavigate. Document-level
 * listeners mean it works on every route (Landing, Library, Settings, Pair).
 */

import { useEffect, useState } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';

export const ACCEPTED_EXTS = ['.stele', '.jsx', '.tsx', '.html', '.htm', '.svg', '.md', '.mermaid'];
export const ACCEPTED_INPUT_ATTR = ACCEPTED_EXTS.join(',') + ',text/plain';
const MAX_FILE_BYTES = 1 * 1024 * 1024; // 1 MB — generous for any single artifact

function looksLikeArtifact(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTS.some((ext) => name.endsWith(ext));
}

/**
 * Read a local file, hand it to the Viewer as a blob URL. Shared by both the
 * document-level drop handler and any explicit file pickers.
 */
export async function openFileInViewer(file: File, navigate: NavigateFunction): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!looksLikeArtifact(file)) {
    return { ok: false, error: `That file (${file.name}) doesn't look like a Stele artifact. Expected: ${ACCEPTED_EXTS.join(', ')}` };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: `That file is over ${MAX_FILE_BYTES / 1024} KB — Stele artifacts are usually much smaller.` };
  }
  try {
    const text = await file.text();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    navigate(`/view?src=${encodeURIComponent(url)}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export default function DropToOpen() {
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Track enter/leave count because dragenter/leave fire on every child.
    let depth = 0;

    const onEnter = (e: DragEvent) => {
      // Only react if the drag actually contains files.
      const types = Array.from(e.dataTransfer?.types ?? []);
      if (!types.includes('Files')) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };

    const onOver = (e: DragEvent) => {
      const types = Array.from(e.dataTransfer?.types ?? []);
      if (!types.includes('Files')) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const onLeave = (e: DragEvent) => {
      const types = Array.from(e.dataTransfer?.types ?? []);
      if (!types.includes('Files')) return;
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const result = await openFileInViewer(file, navigate);
      if (!result.ok) setError(result.error);
    };

    document.addEventListener('dragenter', onEnter);
    document.addEventListener('dragover', onOver);
    document.addEventListener('dragleave', onLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragenter', onEnter);
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('dragleave', onLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, [navigate]);

  // Auto-clear error after a few seconds.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <>
      {dragging && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.92)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#e2e8f0',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          pointerEvents: 'none',
        }}>
          <div style={{
            border: '3px dashed #3b82f6',
            borderRadius: 16,
            padding: '60px 80px',
            textAlign: 'center',
            background: 'rgba(30, 58, 138, 0.2)',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>↓</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Drop to open</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              Stele runs the artifact locally — nothing uploaded.
            </div>
          </div>
        </div>
      )}
      {error && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9998,
          padding: '12px 20px',
          background: '#1e1215',
          border: '1px solid #7f1d1d',
          borderRadius: 8,
          color: '#fca5a5',
          fontSize: 13,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          maxWidth: 480,
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        }}>
          {error}
        </div>
      )}
    </>
  );
}
