/**
 * Real Facebook E2E tests — proves the full production pipeline works.
 *
 * Skipped unless FACEBOOK_COOKIES is set (JSON array of cookie objects).
 * Read-only — never posts or writes anything.
 *
 * Tests the complete production path:
 *   relay page window.dispatch()
 *   → chrome.runtime.sendMessage
 *   → background/onmessage.js
 *   → background/dispatch.js
 *   → facebook/background/scan.js  (navigates FB tab, waits for load)
 *   → background/sendmessage.js
 *   → facebook/content.js HANDLERS.getpages  (manifest-injected, not manual)
 *   → DOM parse → result
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

const EXT     = join(process.cwd(), 'build/browser');
const COOKIES = process.env.FACEBOOK_COOKIES
  ? JSON.parse(process.env.FACEBOOK_COOKIES)
  : null;

test.skip(!COOKIES, 'set FACEBOOK_COOKIES env var to enable real-Facebook tests');

let ctx, eid, udir;

test.beforeAll(async () => {
  udir = mkdtempSync(join(tmpdir(), 'socialmcp-fb-'));
  ctx  = await chromium.launchPersistentContext(udir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
    ],
  });
  const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
  eid = sw.url().split('/')[2];

  // Inject session cookies, then open Facebook so manifest injects content script.
  await ctx.addCookies(COOKIES);
  const page = await ctx.newPage();
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });

  // Fail fast if not logged in.
  if (await page.locator('[name="email"]').count()) {
    throw new Error('Not logged in — check FACEBOOK_COOKIES');
  }
  await page.close();
});

test.afterAll(async () => {
  await ctx?.close();
  try { rmSync(udir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('scan: relay dispatch triggers full pipeline and returns real pages', async () => {
  test.setTimeout(90_000); // navigate(3500) + getpages sleep(3500) + FB network

  const dash = await ctx.newPage();
  await dash.goto(`chrome-extension://${eid}/relay/relay.html`);

  // Activate the Facebook plugin panel.
  await dash.getByRole('button', { name: 'Facebook' }).click();
  await expect(dash.locator('#fb-scan')).toBeVisible();

  // Click "Scan pages" — this triggers the full production dispatch chain.
  await dash.locator('#fb-scan').click();

  // Wait for scan to finish: button returns to "Scan pages" text.
  await expect(dash.locator('#fb-scan')).toHaveText('Scan pages', { timeout: 60_000 });

  // Assert log shows successful result (not an error).
  const logText = await dash.locator('#fb-log').textContent();
  expect(logText).toMatch(/Found \d+ page\(s\)\./);
  expect(logText).not.toContain('Error');

  // Assert pages persisted to storage and match what the UI shows.
  const stored = await dash.evaluate(async () => {
    const r = await chrome.storage.local.get(['facebook:pages']);
    return r['facebook:pages'] ?? [];
  });
  expect(Array.isArray(stored)).toBe(true);
  expect(stored.length).toBeGreaterThan(0);
  for (const p of stored) {
    expect(p).toHaveProperty('name');
    expect(p).toHaveProperty('url');
    expect(p.url).toContain('facebook.com/');
  }

  console.log(`Scan found ${stored.length} page(s):`);
  for (const p of stored) console.log(`  • ${p.name}  ${p.url}`);

  await dash.close();
});

