/**
 * Export an artifact as a self-contained HTML file.
 *
 * For JSX/TSX: inlines vendor UMD scripts + Tailwind CDN + transformed code.
 * For HTML/SVG/Markdown/Mermaid: wraps in a minimal HTML shell.
 */

import { transformArtifact } from '../runtime/transform';
import { loadVendorScripts } from '../runtime/sandbox';
import type { Artifact } from './artifact-store';

export async function exportAsHtml(artifact: Artifact): Promise<string> {
  switch (artifact.kind) {
    case 'jsx':
    case 'tsx': {
      const loader = artifact.kind === 'tsx' ? 'tsx' : 'jsx';
      const transformed = await transformArtifact(artifact.source, loader);
      const vendorHtml = await loadVendorScripts();

      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(artifact.title)}</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<style>
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
  #root { min-height: 100vh; }
</style>
${vendorHtml}
</head>
<body>
<div id="root"></div>
<script>
${transformed}
<\/script>
</body>
</html>`;
    }

    case 'html':
      return artifact.source;

    case 'svg':
      return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(artifact.title)}</title>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc}</style>
</head><body>${artifact.source}</body></html>`;

    case 'md': {
      const { marked } = await import('marked');
      const rendered = await marked.parse(artifact.source);
      return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(artifact.title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:32px 24px;line-height:1.6;color:#1e293b}
pre{background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;overflow-x:auto}
code{background:#f1f5f9;padding:0.2em 0.4em;border-radius:4px;font-size:0.9em}
pre code{background:none;padding:0;color:inherit}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #e2e8f0;padding:8px 12px}
blockquote{border-left:4px solid #3b82f6;margin:1em 0;padding:0.5em 1em;color:#475569;background:#f8fafc}</style>
</head><body>${rendered}</body></html>`;
    }

    case 'mermaid':
      return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(artifact.title)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc}</style>
</head><body><pre class="mermaid">${escapeHtml(artifact.source)}</pre>
<script>mermaid.initialize({startOnLoad:true,theme:'neutral'})<\/script></body></html>`;

    default:
      throw new Error(`Cannot export artifact type: ${artifact.kind}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
