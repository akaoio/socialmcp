/**
 * Tier 3: Real Facebook integration — scan only, read-only.
 *
 * Skipped unless FACEBOOK_COOKIES is set (JSON array of cookie objects).
 * Never runs post/write operations to avoid accidental side effects.
 *
 * Usage:
 *   FACEBOOK_COOKIES='[{"name":"c_user","value":"...","domain":".facebook.com",...}]' \
 *     playwright test tests/facebook.spec.js
 *
 * Obtain cookies: log in to facebook.com in Chrome → DevTools → Application →
 *   Cookies → export as JSON (or use a browser extension like EditThisCookie).
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

let ctx, sw, eid, udir;

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
  sw  = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
  eid = sw.url().split('/')[2];

  // Inject session cookies before navigating.
  await ctx.addCookies(COOKIES);
});

test.afterAll(async () => {
  await ctx?.close();
  try { rmSync(udir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('scan returns facebook pages for authenticated user', async () => {
  test.setTimeout(60_000);

  const page = await ctx.newPage();
  await page.goto('https://www.facebook.com/pages/?category=your_pages');

  // Verify we are logged in (no login form visible).
  await expect(page.locator('[data-pagelet="LeftRail"]')).toBeVisible({ timeout: 15_000 })
    .catch(() => { throw new Error('Not logged in — check FACEBOOK_COOKIES'); });

  const dash = await ctx.newPage();
  await dash.goto(`chrome-extension://${eid}/dashboard/index.html`);

  // Get the facebook tab id from extension context.
  const tabId = await dash.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: '*://*.facebook.com/*' });
    return tabs[0]?.id ?? null;
  });
  expect(tabId).not.toBeNull();

  // Run scan via background dispatch.
  const result = await dash.evaluate(async (tid) => {
    // Inject content script (it may already be injected — that's fine).
    await chrome.scripting.executeScript({
      target: { tabId: tid },
      files:  ['facebook/content.js'],
    }).catch(() => { /* already injected */ });

    return new Promise(resolve =>
      chrome.tabs.sendMessage(tid, { action: 'getpages', params: {} }, resolve),
    );
  }, tabId);

  expect(result?.result?.pages).toBeDefined();
  expect(Array.isArray(result.result.pages)).toBe(true);

  console.log(`Found ${result.result.pages.length} Facebook page(s):`);
  for (const p of result.result.pages) console.log(`  • ${p.name}  ${p.url}`);

  await page.close();
  await dash.close();
});
