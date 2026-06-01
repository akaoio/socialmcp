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

// Unwrap the { result } envelope that onmessage wraps around every dispatch response.
async function call(page, platform, action, params = {}) {
  const resp = await page.evaluate(
    ({ platform, action, params }) => window.dispatch(platform, action, params),
    { platform, action, params }
  );
  return resp?.result;
}

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

  const relay = await ctx.newPage();
  await relay.goto(`chrome-extension://${eid}/relay/relay.html`);

  // Call scan via relay — exercises the full production dispatch chain.
  const result = await call(relay, 'facebook', 'scan', {});

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

  await relay.close();
});

