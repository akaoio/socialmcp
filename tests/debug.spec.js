/**
 * Debug MCP tools — integration tests
 *
 * Proves screenshot, getdom, getaxstree, and ocr tools work end-to-end:
 *   dashboard sendMessage → background onmessage → dispatch → builtin handler
 *
 * No mocks. Uses real Chromium + real extension + real network (facebook.com
 * login page — no credentials needed; debug tools work on any page).
 *
 * Each test sends { type: 'ui:dispatch', ... } from the dashboard context,
 * exactly the same message the dashboard UI sends when a user clicks a button.
 *
 * OCR test skipped when tesseract binary is absent.
 * Run: npm test -- --grep debug
 */
import { test, expect, chromium } from '@playwright/test';
import { join }                   from 'path';
import { mkdtempSync, rmSync }    from 'fs';
import { tmpdir }                 from 'os';
import { execSync }               from 'child_process';

const EXT = join(process.cwd(), 'build/browser');

// Call dispatch action from the dashboard page (real extension messaging path).
async function call(dashPage, platform, action, params = {}) {
  const resp = await dashPage.evaluate(
    async ({ platform, action, params }) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: 'ui:dispatch', platform, action, params },
          r => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError.message);
            else resolve(r);
          }
        );
      }),
    { platform, action, params }
  );
  if (resp?.error) throw new Error(resp.error);
  return resp?.result;
}

function hasTesseract() {
  try { execSync('which tesseract', { stdio: 'ignore' }); return true; }
  catch { return false; }
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

  // Keep a dashboard page open — all tests send messages through it.
  dash = await ctx.newPage();
  await dash.goto(`chrome-extension://${eid}/dashboard/index.html`);
});

test.afterAll(async () => {
  await ctx?.close();
  try { rmSync(udir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('screenshot: returns valid PNG data URL', async () => {
  test.setTimeout(60_000); // first call creates a new facebook tab and waits for load
  const result = await call(dash, 'facebook', 'screenshot');

  expect(typeof result.dataUrl).toBe('string');
  expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);

  const base64 = result.dataUrl.replace('data:image/png;base64,', '');
  expect(base64.length).toBeGreaterThan(1000); // a real PNG is never tiny
});

test('getdom: returns real HTML document', async () => {
  test.setTimeout(60_000);
  const result = await call(dash, 'facebook', 'getdom');

  expect(typeof result.html).toBe('string');
  expect(result.html.length).toBeGreaterThan(500);
  expect(result.html.toLowerCase()).toContain('<html');
  expect(result.html.toLowerCase()).toContain('</html>');
  // Any facebook.com page (login or feed) contains "facebook" in its content.
  expect(result.html.toLowerCase()).toContain('facebook');
});

test('getaxstree: returns non-empty accessibility tree', async () => {
  test.setTimeout(60_000);
  const result = await call(dash, 'facebook', 'getaxstree');

  expect(typeof result.tree).toBe('string');
  expect(result.tree).not.toBe('(empty)');
  // Tree should contain at least one element with angle brackets.
  expect(result.tree).toMatch(/<[a-z]/);
});

test('ocr: extracts text from facebook tab via tesseract', async () => {
  test.skip(!hasTesseract(), 'tesseract not installed — run ./install.sh --server');
  test.setTimeout(120_000);

  const result = await call(dash, 'facebook', 'screenshot');
  // OCR is server-side — call it directly via the MCP bridge path would need
  // the MCP server running. Instead, test ocr.js unit directly here.
  const { ocr } = await import('../src/server/ocr.js');
  const text = await ocr(result.dataUrl);

  expect(typeof text).toBe('string');
  expect(text.length).toBeGreaterThan(0);
  // Facebook login or feed page always has visible text.
  expect(text.length).toBeGreaterThan(3);
});
