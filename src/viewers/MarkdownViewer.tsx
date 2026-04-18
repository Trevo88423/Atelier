/**
 * Markdown viewer — renders Markdown with GFM and syntax highlighting.
 */

import { useMemo } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';

// Configure marked with highlight.js for code blocks
marked.setOptions({
  highlight(code: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
  gfm: true,
  breaks: true,
} as any);

interface MarkdownViewerProps {
  source: string;
}

const MARKDOWN_STYLES = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    line-height: 1.6;
    color: #1e293b;
    max-width: 800px;
    margin: 0 auto;
    padding: 32px 24px;
  }
  h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; }
  h1 { font-size: 2em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3em; }
  p { margin: 0.8em 0; }
  a { color: #3b82f6; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code {
    background: #f1f5f9;
    padding: 0.2em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: 'SF Mono', Monaco, Consolas, monospace;
  }
  pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    line-height: 1.5;
  }
  pre code { background: none; padding: 0; color: inherit; }
  blockquote {
    border-left: 4px solid #3b82f6;
    margin: 1em 0;
    padding: 0.5em 1em;
    color: #475569;
    background: #f8fafc;
    border-radius: 0 4px 4px 0;
  }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; }
  img { max-width: 100%; border-radius: 8px; }
  ul, ol { padding-left: 1.5em; }
  li { margin: 0.3em 0; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 2em 0; }
  .hljs-keyword, .hljs-selector-tag { color: #c084fc; }
  .hljs-string, .hljs-attr { color: #86efac; }
  .hljs-comment { color: #64748b; }
  .hljs-number { color: #fbbf24; }
  .hljs-built_in { color: #67e8f9; }
  .hljs-function .hljs-title { color: #93c5fd; }
`;

export default function MarkdownViewer({ source }: MarkdownViewerProps) {
  const html = useMemo(() => {
    const rendered = marked.parse(source);
    return `<!DOCTYPE html>
<html><head><style>${MARKDOWN_STYLES}</style></head>
<body>${rendered}</body></html>`;
  }, [source]);

  return (
    <iframe
      sandbox="allow-scripts"
      srcDoc={html}
      style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
      title="Markdown Artifact"
    />
  );
}
