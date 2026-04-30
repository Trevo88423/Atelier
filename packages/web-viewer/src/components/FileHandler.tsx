/**
 * PWA File Handling consumer.
 *
 * When the PWA is launched by opening a file via the OS — Android Chrome's
 * "Open with" sheet, desktop file associations, the Files app — the file
 * is delivered via window.launchQueue. We read it and hand off to the same
 * path as drag-drop / Pair generator (openFileInViewer → IDB → /view).
 *
 * Companion to DropToOpen. Mounted globally so it works regardless of
 * which route the file-open lands on (with launch_handler.client_mode
 * "focus-existing" the launch can hit any existing route, not just
 * file_handlers.action).
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { openFileInViewer } from './DropToOpen';

interface LaunchParams {
  files: FileSystemFileHandle[];
}

interface LaunchQueue {
  setConsumer: (consumer: (params: LaunchParams) => void | Promise<void>) => void;
}

declare global {
  interface Window {
    launchQueue?: LaunchQueue;
  }
}

export default function FileHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!window.launchQueue) return;
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files || params.files.length === 0) return;
      try {
        const handle = params.files[0];
        const file = await handle.getFile();
        await openFileInViewer(file, navigate);
      } catch (err) {
        console.warn('[stele] launch handler failed:', err);
      }
    });
  }, [navigate]);

  return null;
}
