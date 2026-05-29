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
  console.log('✓ server → build/server/index.js');
}

// ── Browser Extension ─────────────────────────────────────────────────────────

const PLATFORMS = ['facebook', 'x', 'instagram', 'threads'];

async function buildext() {
  const outdir = 'build/browser';
  fs.mkdirSync(outdir, { recursive: true });

  // Bundle background service worker (nodeResolve needed for @akaoio/zen/zen.js)
  const bg = await rollup({
    input: 'src/browser/background.js',
    plugins: [zenServiceStub, nodeResolve({ browser: true }), json(), ...minify],
  });
  await bg.write({
    file:                 `${outdir}/background.js`,
    format:               'esm',
    sourcemap:            !prod,
    inlineDynamicImports: true,
  });
  await bg.close();
  console.log('✓ background → build/browser/background.js');

  // Bundle each platform content script as IIFE
  for (const p of PLATFORMS) {
    const b = await rollup({
      input: `src/browser/${p}/content.js`,
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

  // Copy static extension assets
  fs.copyFileSync('src/browser/manifest.json', `${outdir}/manifest.json`);
  fs.copyFileSync('src/browser/popup.html', `${outdir}/popup.html`);
  fs.copyFileSync('src/browser/popup.css', `${outdir}/popup.css`);
  fs.copyFileSync('src/browser/popup.js', `${outdir}/popup.js`);
  console.log('✓ manifest + popup assets copied');
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
