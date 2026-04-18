# Atelier — Claude Artifact Player

A desktop app for running, organising, and sharing Claude artifacts locally. Drag a `.jsx` file onto the window and it plays. No Node, no npm, no config.

Working name: **Atelier**. Alternates: Playback, Canvas, Workbench, Artifact Studio. Atelier reads as calm and professional, translates well, and the domain is available.

---

## Why this exists

Claude generates small apps constantly — calculators, trackers, dashboards, converters, games. They live inside chat windows and die there. The download button gives you a single `.jsx` file with no way to run it unless you know what `npm run dev` means.

Existing open-source runners (claude-artifact-runner, claude-artifacts-runner, Claude-React-Jumpstart) are Vite project templates for developers. There is no installable `.dmg` / `.exe` / `.AppImage` that a non-technical Claude user can double-click.

That's the gap Atelier fills. Think VLC for Claude artifacts: a free, installable player that works with zero setup, plus a library that turns one-off generations into a permanent collection of mini-apps.

---

## Product scope

**Free tier (the player).**
- Drag and drop any artifact file to render it.
- Library view with search, tags, and pinning.
- Watched folders — point Atelier at `~/Downloads` and new artifacts auto-import.
- Export to single-file HTML (works offline, opens with a double-click).
- Pin an artifact as a standalone app with its own dock icon.
- Persistent per-artifact storage (the `window.storage` API from the artifact spec, backed by SQLite).

**Premium tier (cloud and sharing).**
- Cloud sync across devices via Supabase.
- One-click Share to Web — hosted URL on `*.atelier.app` or a custom domain.
- Team libraries with shared artifacts.
- Version history per artifact.
- BYO API key for artifacts that call the Anthropic API.

**Out of scope for v1:** artifact editing, generation, authoring. Atelier plays artifacts, it doesn't make them. That's Claude's job.

---

## Supported file types

| Extension | Renderer | Notes |
|-----------|----------|-------|
| `.jsx`, `.tsx` | React viewer | Transformed via esbuild-wasm, rendered in sandboxed iframe |
| `.html` | HTML viewer | Rendered directly in sandboxed iframe |
| `.svg` | SVG viewer | Inlined with theme-aware CSS variables |
| `.md` | Markdown viewer | Rendered via react-markdown with GFM + syntax highlighting |
| `.mermaid` | Mermaid viewer | Rendered via mermaid.js |

