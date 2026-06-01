/**
 * Real Facebook E2E tests — proves the full production pipeline works.
 *
 * Skipped unless FACEBOOK_COOKIES is set (JSON array of cookie objects).
 * Read-only — never posts or writes anything.
 *
 * Tests the complete production path as an AI agent would use it:
 *
 *   test stdin (JSON-RPC tools/call)
 *   → MCP server (index.js)
 *   → bridge.send() → HTTP relay localhost:8420
 *   → peer.js GET /job
 *   → dispatch → facebook/background/scan.js (navigates FB, injects content script)
 *   → facebook/content.js HANDLERS.getpages (DOM parse)
 *   → POST /result/:id
 *   → MCP server stdout (JSON-RPC response)
 *
 * Get cookies:
 *   node scripts/extractcookies.js   (or see docs/diary for manual steps)
 *
 * Run:
 *   FACEBOOK_COOKIES=$(cat /tmp/fb_cookies.json) npm test -- --grep facebook
 */
import { test, expect, chromium } from '@playwright/test';
import { join }                   from 'path';
import { mkdtempSync, rmSync }    from 'fs';
import { tmpdir }                 from 'os';
import { startmcp }               from './mcpclient.js';

const EXT     = join(process.cwd(), 'build/browser');
const COOKIES = process.env.FACEBOOK_COOKIES
  ? JSON.parse(process.env.FACEBOOK_COOKIES)
  : null;

test.skip(!COOKIES, 'set FACEBOOK_COOKIES env var to enable real-Facebook tests');

let ctx, mcp, udir;

test.beforeAll(async () => {
  udir = mkdtempSync(join(tmpdir(), 'socialmcp-fb-'));

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

  // Inject session cookies, then verify login
  await ctx.addCookies(COOKIES);
  const page = await ctx.newPage();
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
  if (await page.locator('[name="email"]').count()) {
    throw new Error('Not logged in — check FACEBOOK_COOKIES');
  }
  await page.close();

  // Wait for peer.js to connect to the bridge relay
  await mcp.waitforpeer();
});

test.afterAll(async () => {
  await ctx?.close();
  mcp?.close();
  try { rmSync(udir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('scan: full MCP pipeline returns real Facebook pages', async () => {
  test.setTimeout(90_000); // navigate(3500) + getpages sleep(3500) + FB network

  const result = await mcp.call('scan', { platform: 'facebook' });

  expect(result).not.toHaveProperty('error');
  expect(Array.isArray(result.pages)).toBe(true);
  expect(result.pages.length).toBeGreaterThan(0);
  for (const p of result.pages) {
    expect(p).toHaveProperty('name');
    expect(p).toHaveProperty('url');
    expect(p.url).toContain('facebook.com/');
  }

  console.log(`Scan found ${result.pages.length} page(s):`);
  for (const p of result.pages) console.log(`  • ${p.name}  ${p.url}`);
});

