/**
 * Integration tests — Social MCP Chrome extension
 *
 * Proves the extension loads and the service worker starts correctly.
 * Full pipeline (dispatch → background → content script → real FB) is
 * covered by facebook.spec.js.
 *
 * Uses --headless=new so no display server is required.
 */
import { test, expect, chromium } from '@playwright/test';
import { join }                   from 'path';
import { mkdtempSync, rmSync }    from 'fs';
import { tmpdir }                 from 'os';

const EXT = join(process.cwd(), 'build/browser');

let ctx, sw, eid, udir;

test.beforeAll(async () => {
  udir = mkdtempSync(join(tmpdir(), 'socialmcp-'));
  ctx  = await chromium.launchPersistentContext(udir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
    ],
  });
  sw  = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
  eid = sw.url().split('/')[2];
});

test.afterAll(async () => {
  await ctx?.close();
  try { rmSync(udir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('service worker starts with correct url', () => {
  expect(sw.url()).toMatch(/chrome-extension:\/\/.+\/background\/index\.js/);
});

test('relay page loads and exposes dispatch', async () => {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${eid}/relay/relay.html`);
  const hasDispatch = await page.evaluate(() => typeof window.dispatch === 'function');
  expect(hasDispatch).toBe(true);
  await page.close();
});