Type dispatch happens in `viewers/Viewer.tsx` by file extension. Ambiguous cases (a `.html` that's actually a React artifact in disguise) are detectable by content sniffing but fall back to extension.

---

## Architecture

Four layers, top to bottom:

1. **Desktop shell (Tauri + Rust)** — filesystem, file associations, watched folders, SQLite, auto-update, OS integration.
2. **React UI** — library, drop zone, viewer chrome, settings.
3. **Artifact runtime** — esbuild-wasm transform + vendor inlining + Tailwind JIT. Takes raw artifact source, builds a self-contained sandbox document.
4. **Sandboxed iframe** — the artifact actually runs here. Isolated from host. Communicates via `postMessage`. Hosts the `window.storage` shim.

Vendored dependencies (React 18, lucide-react@0.383.0, recharts, three@r128, shadcn/ui, mathjs, d3, Plotly, Chart.js, Tone, Papaparse, SheetJS, mammoth, lodash) ship with the app and are **inlined into the sandbox document** as UMD/global scripts. Import maps cannot be used because the sandboxed iframe (no `allow-same-origin`) gets an opaque origin and cannot fetch resources from the host origin. Instead, vendor libs are injected as `<script>` tags that assign to globals (e.g., `window.React`), and the esbuild transform rewrites bare imports to reference these globals.

Tailwind CSS is handled via the **Tailwind Play CDN script** (~100KB) embedded in the sandbox document. It JIT-compiles only the CSS classes actually used by each artifact via MutationObserver, avoiding the need to ship a full 15-20MB safelisted stylesheet.

---

## Tech stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Shell | Tauri 2.x | ~10MB bundles vs ~100MB for Electron. Rust backend. Native webview. Built-in updater. |
| UI framework | React 18 + TypeScript | Matches the artifact runtime. Familiar tooling. |
| Build | Vite | Standard Tauri template. HMR in dev. |
| Styling | Tailwind + shadcn/ui | Matches what artifacts themselves use — consistent look. |
| Runtime transform | esbuild-wasm | Fast enough (~50ms for a typical artifact). Runs in the webview. Rewrites bare imports to globals. v2 can swap for a Rust-native SWC sidecar if needed. |
| Tailwind (sandbox) | Tailwind Play CDN script | ~100KB JIT in the browser. Generates only used CSS via MutationObserver. Avoids shipping a 15-20MB safelisted stylesheet. |
| Database | SQLite via `tauri-plugin-sql` | Zero-config. Single file per user. |
| File watching | `notify` crate (Rust) | Rock-solid cross-platform file watcher. |
| Auto-update | `tauri-plugin-updater` | Signed updates from GitHub releases. |
| Sandboxing | iframe `sandbox="allow-scripts"` + `srcdoc` | Native browser isolation. No `allow-same-origin`. All deps inlined into srcdoc — no import maps (opaque origin can't fetch from host). |
| Bridge | `postMessage` | Standard, auditable, no magic. |
| Package manager | pnpm | Faster installs, less disk. |

---

## Repository structure

```
atelier/
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── library.rs            # SQLite CRUD
│   │   ├── watcher.rs            # Folder watching (notify crate)
│   │   ├── file_assoc.rs         # Open-with handlers
│   │   ├── export.rs             # Single-file HTML export
│   │   └── storage.rs            # window.storage backing
│   ├── migrations/
│   │   └── 001_initial.sql
│   ├── icons/
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/                          # React renderer
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/
│   │   ├── Library.tsx
│   │   ├── Viewer.tsx
│   │   └── Settings.tsx
│   ├── components/
│   │   ├── DropZone.tsx
│   │   ├── LibraryGrid.tsx
│   │   ├── ArtifactCard.tsx
│   │   ├── Sidebar.tsx
│   │   └── EmptyState.tsx
│   ├── viewers/
│   │   ├── index.tsx             # Type dispatch
│   │   ├── JsxViewer.tsx         # React artifacts
│   │   ├── HtmlViewer.tsx
│   │   ├── SvgViewer.tsx
│   │   ├── MarkdownViewer.tsx
│   │   └── MermaidViewer.tsx
│   ├── runtime/
│   │   ├── transform.ts          # esbuild-wasm wrapper, rewrites imports to globals
│   │   ├── vendor-inject.ts      # Builds <script> tags from vendor bundles for srcdoc
│   │   ├── sandbox.ts            # Generates the full srcdoc HTML string
│   │   └── bridge.ts             # postMessage host side
│   ├── lib/
│   │   ├── tauri.ts              # Typed command wrappers
│   │   ├── hash.ts               # SHA-1 for artifact IDs
│   │   └── thumbnail.ts          # First-paint screenshot
│   └── styles/
│       └── globals.css
│
├── vendor/                       # Generated — git-ignored
│   ├── react.umd.js              # Assigns window.React
│   ├── react-dom.umd.js          # Assigns window.ReactDOM
│   ├── lucide-react.umd.js
│   ├── recharts.umd.js
│   ├── three.umd.js              # r128 specifically
│   ├── mathjs.umd.js
│   ├── d3.umd.js
│   ├── plotly.umd.js
│   ├── chart.umd.js
│   ├── tone.umd.js
│   ├── papaparse.umd.js
│   ├── sheetjs.umd.js
│   ├── mammoth.umd.js
│   ├── lodash.umd.js
│   └── shadcn/                   # Per-component UMD bundles
│       ├── button.umd.js
│       ├── card.umd.js
│       └── ...
│
├── scripts/
│   ├── prebuild-deps.ts          # Generates vendor/ from spec.json
│   └── spec.json                 # Canonical dep manifest
│
├── public/
│   └── sandbox-boot.js
│
├── package.json
├── pnpm-lock.yaml
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

## Data model

SQLite schema in `src-tauri/migrations/001_initial.sql`:

```sql
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,              -- SHA-1 of content on import
  title TEXT NOT NULL,
  kind TEXT NOT NULL,               -- 'jsx' | 'tsx' | 'html' | 'svg' | 'md' | 'mermaid'
  source_path TEXT NOT NULL,        -- Path inside app data dir
  original_name TEXT,               -- Filename at import time
  imported_at INTEGER NOT NULL,
  last_opened_at INTEGER,
  open_count INTEGER DEFAULT 0,
  pinned INTEGER DEFAULT 0,         -- 0 | 1
  thumbnail_path TEXT,
  size_bytes INTEGER NOT NULL,
  tags TEXT                         -- JSON array
);

CREATE INDEX idx_artifacts_last_opened ON artifacts(last_opened_at DESC);
CREATE INDEX idx_artifacts_pinned ON artifacts(pinned DESC, last_opened_at DESC);

CREATE TABLE storage (
  artifact_id TEXT NOT NULL,
  scope TEXT NOT NULL,              -- 'private' | 'shared'
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (artifact_id, scope, key),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
);

CREATE TABLE watched_folders (
  path TEXT PRIMARY KEY,
  added_at INTEGER NOT NULL,
  enabled INTEGER DEFAULT 1
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Artifacts live on disk at `{app_data}/artifacts/{id}/source.{ext}`. App data dir resolves to:

- macOS: `~/Library/Application Support/com.atelier.app/`
- Windows: `%APPDATA%\com.atelier.app\`
- Linux: `~/.local/share/com.atelier.app/`

---

## The hard parts — code sketches

### 1. JSX transform (runtime/transform.ts)

The transform has two jobs: compile JSX syntax via esbuild-wasm, then rewrite bare `import` statements to reference the globals assigned by the inlined vendor UMD scripts. This is necessary because the sandboxed iframe has no module loader — everything runs as classic scripts.

```ts
import { initialize, transform as esbuildTransform } from 'esbuild-wasm';
import { VENDOR_GLOBALS, SHADCN_COMPONENTS } from './vendor-inject';

let initPromise: Promise<void> | null = null;

async function ensureInit() {
  if (!initPromise) {
    initPromise = initialize({
      wasmURL: '/esbuild.wasm',
      worker: true,
    });
  }
  return initPromise;
}

/**
 * Rewrites `import X from 'pkg'` → `const X = window.Pkg;`
 * Handles: default imports, named imports, namespace imports.
 */
function rewriteImportsToGlobals(code: string): string {
  // Build a combined map of all known imports → globals
  const allGlobals: Record<string, string> = { ...VENDOR_GLOBALS };
  for (const name of SHADCN_COMPONENTS) {
    allGlobals[`@/components/ui/${name}`] = `__shadcn_${name.replace(/-/g, '_')}`;
  }

  // Replace import statements with global references
  return code.replace(
    /import\s+(.+?)\s+from\s+['"](.+?)['"]\s*;?/g,
    (match, imports, specifier) => {
      const global = allGlobals[specifier];
      if (!global) return match; // Unknown import — leave as-is (will error at runtime)

      const trimmed = imports.trim();

      // `import * as X from 'pkg'`
      if (trimmed.startsWith('* as ')) {
        const name = trimmed.slice(5).trim();
        return `const ${name} = window.${global};`;
      }
      // `import { a, b as c } from 'pkg'`
      if (trimmed.startsWith('{')) {
        const inner = trimmed.slice(1, -1);
        const parts = inner.split(',').map(p => {
          const [orig, alias] = p.trim().split(/\s+as\s+/);
          return alias ? `${alias} = window.${global}.${orig}` : `${orig} = window.${global}.${orig}`;
        });
        return `const { ${parts.join(', ')} } = { ${parts.map(p => p.split(' = ')[0] + ': ' + p.split(' = ')[1]).join(', ')} };`;
      }
      // `import X from 'pkg'` (default)
      return `const ${trimmed} = window.${global}.default || window.${global};`;
    }
  );
}

export async function transformArtifact(
  source: string,
  loader: 'jsx' | 'tsx'
): Promise<string> {
  await ensureInit();

  // Step 1: Compile JSX/TSX → JS
  const result = await esbuildTransform(source, {
    loader,
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    jsxImportSource: 'react',
  });

  // Step 2: Rewrite imports to globals
  let code = rewriteImportsToGlobals(result.code);

  // Step 3: Append mount logic with export fallback chain.
  // Tries: default export → named App → first exported function → self-mount.
  code += `\n;(function() {
    const _exports = typeof __exports !== 'undefined' ? __exports : {};
    const Component = _exports.default || _exports.App
      || Object.values(_exports).find(v => typeof v === 'function');
    if (Component && window.React && window.ReactDOM) {
      const root = window.ReactDOM.createRoot(document.getElementById('root'));
      root.render(window.React.createElement(Component));
      window.parent.postMessage({ kind: 'mounted' }, '*');
    } else {
      window.parent.postMessage({ kind: 'error', message: 'No renderable component found' }, '*');
    }
  })();`;

  return code;
}
```

### 2. Vendor injection (runtime/vendor-inject.ts)

Import maps cannot work in a sandboxed iframe without `allow-same-origin` — the opaque origin blocks all fetches to the host. Instead, vendor libraries are loaded as UMD scripts that assign to globals, and the esbuild transform rewrites bare imports to reference those globals.

```ts
// Maps bare import specifiers → global variable names.
// The prebuild script produces UMD bundles that assign these globals.
export const VENDOR_GLOBALS: Record<string, string> = {
  'react':            'React',
  'react/jsx-runtime':'_jsx_runtime',  // shimmed from React
  'react-dom':        'ReactDOM',
  'react-dom/client': 'ReactDOM',
  'lucide-react':     'lucideReact',
  'recharts':         'Recharts',
  'three':            'THREE',
  'mathjs':           'mathjs',
  'd3':               'd3',
  'plotly':           'Plotly',
  'chart.js':         'Chart',
  'tone':             'Tone',
  'papaparse':        'Papa',
  'xlsx':             'XLSX',
  'mammoth':          'mammoth',
  'lodash':           '_',
};

// shadcn/ui components — each is a separate UMD bundle
export const SHADCN_COMPONENTS = [
  'alert', 'badge', 'button', 'card', 'checkbox', 'dialog',
  'input', 'label', 'radio-group', 'select', 'separator',
  'slider', 'switch', 'tabs', 'textarea', 'toast', 'tooltip',
];

/**
 * Reads vendor UMD files from disk and returns them as inline <script> tags.
 * Called at app startup; results are cached in memory.
 */
export async function loadVendorScripts(): Promise<string[]> {
  const scripts: string[] = [];
  for (const [pkg] of Object.entries(VENDOR_GLOBALS)) {
    const filename = pkg.replace(/\//g, '-') + '.umd.js';
    const content = await readVendorFile(filename);
    if (content) scripts.push(`<script>${content}</script>`);
  }
  for (const name of SHADCN_COMPONENTS) {
    const content = await readVendorFile(`shadcn/${name}.umd.js`);
    if (content) scripts.push(`<script>${content}</script>`);
  }
  return scripts;
}
```

### 3. Sandbox document generation (runtime/sandbox.ts)

The sandbox document is built as a string and set via `srcdoc` on the iframe. Everything is inlined — no external fetches required from the opaque origin.

```ts
import { loadVendorScripts } from './vendor-inject';

let cachedVendorHtml: string | null = null;

async function getVendorHtml(): Promise<string> {
  if (!cachedVendorHtml) {
    const scripts = await loadVendorScripts();
    cachedVendorHtml = scripts.join('\n');
  }
  return cachedVendorHtml;
}

export async function buildSandboxDoc(transformedCode: string): Promise<string> {
  const vendorHtml = await getVendorHtml();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    #root { min-height: 100vh; }
  </style>
  ${vendorHtml}
  <script>${BOOT_SCRIPT}</script>
</head>
<body>
  <div id="root"></div>
  <script>${transformedCode}</script>
</body>
</html>`;
}
```

Note: The Tailwind Play CDN script (~100KB) runs a JIT compiler inside the iframe via MutationObserver. It generates only the CSS classes actually used by the artifact. For offline use, a self-hosted copy of the script is bundled in `vendor/tailwindcss-cdn.js` and used instead.

### 4. Sandbox boot script (inlined in sandbox.ts)

```js
// BOOT_SCRIPT — inlined into the srcdoc. Sets up storage shim and mounts the artifact.
const BOOT_SCRIPT = `
(function () {
  const HOST = window.parent;
  const pending = new Map();
  let rpcId = 0;

  function rpc(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++rpcId;
      pending.set(id, { resolve, reject });
      HOST.postMessage({ kind: 'rpc', id, method, params }, '*');
    });
  }

  // window.storage shim — matches the artifact spec API.
  window.storage = {
    get:    (key, shared = false) => rpc('storage.get',    { key, shared }),
    set:    (key, value, shared = false) => rpc('storage.set',    { key, value, shared }),
    delete: (key, shared = false) => rpc('storage.delete', { key, shared }),
    list:   (prefix, shared = false) => rpc('storage.list',   { prefix, shared }),
  };

  // Intercept external navigation — open in OS default browser.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href && /^https?:\\/\\//.test(href)) {
      e.preventDefault();
      rpc('shell.open', { url: href });
    }
  });

  window.addEventListener('message', (ev) => {
    const msg = ev.data;
    if (msg.kind === 'rpc-result') {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result);
    }
  });

  HOST.postMessage({ kind: 'ready' }, '*');
})();
`;

### 5. Host bridge (runtime/bridge.ts)

```ts
import { invoke } from '@tauri-apps/api/core';
import { open as openShell } from '@tauri-apps/plugin-shell';

