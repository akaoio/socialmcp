/**
 * build.js — rollup + terser build script
 *
 * Usage:
 *   node build.js          # build everything
 *   node build.js server   # bundle MCP server only
 *   node build.js ext      # bundle browser extension only
 *
 * Outputs:
 *   build/server/index.js        — single-file Node bundle
 *   build/browser/background.js  — bundled service worker
 *   build/browser/<p>/content.js — bundled content scripts
 *   build/browser/manifest.json  — copied as-is
 */

import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';
import fs from 'fs';

const target = process.argv[2] ?? 'all';
const prod   = process.env.NODE_ENV === 'production';

const minify = prod ? [terser()] : [];

// zen.js has a dynamic import("./service.js") which references a non-existent
// ./xdg.js in the zen package root. Stub it out so rollup can bundle cleanly.
const zenServiceStub = {
  name: 'zen-service-stub',
  resolveId(id, importer) {
    if (id === './service.js' && importer && importer.replace(/\\/g, '/').includes('@akaoio/zen')) {
      return '\0zen-service-stub';
    }
  },
  load(id) {
    if (id === '\0zen-service-stub') return 'export default function(){}';
  },
};

// ── Server ────────────────────────────────────────────────────────────────────

async function buildserver() {
  const bundle = await rollup({
    input: 'src/server/index.js',
    external: (id) => id.startsWith('node:'),
    plugins: [zenServiceStub, nodeResolve(), json(), ...minify],
  });
  await bundle.write({
    file:                  'build/server/index.js',
    format:                'esm',
    banner:                '#!/usr/bin/env node',
    sourcemap:             !prod,
    inlineDynamicImports:  true,
  });
  await bundle.close();
  // .wasm files are loaded at runtime relative to the bundle — must be co-located
  fs.copyFileSync('node_modules/@akaoio/zen/pen.wasm',    'build/server/pen.wasm');
  fs.copyFileSync('node_modules/@akaoio/zen/crypto.wasm', 'build/server/crypto.wasm');
  console.log('✓ server → build/server/index.js');
}

// ── Browser Extension ─────────────────────────────────────────────────────────

// Auto-derive the platform list by scanning src/browser/platform/*/plugin.js.
// Single source of truth — adding a platform means creating a folder, nothing else here.
function discoverplatforms() {
  const dir = 'src/browser/platform';
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(`${dir}/${e.name}/plugin.js`))
    .map(e => e.name);
}

async function buildext() {
  const PLATFORMS = discoverplatforms();
  const outdir = 'build/browser';
  fs.mkdirSync(outdir, { recursive: true });
  fs.mkdirSync(`${outdir}/dashboard`, { recursive: true });

  // Bundle background service worker
  fs.mkdirSync(`${outdir}/background`, { recursive: true });
  const bg = await rollup({
    input: 'src/browser/background/index.js',
    plugins: [zenServiceStub, nodeResolve({ browser: true }), json(), ...minify],
  });
  await bg.write({
    file:                 `${outdir}/background/index.js`,
    format:               'esm',
    sourcemap:            !prod,
    inlineDynamicImports: true,
  });
  await bg.close();
  console.log('✓ background → build/browser/background/index.js');

  // Bundle each platform content script as IIFE
  for (const p of PLATFORMS) {
    const b = await rollup({
      input: `src/browser/platform/${p}/content.js`,
      plugins: [...minify],
    });
    await b.write({
      file:      `${outdir}/${p}/content.js`,
      format:    'iife',
      sourcemap: !prod,
    });
    await b.close();
    console.log(`✓ ${p}/content → build/browser/${p}/content.js`);
  }

  // Bundle dashboard
  const dash = await rollup({
    input: 'src/browser/dashboard/index.js',
    plugins: [...minify],
  });
  await dash.write({
    file:      `${outdir}/dashboard/index.js`,
    format:    'iife',
    sourcemap: !prod,
  });
  await dash.close();
  console.log('✓ dashboard → build/browser/dashboard/index.js');

  // Generate manifest.json with platform-derived content_scripts + host_permissions.
  // Read each plugin's hosts.js (must export `export const hosts = [...]`) by simple regex —
  // we cannot import them (they may transitively load chrome.* APIs).
  const baseManifest = JSON.parse(fs.readFileSync('src/browser/manifest.json', 'utf8'));
  const platformhosts = Object.fromEntries(PLATFORMS.map(p => {
    const src   = fs.readFileSync(`src/browser/platform/${p}/hosts.js`, 'utf8');
    const match = src.match(/export\s+const\s+hosts\s*=\s*(\[[^\]]*\])/);
    if (!match) throw new Error(`platform/${p}/hosts.js must export const hosts = [...]`);
    return [p, JSON.parse(match[1].replace(/'/g, '"'))];
  }));
  baseManifest.content_scripts = PLATFORMS.map(p => ({
    matches: platformhosts[p].map(h => `https://*.${h}/*`),
    js:      [`${p}/content.js`],
    run_at:  'document_idle',
  }));
  baseManifest.host_permissions = [
    'ws://127.0.0.1/*',
    'http://127.0.0.1/*',
    ...PLATFORMS.flatMap(p => platformhosts[p].map(h => `https://*.${h}/*`)),
  ];
  fs.writeFileSync(`${outdir}/manifest.json`, JSON.stringify(baseManifest, null, 2));
  fs.copyFileSync('src/browser/dashboard/index.html',  `${outdir}/dashboard/index.html`);
  fs.copyFileSync('src/browser/dashboard/index.css',   `${outdir}/dashboard/index.css`);

  // Copy plugin CSS files (each platform may declare its own panel.css)
  fs.cpSync('src/browser/platform', `${outdir}/platform`, {
    recursive: true,
    filter: src => fs.statSync(src).isDirectory() || src.endsWith('.css'),
  });

  // .wasm files are fetched at runtime by @akaoio/zen — must be served from the extension root
  fs.copyFileSync('node_modules/@akaoio/zen/pen.wasm',    `${outdir}/pen.wasm`);
  fs.copyFileSync('node_modules/@akaoio/zen/crypto.wasm', `${outdir}/crypto.wasm`);
  console.log('✓ manifest + dashboard + plugin css + wasm files copied');
}

// ── Runner ────────────────────────────────────────────────────────────────────

const tasks = {
  server: buildserver,
  ext:    buildext,
  all:    async () => { await buildserver(); await buildext(); },
};

const fn = tasks[target];
if (!fn) {
  console.error(`Unknown target: ${target}. Use: server | ext | all`);
  process.exit(1);
}

fn().catch(err => { console.error(err); process.exit(1); });
