/**
 * build.js — esbuild script
 *
 * Usage:
 *   node build.js          # build everything
 *   node build.js server   # bundle MCP server only
 *   node build.js ext      # bundle browser extension only
 *
 * Outputs:
 *   build/server/index.js             — single-file Node bundle
 *   build/browser/background/index.js — bundled service worker (ESM)
 *   build/browser/<p>/content.js      — bundled content scripts (IIFE)
 *   build/browser/dashboard/index.js  — bundled dashboard (IIFE)
 *   build/browser/manifest.json       — generated from src + plugin hosts.js
 */

import * as esbuild from 'esbuild';
import fs from 'fs';

const target = process.argv[2] ?? 'all';
const prod   = process.env.NODE_ENV === 'production';

const common = {
  bundle:    true,
  minify:    prod,
  sourcemap: !prod,
  logLevel:  'info',
};

// Stub Node-only files that zen.js dynamically imports for browser builds
const stubnodeplugin = {
  name: 'stubnode',
  setup(build) {
    // Stub service.js / xdg.js (Node-only helpers in zen)
    build.onResolve({ filter: /[/\\](service|xdg)(\.min)?\.js$/ }, args => ({
      path: args.path,
      namespace: 'stubnode',
    }));
    // Stub Node built-in dynamic imports (e.g. node:fs/promises inside zen.js)
    build.onResolve({ filter: /^(node:|fs|path|os|url|child_process|crypto)/ }, args => ({
      path: args.path,
      namespace: 'stubnode',
    }));
    build.onLoad({ filter: /.*/, namespace: 'stubnode' }, () => ({
      contents: '',
      loader: 'js',
    }));
  },
};

// ── Server ────────────────────────────────────────────────────────────────────

async function buildserver() {
  await esbuild.build({
    ...common,
    entryPoints: ['src/server/index.js'],
    outfile:     'build/server/index.js',
    format:      'esm',
    platform:    'node',
    banner:      { js: '#!/usr/bin/env node' },
  });
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

  const browserplugins = [stubnodeplugin];

  // Background service worker (ESM, browser platform)
  await esbuild.build({
    ...common,
    plugins:     browserplugins,
    entryPoints: ['src/browser/background/index.js'],
    outfile:     `${outdir}/background/index.js`,
    format:      'esm',
    platform:    'browser',
  });
  console.log('✓ background → build/browser/background/index.js');

  // Per-platform content scripts (IIFE)
  for (const p of PLATFORMS) {
    await esbuild.build({
      ...common,
      plugins:     browserplugins,
      entryPoints: [`src/browser/platform/${p}/content.js`],
      outfile:     `${outdir}/${p}/content.js`,
      format:      'iife',
      platform:    'browser',
    });
    console.log(`✓ ${p}/content → build/browser/${p}/content.js`);
  }

  // Dashboard (IIFE)
  await esbuild.build({
    ...common,
    plugins:     browserplugins,
    entryPoints: ['src/browser/dashboard/index.js'],
    outfile:     `${outdir}/dashboard/index.js`,
    format:      'iife',
    platform:    'browser',
  });
  console.log('✓ dashboard → build/browser/dashboard/index.js');

  // Generate manifest.json with platform-derived content_scripts + host_permissions.
  // Read each plugin's hosts.js by simple regex — we cannot import them
  // (they may transitively load chrome.* APIs).
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
  const platformHostPerms = PLATFORMS.flatMap(p => platformhosts[p].map(h => `https://*.${h}/*`));
  const baseHostPerms = (baseManifest.host_permissions ?? []).filter(hp => !platformHostPerms.includes(hp));
  baseManifest.host_permissions = [...baseHostPerms, ...platformHostPerms];
  fs.writeFileSync(`${outdir}/manifest.json`, JSON.stringify(baseManifest, null, 2));
  fs.copyFileSync('src/browser/dashboard/index.html', `${outdir}/dashboard/index.html`);
  fs.copyFileSync('src/browser/dashboard/index.css',  `${outdir}/dashboard/index.css`);

  // Copy plugin CSS files (each platform may declare its own panel.css)
  function hascss(dirpath) {
    return fs.readdirSync(dirpath, { withFileTypes: true }).some(e =>
      e.isFile() && e.name.endsWith('.css') ||
      e.isDirectory() && hascss(`${dirpath}/${e.name}`)
    );
  }
  fs.cpSync('src/browser/platform', `${outdir}/platform`, {
    recursive: true,
    filter: src => {
      const stat = fs.statSync(src);
      if (stat.isFile()) return src.endsWith('.css');
      return hascss(src);
    },
  });

  console.log('✓ manifest + dashboard + plugin css copied');
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