export function attachBridge(iframe: HTMLIFrameElement, artifactId: string) {
  const handler = async (ev: MessageEvent) => {
    if (ev.source !== iframe.contentWindow) return;
    const msg = ev.data;

    if (msg.kind !== 'rpc') return;
    const reply = (result: unknown, error?: string) => {
      iframe.contentWindow!.postMessage(
        { kind: 'rpc-result', id: msg.id, result, error },
        '*'
      );
    };

    try {
      switch (msg.method) {
        case 'storage.get':
          reply(await invoke('storage_get', { artifactId, ...msg.params }));
          break;
        case 'storage.set':
          reply(await invoke('storage_set', { artifactId, ...msg.params }));
          break;
        case 'storage.delete':
          reply(await invoke('storage_delete', { artifactId, ...msg.params }));
          break;
        case 'storage.list':
          reply(await invoke('storage_list', { artifactId, ...msg.params }));
          break;
        case 'shell.open':
          await openShell(msg.params.url);
          reply(null);
          break;
        default:
          reply(null, `Unknown method: ${msg.method}`);
      }
    } catch (err) {
      reply(null, String(err));
    }
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
```

### 6. Storage backend (src-tauri/src/storage.rs)

```rust
use tauri::State;
use sqlx::SqlitePool;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct StorageValue {
    key: String,
    value: String,
    shared: bool,
}

#[tauri::command]
pub async fn storage_get(
    pool: State<'_, SqlitePool>,
    artifact_id: String,
    key: String,
    shared: bool,
) -> Result<Option<StorageValue>, String> {
    let scope = if shared { "shared" } else { "private" };
    let row = sqlx::query_as::<_, (String,)>(
        "SELECT value FROM storage WHERE artifact_id = ? AND scope = ? AND key = ?"
    )
    .bind(&artifact_id)
    .bind(scope)
    .bind(&key)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|(value,)| StorageValue { key, value, shared }))
}

