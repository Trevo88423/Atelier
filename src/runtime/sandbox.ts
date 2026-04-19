/**
 * Sandbox document generator.
 *
 * Builds a complete HTML document string for use as iframe `srcdoc`.
 * Everything is inlined — no external fetches needed from the opaque origin.
 *
 * Contents:
 * - Tailwind Play CDN script (JIT CSS generation)
 * - Vendor UMD scripts (React, ReactDOM, etc.) assigned to window globals
 * - Boot script (storage shim, link interception, postMessage bridge)
 * - Transformed artifact code with mount logic
 */

/**
 * Maps import specifiers to their vendor UMD filename.
 * Core React files are always loaded; others are loaded on demand.
 */
const SPECIFIER_TO_FILE: Record<string, string> = {
  'react':              'react.umd.js',
  'react/jsx-runtime':  'react-jsx-runtime.umd.js',
  'react-dom':          'react-dom.umd.js',
  'react-dom/client':   'react-dom.umd.js',
  'lucide-react':       'lucide-react.umd.js',
  'recharts':           'recharts.umd.js',
  'three':              'three.umd.js',
  'mathjs':             'mathjs.umd.js',
  'd3':                 'd3.umd.js',
  'chart.js':           'chart-js.umd.js',
  'chart.js/auto':      'chart-js.umd.js',
  'plotly':             'plotly-js-dist-min.umd.js',
  'plotly.js':          'plotly-js-dist-min.umd.js',
  'plotly.js-dist-min': 'plotly-js-dist-min.umd.js',
  'papaparse':          'papaparse.umd.js',
  'lodash':             'lodash.umd.js',
  'mammoth':            'mammoth.umd.js',
  'xlsx':               'xlsx.umd.js',
  'tone':               'tone.umd.js',
  'tone/build/Tone':    'tone.umd.js',
};

/** Core files always loaded (order matters) */
const CORE_FILES = [
  'react.umd.js',
  'react-jsx-runtime.umd.js',
  'react-dom.umd.js',
];

/** Cache of loaded vendor file contents */
const vendorFileCache = new Map<string, string>();

/**
 * Detect which vendor libraries an artifact source imports.
 * Returns the deduplicated set of vendor filenames needed.
 */
export function detectVendorImports(source: string): string[] {
  const needed = new Set<string>(CORE_FILES);

  // Match import statements: import ... from 'specifier'
  const importRegex = /import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(source)) !== null) {
    const specifier = match[1];
    const file = SPECIFIER_TO_FILE[specifier];
    if (file) needed.add(file);
  }

  // Also check for require('specifier') patterns
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(source)) !== null) {
    const specifier = match[1];
    const file = SPECIFIER_TO_FILE[specifier];
    if (file) needed.add(file);
  }

  return Array.from(needed);
}

/**
 * Load specific vendor UMD scripts by filename.
 * Results are cached individually so repeated loads are instant.
 */
async function loadVendorFiles(files: string[]): Promise<string> {
  const scripts: string[] = [];

  for (const file of files) {
    let code = vendorFileCache.get(file);
    if (code === undefined) {
      try {
        const resp = await fetch(`./vendor/${file}`);
        if (resp.ok) {
          code = await resp.text();
          vendorFileCache.set(file, code);
        }
      } catch {
        console.warn(`[sandbox] Failed to load vendor/${file}`);
      }
    }
    if (code) {
      scripts.push(`<script>/* ${file} */${code}</script>`);
    }
  }

  return scripts.join('\n');
}

/**
 * The boot script that runs inside the sandbox iframe.
 * Sets up:
 * - window.storage shim (postMessage RPC to host)
 * - External link interception (opens in OS browser)
 * - postMessage listener for RPC responses
 */
const BOOT_SCRIPT = `
(function() {
  var HOST = window.parent;
  var pending = new Map();
  var rpcId = 0;

  function rpc(method, params) {
    return new Promise(function(resolve, reject) {
      var id = ++rpcId;
      pending.set(id, { resolve: resolve, reject: reject });
      HOST.postMessage({ kind: 'rpc', id: id, method: method, params: params }, '*');
    });
  }

  // window.storage shim — matches Claude's artifact spec API
  window.storage = {
    get:    function(key, shared) { return rpc('storage.get',    { key: key, shared: !!shared }); },
    set:    function(key, value, shared) { return rpc('storage.set',    { key: key, value: value, shared: !!shared }); },
    delete: function(key, shared) { return rpc('storage.delete', { key: key, shared: !!shared }); },
    list:   function(prefix, shared) { return rpc('storage.list',   { prefix: prefix, shared: !!shared }); },
  };

  // Intercept external links — open in OS default browser
  document.addEventListener('click', function(e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (href && /^https?:\\/\\//.test(href)) {
      e.preventDefault();
      rpc('shell.open', { url: href });
    }
  });

  // Listen for RPC responses from the host
  window.addEventListener('message', function(ev) {
    var msg = ev.data;
    if (msg && msg.kind === 'rpc-result') {
      var p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) { p.reject(new Error(msg.error)); }
      else { p.resolve(msg.result); }
    }
  });

  // Signal readiness to host
  HOST.postMessage({ kind: 'ready' }, '*');
})();
`;

/**
 * Load vendor scripts needed for a given artifact source.
 * Exported for use by export-html.
 */
export async function loadVendorScriptsForSource(source: string): Promise<string> {
  const neededFiles = detectVendorImports(source);
  return loadVendorFiles(neededFiles);
}

/**
 * Build the complete sandbox HTML document.
 *
 * @param transformedCode - Artifact code after JSX compile + import rewriting + mount wrapping
 * @param artifactSource - Original source code, used to detect which vendor libs are needed
 * @returns Complete HTML string suitable for iframe srcdoc
 */
export async function buildSandboxDoc(transformedCode: string, artifactSource: string): Promise<string> {
  const neededFiles = detectVendorImports(artifactSource);
  const vendorHtml = await loadVendorFiles(neededFiles);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com"><\/script>
<style>
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
  #root { min-height: 100vh; }
</style>
${vendorHtml}
<script>${BOOT_SCRIPT}<\/script>
</head>
<body>
<div id="root"></div>
<script>
try {
${transformedCode}
} catch(err) {
  document.getElementById('root').innerHTML =
    '<div style="padding:2rem;color:#ef4444;font-family:monospace">' +
    '<h2 style="margin:0 0 1rem">Artifact Error</h2>' +
    '<pre style="white-space:pre-wrap;word-break:break-word">' + String(err) + '</pre></div>';
  window.parent.postMessage({ kind: 'error', message: String(err) }, '*');
}
<\/script>
</body>
</html>`;
}
