/**
 * Integration tests — Social MCP Chrome extension
 *
 * Tier 1: Extension loads and the background → dispatch message chain works.
 * Tier 2: Content script injects into a mock page and DOM parsing works.
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

// --- Tier 1: extension structure and message chain ---------------------------

test('service worker starts with correct url', () => {
  expect(sw.url()).toMatch(/chrome-extension:\/\/.+\/background\/index\.js/);
});

test('dashboard renders facebook plugin', async () => {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${eid}/dashboard/index.html`);
  await expect(page.getByRole('button', { name: 'Facebook' })).toBeVisible();
  await page.close();
});

test('message chain: unknown platform returns structured error', async () => {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${eid}/dashboard/index.html`);
  await page.waitForTimeout(500);

  const resp = await page.evaluate(() => new Promise(resolve =>
    chrome.runtime.sendMessage(
      { type: 'ui:dispatch', platform: 'nope', action: 'scan', params: {} },
      resolve,
    )
  ));

  expect(resp).toEqual({ error: 'Unknown platform: nope' });
  await page.close();
});

// --- Tier 2: content script injection and DOM parsing -----------------------

// Minimal HTML that satisfies facebook getpages() selectors:
//   [role="main"] [role="listitem"] a[href] span[dir]
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

test('content script getpages parses mock facebook dom', async () => {
  test.setTimeout(20_000); // getpages() has sleep(3500)

  await ctx.route(MOCKURL, route =>
    route.fulfill({ contentType: 'text/html', body: MOCKHTML }),
  );

  const mockpage = await ctx.newPage();
  await mockpage.goto(MOCKURL);

  // Use the dashboard (extension page context) to reach chrome.scripting + chrome.tabs.
  const dash = await ctx.newPage();
  await dash.goto(`chrome-extension://${eid}/dashboard/index.html`);

  const tabId = await dash.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'http://localhost:19999/*' });
    return tabs[0]?.id ?? null;
  });
  expect(tabId).not.toBeNull();

  // Inject the bundled content script, then send getpages action.
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