// storage_set, storage_delete, storage_list follow the same pattern.
```

### 7. Single-file HTML export (src-tauri/src/export.rs)

Inlines transformed JS, vendor UMD scripts, and the Tailwind CDN script into one self-contained HTML file. Result opens with a double-click, works offline, can be emailed. Vendor files are read from disk at export time (not embedded in the binary via `include_str!`).

```rust
#[tauri::command]
pub async fn export_html(
    app_handle: tauri::AppHandle,
    artifact_id: String,
    dest: String,
) -> Result<(), String> {
    let source = load_artifact_source(&artifact_id).await?;
    let compiled = transform_to_js(&source).await?;

    // Read vendor UMD files from the app's resource directory
    let vendor_dir = app_handle.path().resource_dir()
        .map_err(|e| e.to_string())?.join("vendor");
    let react = std::fs::read_to_string(vendor_dir.join("react.umd.js"))
        .map_err(|e| e.to_string())?;
    let react_dom = std::fs::read_to_string(vendor_dir.join("react-dom.umd.js"))
        .map_err(|e| e.to_string())?;
    // ... read only the vendor files this artifact actually imports
    let tailwind_cdn = std::fs::read_to_string(vendor_dir.join("tailwindcss-cdn.js"))
        .map_err(|e| e.to_string())?;

    let html = format!(r##"<!DOCTYPE html>
<html><head><meta charset="utf-8">
<script>{tailwind_cdn}</script>
<script>{react}</script>
<script>{react_dom}</script>
<style>body {{ margin: 0; font-family: system-ui, sans-serif; }} #root {{ min-height: 100vh; }}</style>
</head><body><div id="root"></div><script>{compiled}</script></body></html>"##,
        tailwind_cdn = tailwind_cdn,
        react = react,
        react_dom = react_dom,
        compiled = compiled,
    );

    std::fs::write(&dest, html).map_err(|e| e.to_string())?;
    Ok(())
}
```

### 8. Pin-as-app (Tauri multi-window)

```ts
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

