/**
 * Prebuild vendor dependencies as UMD bundles for the sandbox iframe.
 *
 * Each bundle assigns its exports to a known global (e.g., window.React).
 * These are inlined into the sandbox srcdoc as <script> tags so the
 * opaque-origin iframe doesn't need to fetch anything from the host.
 *
 * Usage: pnpm prebuild:vendor
 */

import { build } from 'esbuild';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VENDOR_SRC = join(ROOT, 'vendor-src', 'node_modules');
// Vendor UMDs are consumed by both desktop and web-viewer at runtime.
// Write to every app's public/vendor/ so each Vite dev server can serve them.
const VENDOR_OUTS = [
  join(ROOT, 'public', 'vendor'),
  join(ROOT, 'packages', 'web-viewer', 'public', 'vendor'),
];

// Maps package name → { global, entry? (override), externals }
interface VendorSpec {
  global: string;
  entry?: string;           // Override entry point (default: package name)
  externals?: Record<string, string>;  // pkg → global
}

const VENDORS: Record<string, VendorSpec> = {
  'react':              { global: 'React' },
  'react-dom':          { global: 'ReactDOM', externals: { react: 'React' } },
  'lucide-react':       { global: 'lucideReact', externals: { react: 'React' } },
  'recharts':           { global: 'Recharts', externals: { react: 'React', 'react-dom': 'ReactDOM' } },
  'three':              { global: 'THREE' },
  'mathjs':             { global: 'mathjs', entry: 'mathjs/lib/browser/math.js' },
  'd3':                 { global: 'd3' },
  'chart.js':           { global: 'Chart', entry: 'chart.js/auto' },
  'papaparse':          { global: 'Papa' },
  'lodash':             { global: '_' },
  'mammoth':            { global: 'mammoth', entry: 'mammoth/mammoth.browser.js' },
};

// Packages that should be treated as external (shared instance)
const GLOBAL_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(VENDORS).map(([pkg, spec]) => [pkg, spec.global])
);

async function buildUmd(pkg: string, spec: VendorSpec): Promise<string> {
  const externals = spec.externals || {};
  const externalPkgs = Object.keys(externals);
  const entryPoint = spec.entry || pkg;

  const plugins = externalPkgs.length > 0 ? [{
    name: 'global-externals',
    setup(b: any) {
      for (const ext of externalPkgs) {
        b.onResolve({ filter: new RegExp(`^${ext}(/.*)?$`) }, (args: any) => ({
          path: args.path,
          namespace: 'global-external',
        }));
        b.onLoad({ filter: /.*/, namespace: 'global-external' }, (args: any) => {
          const base = args.path.split('/')[0];
          const globalVar = GLOBAL_MAP[base] || externals[base];
          return {
            contents: `module.exports = window.${globalVar};`,
            loader: 'js' as const,
          };
        });
      }
    },
  }] : [];

  const result = await build({
    entryPoints: [join(VENDOR_SRC, entryPoint)],
    bundle: true,
    format: 'iife',
    globalName: `__vendor_${spec.global}`,
    platform: 'browser',
    target: 'es2020',
    minify: true,
    write: false,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    plugins,
  });

  const code = result.outputFiles[0].text;
  return `(function(){${code};window.${spec.global}=__vendor_${spec.global};})();\n`;
}

function buildJsxRuntimeShim(): string {
  return `(function(){
  var React = window.React;
  window._jsx_runtime = {
    jsx: function(type, props, key) {
      return React.createElement(type, key !== undefined ? Object.assign({}, props, {key: key}) : props);
    },
    jsxs: function(type, props, key) {
      return React.createElement(type, key !== undefined ? Object.assign({}, props, {key: key}) : props);
    },
    Fragment: React.Fragment,
  };
})();\n`;
}

// Special handling for packages with pre-built browser UMD/min files
async function copyPrebuilt(pkg: string, spec: VendorSpec, sourceFile: string): Promise<string> {
  const code = readFileSync(join(VENDOR_SRC, sourceFile), 'utf-8');
  return `(function(){${code}})();\n`;
}

function writeVendorFile(filename: string, code: string) {
  for (const out of VENDOR_OUTS) {
    writeFileSync(join(out, filename), code);
  }
}

// Main
console.log('Building vendor UMD bundles...');
for (const out of VENDOR_OUTS) mkdirSync(out, { recursive: true });

// Build in dependency order (React first, then things that depend on it)
const buildOrder = [
  'react', 'react-dom', 'lucide-react', 'recharts',
  'three', 'mathjs', 'd3', 'chart.js',
  'papaparse', 'lodash', 'mammoth',
];

// Packages that have pre-built UMD and are better copied than bundled
const PREBUILT: Record<string, string> = {
  'plotly.js-dist-min': 'plotly.js-dist-min/plotly.min.js',
  'xlsx': 'xlsx/dist/xlsx.mini.min.js',
  'tone': 'tone/build/Tone.js',
};

async function main() {
  for (const pkg of buildOrder) {
    const spec = VENDORS[pkg];
    console.log(`  ${pkg} → window.${spec.global}`);
    try {
      const code = await buildUmd(pkg, spec);
      const filename = pkg.replace(/[/.]/g, '-') + '.umd.js';
      writeVendorFile(filename, code);
      console.log(`    ✓ ${filename} (${(code.length / 1024).toFixed(1)}KB)`);
    } catch (err) {
      console.error(`    ✗ Failed to build ${pkg}:`, err);
      process.exit(1);
    }
  }

  // Copy pre-built bundles
  for (const [pkg, sourceFile] of Object.entries(PREBUILT)) {
    const spec: VendorSpec = pkg === 'plotly.js-dist-min'
      ? { global: 'Plotly' }
      : pkg === 'xlsx'
        ? { global: 'XLSX' }
        : { global: 'Tone' };
    console.log(`  ${pkg} → window.${spec.global} (prebuilt)`);
    try {
      const code = await copyPrebuilt(pkg, spec, sourceFile);
      const filename = pkg.replace(/[/.]/g, '-') + '.umd.js';
      writeVendorFile(filename, code);
      console.log(`    ✓ ${filename} (${(code.length / 1024).toFixed(1)}KB)`);
    } catch (err) {
      console.error(`    ✗ Failed to copy ${pkg}:`, err);
      process.exit(1);
    }
  }

  // Write jsx-runtime shim
  const jsxShim = buildJsxRuntimeShim();
  writeVendorFile('react-jsx-runtime.umd.js', jsxShim);
  console.log(`  jsx-runtime shim → window._jsx_runtime`);
  console.log(`    ✓ react-jsx-runtime.umd.js (${(jsxShim.length / 1024).toFixed(1)}KB)`);

  console.log(`\nDone. Vendor bundles written to:\n  ${VENDOR_OUTS.map((p) => `- ${p}`).join('\n  ')}`);
}

main();
