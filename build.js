/**
 * build.js — esbuild build script
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

import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const target = process.argv[2] ?? 'all';
const prod   = process.env.NODE_ENV === 'production';

// ── Server ────────────────────────────────────────────────────────────────────

async function buildserver() {
  await esbuild.build({
    entryPoints: ['src/server/index.js'],
    bundle:      true,
    platform:    'node',
    target:      'node20',
    format:      'esm',
    outfile:     'build/server/index.js',
    minify:      prod,
    sourcemap:   !prod,
    // Keep Node built-ins and native addons external
    packages:    'bundle',
    external:    [],
    banner: {
      js: '#!/usr/bin/env node',
    },
  });
  console.log('✓ server → build/server/index.js');
}

// ── Browser Extension ─────────────────────────────────────────────────────────

const PLATFORMS = ['facebook', 'x', 'instagram', 'threads'];

async function buildext() {
  const outdir = 'build/browser';

  // Bundle background service worker
  await esbuild.build({
    entryPoints: ['src/browser/background.js'],
    bundle:      true,
    platform:    'browser',
    target:      'chrome120',
    format:      'esm',
    outfile:     `${outdir}/background.js`,
    minify:      prod,
    sourcemap:   !prod,
  });
  console.log('✓ background → build/browser/background.js');

  // Bundle each platform content script
  await esbuild.build({
    entryPoints: PLATFORMS.map(p => `src/browser/${p}/content.js`),
    bundle:      true,
    platform:    'browser',
    target:      'chrome120',
    format:      'iife', // content scripts must be IIFE, not ESM
    outdir,
    outbase:     'src/browser',
    minify:      prod,
    sourcemap:   !prod,
  });
  PLATFORMS.forEach(p => console.log(`✓ ${p}/content → build/browser/${p}/content.js`));

  // Copy manifest.json
  fs.mkdirSync(outdir, { recursive: true });
  fs.copyFileSync('src/browser/manifest.json', `${outdir}/manifest.json`);
  console.log('✓ manifest.json copied');

  // Patch manifest to point sourcemap paths correctly in dev
  if (!prod) {
    const manifest = JSON.parse(fs.readFileSync(`${outdir}/manifest.json`, 'utf8'));
    fs.writeFileSync(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2));
  }
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