export function pinAsApp(artifactId: string, title: string) {
  const win = new WebviewWindow(`artifact-${artifactId}`, {
    url: `/viewer/${artifactId}?mode=pinned`,
    title,
    width: 900,
    height: 700,
    resizable: true,
    decorations: true,
  });
  win.once('tauri://error', (e) => console.error('pin-as-app failed', e));
}
```

The pinned window uses the same viewer route as the main library but without the sidebar chrome. Dock/taskbar icon is set per window. Can be saved as a macOS `.app` wrapper via Tauri's future `window-to-app` feature or shipped as a workaround using Platypus scripts.

---

## Vendor bundle pipeline

`scripts/prebuild-deps.ts` reads `spec.json` and writes ESM bundles to `vendor/`. Runs pre-build locally and in CI.

```ts
// scripts/spec.json
{
  "react":        "18.3.1",
  "react-dom":    "18.3.1",
  "lucide-react": "0.383.0",
  "recharts":     "2.12.7",
  "three":        "0.128.0",
  "mathjs":       "13.0.0",
  "d3":           "7.9.0",
  "plotly.js":    "2.35.2",
  "chart.js":     "4.4.4",
  "tone":         "15.0.4",
  "papaparse":    "5.4.1",
  "xlsx":         "0.18.5",
  "mammoth":      "1.8.0",
  "lodash":       "4.17.21"
}
```

The script uses esbuild to produce **UMD bundles** for each package. Each bundle assigns its exports to a known global (e.g., `window.React`, `window.ReactDOM`, `window._`). React is externalized in all non-React bundles so they share the same instance.

Tailwind CSS is **not** precompiled. Instead, a self-hosted copy of the Tailwind Play CDN script (`tailwindcss-cdn.js`, ~100KB) is bundled in `vendor/`. It runs a JIT compiler inside the sandbox iframe, generating only the CSS classes used by each artifact. This avoids the 15-20MB output of a full safelist build.

Drift from Anthropic's spec is monitored monthly via a scheduled GitHub Action that diffs `spec.json` against a manually-maintained reference. There is no public canonical manifest from Anthropic, so this requires periodic manual verification.

---

## Phased build plan

### Phase 1 — Core loop (weeks 1–3)

**Goal:** Drop a `.jsx`, it plays. Library persists. Three platforms.

Tasks:

1. Tauri scaffold with React + TypeScript + pnpm
2. SQLite via `tauri-plugin-sql`, run initial migration on startup
3. Vendor bundle pipeline — UMD builds for React, ReactDOM, lucide-react, recharts; self-hosted Tailwind CDN script
4. esbuild-wasm transform with import-to-global rewriting
5. Sandboxed iframe via `srcdoc` with inlined vendor scripts, Tailwind CDN, boot script, and export fallback chain
6. postMessage bridge for storage RPC
7. DropZone component wired to file import (writes to app data dir, hashes, inserts row)
8. LibraryGrid with cards, recent-first sort
9. Viewer route — load source, transform, mount
10. File associations registered on install for `.jsx` and `.tsx`
11. GitHub Actions: build macOS, Windows, Linux installers, upload to releases

Ship as **0.1.0-alpha**. Hand to five friends. Collect bug reports.

### Phase 2 — Polish and differentiation (weeks 4–7)

1. HTML, SVG, Markdown, Mermaid viewers
2. Thumbnail generation — screenshot first paint, cache PNG
3. Search, tags, pinning
4. Watched folders (`notify` crate, debounced handler)
5. Pin-as-app with dedicated windows
6. Export to single-file HTML
7. Auto-update via `tauri-plugin-updater`
8. Settings page (watched folders, default file associations, theme)
9. Error boundary in the viewer with a readable stack trace
10. "Reopen last artifact" on launch

Ship as **1.0**. Announce publicly. Product Hunt, Hacker News, r/ClaudeAI.

### Phase 3 — Monetisation (weeks 8+)

1. Supabase auth (Google, GitHub, email magic link)
2. Cloud sync — artifact content + metadata + storage rows
3. Share to Web — bundled HTML uploaded to Cloudflare R2, short URL on `*.atelier.app`
4. Team libraries (shared workspaces)
5. Version history per artifact
6. MCP proxy sidecar + OS keychain API key storage for artifacts that call the Anthropic API
7. Stripe integration, paywall premium features

---

## Distribution

**macOS.** Tauri produces `.dmg` and `.app` bundles. Signed with an Apple Developer certificate ($99/year), notarised via `notarytool`. Distributed through atelier.app and the GitHub releases page. Optional Mac App Store submission in phase 3.

**Windows.** `.msi` installer signed with a code-signing certificate (SignPath free tier is fine, or a paid cert for fewer SmartScreen warnings). Auto-associate `.jsx` and `.tsx` extensions at install.

**Linux.** `.AppImage`, `.deb`, and `.rpm` via Tauri's built-in bundler. Optional Flathub submission.

Auto-update flow: app pings `https://updates.atelier.app/latest.json` on launch, downloads signed delta if new version available, installs on next restart. All three platforms supported by `tauri-plugin-updater` out of the box.

