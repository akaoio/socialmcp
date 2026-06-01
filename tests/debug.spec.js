/**
 * Debug MCP tools — integration tests
 *
 * Proves screenshot, getdom, getaxstree, and ocr tools work end-to-end:
 *   relay sendMessage → background onmessage → dispatch → builtin handler
 *
 * No mocks. Uses real Chromium + real extension + real network (facebook.com
 * login page — no credentials needed; debug tools work on any page).
 *
 * Each test sends { type: 'ui:dispatch', ... } from the relay page context,
 * the same message format that goes through background/onmessage → dispatch → builtin handler.
 *
 * Run: npm test -- --grep debug
 */
import { test, expect, chromium } from '@playwright/test';
import { join }                   from 'path';
import { mkdtempSync, rmSync }    from 'fs';
import { tmpdir }                 from 'os';

const EXT = join(process.cwd(), 'build/browser');

// Call dispatch action via the relay page (real extension messaging path).
async function call(dashPage, platform, action, params = {}) {
  const resp = await dashPage.evaluate(
    ({ platform, action, params }) => window.dispatch(platform, action, params),
    { platform, action, params }
  );
  return resp?.result;
}

let ctx, dash, eid, udir;

test.beforeAll(async () => {
  udir = mkdtempSync(join(tmpdir(), 'socialmcp-debug-'));
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

  dash = await ctx.newPage();
  await dash.goto(`chrome-extension://${eid}/relay/relay.html`);
});

test.afterAll(async () => {
  await ctx?.close();
  try { rmSync(udir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('screenshot: returns valid PNG data URL', async () => {
  test.setTimeout(60_000);
  const result = await call(dash, 'facebook', 'screenshot');

  expect(typeof result.dataurl).toBe('string');
  expect(result.dataurl).toMatch(/^data:image\/png;base64,/);
  expect(result.dataurl.replace('data:image/png;base64,', '').length).toBeGreaterThan(1000);
});

test('getdom: returns real HTML document', async () => {
  test.setTimeout(60_000);
  const result = await call(dash, 'facebook', 'getdom');

  expect(typeof result.html).toBe('string');
  expect(result.html.length).toBeGreaterThan(500);
  expect(result.html.toLowerCase()).toContain('<html');
  expect(result.html.toLowerCase()).toContain('</html>');
  expect(result.html.toLowerCase()).toContain('facebook');
});

test('getaxstree: returns non-empty accessibility tree', async () => {
  test.setTimeout(60_000);
  const result = await call(dash, 'facebook', 'getaxstree');

  expect(typeof result.tree).toBe('string');
  expect(result.tree).not.toBe('(empty)');
  expect(result.tree).toMatch(/<[a-z]/);
});

test('ocr: extracts text from screenshot via tesseract.js', async () => {
  test.setTimeout(120_000);

  const { dataurl } = await call(dash, 'facebook', 'screenshot');
  const { ocr } = await import('../src/server/ocr/ocr.js');
  const text = await ocr(dataurl);

  expect(typeof text).toBe('string');
  expect(text.length).toBeGreaterThan(3);
});
