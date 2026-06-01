/**
 * Parser unit tests — deterministic, no credentials needed.
 *
 * Proves the content script DOM-parsing logic in isolation.
 * This is a regression guard: if Facebook selectors break, this
 * catches it before the full E2E suite (which requires credentials).
 *
 * Separate from the practical E2E tests — see facebook.spec.js for
 * tests that prove the full production pipeline works on real Facebook.
 */
import { test, expect, chromium } from '@playwright/test';
import { join }                   from 'path';
import { mkdtempSync, rmSync }    from 'fs';
import { tmpdir }                 from 'os';

const EXT = join(process.cwd(), 'build/browser');

let ctx, eid, udir;

test.beforeAll(async () => {
  udir = mkdtempSync(join(tmpdir(), 'socialmcp-parser-'));
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
});

test.afterAll(async () => {
  await ctx?.close();
  try { rmSync(udir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// Minimal HTML matching facebook getpages() selectors:
//   [role="main"] [role="listitem"] a[href*="facebook.com/"] span[dir]
const MOCKHTML = `<!doctype html><html><body>
<div role="main">
  <div role="listitem">
    <a href="https://www.facebook.com/testpageone">
      <span dir="auto">Test Page One</span>
    </a>
  </div>
  <div role="listitem">
    <a href="https://www.facebook.com/testpagetwo">
      <span dir="auto">Test Page Two</span>
    </a>
  </div>
</div>
</body></html>`;

const MOCKURL = 'http://localhost:19999/';

test('getpages parses facebook-shaped dom correctly', async () => {
  test.setTimeout(20_000); // getpages() has sleep(3500)

  await ctx.route(MOCKURL, route =>
    route.fulfill({ contentType: 'text/html', body: MOCKHTML }),
  );

  const mockpage = await ctx.newPage();
  await mockpage.goto(MOCKURL);

  const dash = await ctx.newPage();
  await dash.goto(`chrome-extension://${eid}/dashboard/index.html`);

  const tabId = await dash.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'http://localhost:19999/*' });
    return tabs[0]?.id ?? null;
  });
  expect(tabId).not.toBeNull();

  const result = await dash.evaluate(async (tid) => {
    await chrome.scripting.executeScript({
      target: { tabId: tid },
      files:  ['facebook/content.js'],
    });
    return new Promise(resolve =>
      chrome.tabs.sendMessage(tid, { action: 'getpages', params: {} }, resolve),
    );
  }, tabId);

  expect(result?.result?.pages).toHaveLength(2);
  expect(result.result.pages[0].name).toBe('Test Page One');
  expect(result.result.pages[0].url).toBe('https://www.facebook.com/testpageone');
  expect(result.result.pages[1].name).toBe('Test Page Two');

  await mockpage.close();
  await dash.close();
  await ctx.unroute(MOCKURL);
});