---

## Landing page and domain

- `atelier.app` — primary. Alt: `playartifact.app`, `atelier.claude.plus`.
- Landing is a single-page marketing site. Hero: drop-zone animation with a real artifact rendering. Below: feature grid, download buttons, GitHub link.
- Built in Next.js or Astro on Cloudflare Pages.
- Download URLs point at GitHub release assets (don't re-host binaries).

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Webview parity — artifacts render slightly differently on WebKit vs WebView2 vs WebKitGTK | PostCSS autoprefixer on Tailwind bundle; manual test matrix per release; Electron fallback is viable if ever critical |
| Spec drift — Anthropic updates dep versions | Monthly CI job diffs `spec.json` against canonical manifest; vendor rebuild is scripted |
| Artifact uses a dep not in the vendor bundle | Fallback to esm.sh via network (opt-in per artifact); show a "missing dependency" UI |
| Sandbox escape | `sandbox="allow-scripts"` without `allow-same-origin` is enforced by the browser — no cross-origin reads possible. All deps inlined via `srcdoc`, so no fetches required from the opaque origin. Storage access mediated by postMessage RPC with per-artifact scoping |
| Large artifacts (heavy deps like Three.js scenes) perf | Vendor UMD bundles are cached in memory after first load; only deps actually imported by the artifact are injected into the srcdoc. First transform ~50ms, subsequent <10ms with cached esbuild instance |
| Users try to drop a non-artifact `.jsx` from a random GitHub repo | Export fallback chain handles missing `default` exports gracefully. Error boundary in the viewer shows a readable stack trace. No security concern — iframe sandbox handles isolation |
| Tailwind in the sandbox | Tailwind Play CDN script (~100KB) runs JIT in the iframe. For offline use, a self-hosted copy ships in `vendor/`. Generates <100KB of CSS per artifact. No 15-20MB safelist build |
| Opaque origin blocks fetches from sandbox | All vendor deps and the boot script are inlined into `srcdoc`. No import maps, no external fetches needed for core rendering. Artifacts that `fetch()` external APIs still work (sandbox allows network) but there is no permission prompt — this is acceptable for v1 |

---

## Day one checklist

If you want to de-risk the project in a single sitting, build this minimum viable slice:

1. `pnpm create tauri-app` — pick React + TypeScript + pnpm
2. Install esbuild-wasm, copy a React artifact into `src/fixtures/demo.jsx`
3. Write `runtime/transform.ts` — confirm it compiles JSX and rewrites imports to globals
4. Build UMD vendor bundles for React + ReactDOM (minimum viable set)
5. Generate a `srcdoc` string with inlined vendor scripts + Tailwind CDN + boot script + transformed code
6. Mount a `<iframe sandbox="allow-scripts" srcdoc="...">` in `App.tsx`, confirm the artifact renders

If that works, every other feature is layered on top. The runtime is the only thing that can kill the project, and it's the first thing you prove.

---

## Naming, branding, positioning

- **Name:** Atelier. Register `atelier.app` and the `@atelier` handle on X, Bluesky, GitHub.
- **Tagline:** "Run Claude artifacts anywhere." or "The player for what Claude builds."
- **Icon:** A simple filled square at a slight rotation — suggests an art studio canvas. Flat, works at 16px and 1024px.
- **Positioning:** Not a replacement for Claude. A complement. "Claude makes it. Atelier runs it."

---

## Open questions

- Should pinned artifacts get their own launcher shortcuts on the OS (dock pin on macOS, taskbar pin on Windows, `.desktop` file on Linux)? Probably yes in v2.
- Is there a market for a developer-facing paid tier with an artifact authoring IDE (Monaco editor, live preview)? Possibly, but it collides with Claude Code and should wait.
- Should artifacts be able to talk to each other (artifact-to-artifact messaging)? Interesting, probably no for v1 — adds complexity without obvious demand.
- MCP support for artifacts — a Tauri sidecar MCP gateway so artifacts can use connectors. High value for v3, low value before then.
