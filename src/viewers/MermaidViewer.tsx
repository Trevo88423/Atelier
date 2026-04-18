/**
 * Mermaid viewer — renders Mermaid diagrams via mermaid.js in a sandboxed iframe.
 */

import { useMemo } from 'react';

interface MermaidViewerProps {
  source: string;
}

export default function MermaidViewer({ source }: MermaidViewerProps) {
  const html = useMemo(() => {
    // Escape the source for embedding in HTML
    const escaped = source
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return `<!DOCTYPE html>
<html>
<head>
<style>
  body {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #f8fafc;
    font-family: system-ui, sans-serif;
  }
  #diagram { padding: 24px; }
  .error {
    color: #ef4444;
    padding: 24px;
    font-family: monospace;
    white-space: pre-wrap;
  }
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
</head>
<body>
<div id="diagram">
  <pre class="mermaid">${escaped}</pre>
</div>
<script>
  mermaid.initialize({
    startOnLoad: true,
    theme: 'neutral',
    securityLevel: 'strict',
  });
<\/script>
</body>
</html>`;
  }, [source]);

  return (
    <iframe
      sandbox="allow-scripts"
      srcDoc={html}
      style={{ width: '100%', height: '100%', border: 'none', background: '#f8fafc' }}
      title="Mermaid Diagram"
    />
  );
}
