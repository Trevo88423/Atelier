# Stele

**VLC for JSX.** Double-click any interactive artifact — JSX, TSX, HTML, SVG, Markdown, Mermaid — to run it natively on your desktop. Sandboxed, local, offline. Your files never leave your machine.

Built for artifacts from Claude, v0, Canvas, or anywhere else that produces single-file interactive content.

## Download

Grab the installer for your platform from [Releases](../../releases):

- **Windows:** `.msi` or `-setup.exe`
- **macOS:** `.dmg`
- **Linux:** `.deb` or `.AppImage`

Windows installers are Authenticode-signed. **Code signing provided free of charge by the [SignPath Foundation](https://signpath.org) under the [SignPath Foundation OSS signing program](https://signpath.io/foundation), using a certificate issued by [SignPath.io](https://signpath.io).**

## What it does

- **Opens any supported artifact file natively.** Double-click in Explorer/Finder and it just runs.
- **Sandboxed rendering.** Artifacts run in an isolated iframe with no access to your files, cookies, or other artifacts' data.
- **Library.** Imported artifacts persist across sessions in a local SQLite database.
- **15 vendor libraries built in** — React, Recharts, D3, Three.js, Chart.js, Plotly, Mermaid, and more. Most Claude artifacts run with no extra setup.
- **Drag and drop.** Drop files onto the window to import.
- **Export to HTML.** Any artifact can be exported as a standalone HTML file.
- **Watched folders.** Point Stele at a folder and new artifact files auto-import.

## The capability model (v0.2.0+)

Artifacts can opt in to richer capabilities — network access, camera, geolocation, clipboard — by declaring them in an `@stele-manifest` block at the top of the file:

```jsx
/**
 * @stele-manifest
 * name: Site Pre-Start Check
 * version: 1.0.0
 * author: TPB Kitchens
 * description: Daily site safety check
 * requires:
 *   - geolocation
 *   - camera
 *   - network: https://webhooks.example.com
 */
export default function PreStart() { /* ... */ }
```

On first run, Stele shows a consent dialog listing exactly what the artifact is asking for. You can Allow or Block. Grants persist per-artifact (keyed by content hash) and can be revoked any time in **Settings → Permissions**.

**Default policy for artifacts without a manifest:** presentation-only. `window.storage` still works for back-compat, but network requests, camera, geolocation, and microphone are all blocked by browser-level enforcement (CSP + iframe `allow` attribute).

**Capabilities you can declare:**

| Capability | Effect |
|---|---|
| `geolocation` | Grants `navigator.geolocation` access |
| `camera` | Grants `getUserMedia({ video })` access |
| `microphone` | Grants `getUserMedia({ audio })` access |
| `clipboard-read` / `clipboard-write` | Grants clipboard API access |
| `network: https://host` | Adds `host` to CSP `connect-src` — `fetch`/XHR/WebSocket can reach it |

Wildcard subdomains are supported: `network: https://*.example.com`.

## Supported artifact types

| Extension | Rendered as |
|---|---|
| `.jsx`, `.tsx` | React component — transpiled with esbuild-wasm, rendered in sandboxed iframe |
| `.html` | Static HTML page in sandboxed iframe |
| `.svg` | Inline SVG with neutral background |
| `.md` | Rendered Markdown with code highlighting |
| `.mermaid` | Mermaid diagram |

## Getting artifacts from Claude

Ask Claude to create a JSX artifact as you normally would, then download the `.jsx` file (or copy to a file locally). Open it with Stele.

For artifacts that need capabilities (network, camera, etc.), ask Claude to add an `@stele-manifest` block listing what's required. A short prompt you can paste into your Claude project:

> When generating JSX artifacts, add a JSDoc block at the top with `@stele-manifest` listing the capabilities the artifact needs (geolocation, camera, microphone, clipboard-read, clipboard-write, or `network: https://host`). Only declare what's actually used.

## Build from source

```bash
git clone https://github.com/stele-app/stele.git
cd stele
pnpm install
cd vendor-src && pnpm install && cd ..
pnpm prebuild:vendor
pnpm tauri build
```

Requires Node.js 22+, pnpm 10+, Rust toolchain, and platform-specific Tauri dependencies ([see Tauri docs](https://v2.tauri.app/start/prerequisites/)).

### Development

```bash
pnpm tauri dev
```

Note: file associations only register when installed via the platform installer — in dev mode, use drag-and-drop or the Import button.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite
- **Backend:** Tauri 2, Rust, SQLite
- **Sandbox:** esbuild-wasm for JSX/TSX transpilation, vendor UMD bundles, CSP-hardened iframe

## Privacy

Stele is local-first and collects no data. See [PRIVACY.md](PRIVACY.md).

## License

Apache 2.0. See [LICENSE](LICENSE).
