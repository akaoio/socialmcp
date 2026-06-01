/**
 * Debug MCP tools — integration tests
 *
 * Proves screenshot, getdom, getaxstree, and ocr tools work end-to-end
 * through the full production pipeline:
 *
 *   test stdin (JSON-RPC)
 *   → MCP server (index.js)
 *   → bridge.send() → HTTP relay localhost:8420
 *   → peer.js GET /job
 *   → dispatch → builtin handler
 *   → POST /result/:id
 *   → MCP server stdout (JSON-RPC response)
 *
 * No mocks. Uses real Chromium + extension + network.
 * Facebook login page is used — no credentials needed; debug tools work on any page.
 *
 * Run: npm test -- --grep debug
 */
import { test, expect, chromium } from '@playwright/test';
import { join }                   from 'path';
import { mkdtempSync, rmSync }    from 'fs';
import { tmpdir }                 from 'os';
import { startmcp }               from './mcpclient.js';

const EXT = join(process.cwd(), 'build/browser');

let ctx, mcp, udir;

test.beforeAll(async () => {
  udir = mkdtempSync(join(tmpdir(), 'socialmcp-debug-'));

  // Spawn MCP server first (bridge starts on :8420)
  mcp = await startmcp();

  // Launch Chromium with extension (peer.js connects to bridge)
  ctx = await chromium.launchPersistentContext(udir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
    ],
  });
  await (ctx.serviceWorkers()[0] ?? ctx.waitForEvent('serviceworker'));

  // Wait for peer.js to connect to the bridge relay before calling tools
  await mcp.waitforpeer();
});

test.afterAll(async () => {
  await ctx?.close();
  mcp?.close();
  try { rmSync(udir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('screenshot: returns valid PNG image via MCP', async () => {
  test.setTimeout(60_000);
  const result = await mcp.call('screenshot', { platform: 'facebook' });

  expect(result.type).toBe('image');
  expect(result.mimeType).toBe('image/png');
  expect(typeof result.data).toBe('string');
  expect(result.data.length).toBeGreaterThan(1000);
});

test('getdom: returns real HTML document via MCP', async () => {
  test.setTimeout(60_000);
  const result = await mcp.call('getdom', { platform: 'facebook' });

  expect(typeof result.html).toBe('string');
  expect(result.html.length).toBeGreaterThan(500);
  expect(result.html.toLowerCase()).toContain('<html');
  expect(result.html.toLowerCase()).toContain('</html>');
  expect(result.html.toLowerCase()).toContain('facebook');
});

test('getaxstree: returns non-empty accessibility tree via MCP', async () => {
  test.setTimeout(60_000);
  const result = await mcp.call('getaxstree', { platform: 'facebook' });

  expect(typeof result.tree).toBe('string');
  expect(result.tree).not.toBe('(empty)');
  expect(result.tree).toMatch(/<[a-z]/);
});

test('ocr: extracts text from current tab via MCP pipeline', async () => {
  test.setTimeout(120_000);
  // ocr tool: bridge.send screenshot → tesseract on server → { text }
  const result = await mcp.call('ocr', { platform: 'facebook' });

  expect(typeof result.text).toBe('string');
  expect(result.text.length).toBeGreaterThan(3);
});

