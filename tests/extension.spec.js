/**
 * Extension smoke tests
 *
 * Verifies the Chrome extension loads and the service worker starts correctly.
 * These are pre-flight checks — if they fail, all other tests will also fail.
 *
 * For MCP protocol tests (initialize, tools/list), see mcp.spec.js.
 * For full pipeline tests (MCP → bridge → extension → DOM), see debug/facebook/post.spec.js.
 *
 * Uses --headless=new so no display server is required.
 */
import { test, expect, chromium } from '@playwright/test';
import { join }                   from 'path';
import { mkdtempSync, rmSync }    from 'fs';
import { tmpdir }                 from 'os';
import { startmcp }               from './mcpclient.js';

const EXT = join(process.cwd(), 'build/browser');

let ctx, sw, mcp, udir;

test.beforeAll(async () => {
  udir = mkdtempSync(join(tmpdir(), 'socialmcp-'));

  // Start MCP server first (bridge starts on :8420)
  mcp = await startmcp();

  // Launch extension — peer.js will connect to bridge within seconds
  ctx = await chromium.launchPersistentContext(udir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
    ],
  });
  sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');

  // Wait for peer.js to connect to the bridge relay
  await mcp.waitforpeer();
});

test.afterAll(async () => {
  await ctx?.close();
  mcp?.close();
  try { rmSync(udir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('service worker starts with correct url', () => {
  expect(sw.url()).toMatch(/chrome-extension:\/\/.+\/background\/index\.js/);
});

test('extension peer connects to MCP bridge relay', async () => {
  // waitforpeer already succeeded in beforeAll; confirm bridge reports connected
  const r = await fetch('http://localhost:8765/ready');
  expect(r.status).toBe(200);
  const body = await r.json();
  expect(body.connected).toBe(true);
});

