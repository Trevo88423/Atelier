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
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VENDOR_SRC = join(ROOT, 'vendor-src', 'node_modules');
const VENDOR_OUT = join(ROOT, 'public', 'vendor');

// Maps package name → global variable name
const GLOBALS: Record<string, string> = {
  'react':        'React',
  'react-dom':    'ReactDOM',
  'lucide-react': 'lucideReact',
  'recharts':     'Recharts',
};

// Packages that should be treated as external (shared instance)
const EXTERNALS: Record<string, Record<string, string>> = {
  'react-dom': { 'react': 'React' },
  'lucide-react': { 'react': 'React' },
  'recharts': { 'react': 'React', 'react-dom': 'ReactDOM' },
};

async function buildUmd(pkg: string, globalName: string): Promise<string> {
  const externals = EXTERNALS[pkg] || {};
  const externalPkgs = Object.keys(externals);

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
          const globalVar = GLOBALS[base] || externals[base];
          // For subpath imports like react/jsx-runtime, access via the base global
          return {
            contents: `module.exports = window.${globalVar};`,
            loader: 'js' as const,
          };
        });
      }
    },
  }] : [];

  const result = await build({
    entryPoints: [join(VENDOR_SRC, pkg)],
    bundle: true,
    format: 'iife',
    globalName: `__vendor_${globalName}`,
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
  return `(function(){${code};window.${globalName}=__vendor_${globalName};})();\n`;
}

// Also build a jsx-runtime shim that the esbuild JSX automatic transform needs
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

// Main
console.log('Building vendor UMD bundles...');
mkdirSync(VENDOR_OUT, { recursive: true });

// Build in dependency order (React first, then things that depend on it)
const buildOrder = ['react', 'react-dom', 'lucide-react', 'recharts'];

async function main() {
  for (const pkg of buildOrder) {
    const globalName = GLOBALS[pkg];
    console.log(`  ${pkg} → window.${globalName}`);
    try {
      const code = await buildUmd(pkg, globalName);
      const filename = pkg.replace(/\//g, '-') + '.umd.js';
      writeFileSync(join(VENDOR_OUT, filename), code);
      console.log(`    ✓ ${filename} (${(code.length / 1024).toFixed(1)}KB)`);
    } catch (err) {
      console.error(`    ✗ Failed to build ${pkg}:`, err);
      process.exit(1);
    }
  }

  // Write jsx-runtime shim
  const jsxShim = buildJsxRuntimeShim();
  writeFileSync(join(VENDOR_OUT, 'react-jsx-runtime.umd.js'), jsxShim);
  console.log(`  jsx-runtime shim → window._jsx_runtime`);
  console.log(`    ✓ react-jsx-runtime.umd.js (${(jsxShim.length / 1024).toFixed(1)}KB)`);

  console.log('\nDone. Vendor bundles written to vendor/');
}

main();
