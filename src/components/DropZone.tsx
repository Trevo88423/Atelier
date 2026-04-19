import { useCallback, useState, useEffect } from 'react';
import { listen, TauriEvent } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface DropZoneProps {
  onFileDrop: (source: string, filename: string) => void;
  children: React.ReactNode;
}

const SUPPORTED_EXTENSIONS = ['jsx', 'tsx', 'html', 'svg', 'md', 'mermaid'];

function isArtifactFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_EXTENSIONS.includes(ext);
}

export default function DropZone({ onFileDrop, children }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  // Tauri native drag-drop events (file paths from OS)
  useEffect(() => {
    const unlistenDrop = listen<{ paths: string[] }>(TauriEvent.DRAG_DROP, async (event) => {
      setIsDragOver(false);
      for (const filePath of event.payload.paths) {
        const fileName = filePath.split(/[\\/]/).pop() || '';
        if (!isArtifactFile(fileName)) continue;
        try {
          const source = await invoke<string>('read_file', { path: filePath });
          onFileDrop(source, fileName);
        } catch (err) {
          console.warn('[dropzone] Failed to read dropped file:', err);
        }
        break; // Only handle first supported file
      }
    });

    const unlistenOver = listen(TauriEvent.DRAG_OVER, () => setIsDragOver(true));
    const unlistenLeave = listen(TauriEvent.DRAG_LEAVE, () => setIsDragOver(false));

    return () => {
      unlistenDrop.then(fn => fn());
      unlistenOver.then(fn => fn());
      unlistenLeave.then(fn => fn());
    };
  }, [onFileDrop]);

  // Browser fallback (for dev mode)
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!isArtifactFile(file.name)) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onFileDrop(reader.result, file.name);
      }
    };
    reader.readAsText(file);
  }, [onFileDrop]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      style={{ position: 'relative', flex: 1, overflow: 'hidden' }}
    >
      {children}
      {isDragOver && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(59, 130, 246, 0.12)',
          border: '3px dashed #3b82f6',
          borderRadius: '12px',
          margin: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
        }}>
          <div style={{ fontSize: '18px', color: '#3b82f6', fontWeight: 500 }}>
            Drop artifact to import
          </div>
        </div>
      )}
    </div>
  );
}
