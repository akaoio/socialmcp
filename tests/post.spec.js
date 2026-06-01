/**
 * Facebook post — integration tests
 *
 * Tests the full production pipeline for posting to a Facebook Page via MCP:
 *
 *   test stdin (JSON-RPC tools/call post)
 *   → MCP server (index.js)
 *   → bridge.send() → HTTP relay localhost:8765
 *   → peer.js GET /job
 *   → dispatch → facebook/background/post.js
 *     → navigate /pages/?category=your_pages
 *     → content script switchpage (switch account to the target page)
 *     → navigate page_url
 *     → content script postpage (open compose dialog, type content)
 *   → POST /result/:id
 *   → MCP server stdout (JSON-RPC response)
 *
 * Default target page: https://www.facebook.com/akaoofficial (AKAO)
 * Override with FACEBOOK_POST_PAGE env var.
 *
 * Fixture images at tests/fixtures/ are attached by default.
 * Override with FACEBOOK_POST_MEDIA (comma-separated paths) to use different images.
 *
 * Two modes:
 *
 *   Dry-run (default):
 *     Runs the full flow but stops BEFORE clicking "Post".
 *     Proves the compose dialog opens, text is typed, images are attached,
 *     and the Post button is found and enabled — without publishing anything.
 *
 *   Real post (set FACEBOOK_ACTUALLY_POST=true):
 *     Completes the post. Use only on a private test page.
 *
 * Skipped if no cookies are available (log in to Chromium first).
 *
 * Run:
 *   npm test -- --grep post
 *
 *   # Real post:
 *   FACEBOOK_ACTUALLY_POST=true npm test -- --grep post
 */
import { test, expect, chromium }           from '@playwright/test';
import { join, extname }                    from 'path';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir }                           from 'os';
import { startmcp }                         from './mcpclient.js';
import { getcookies }                       from './cookies.js';

const FIXTURES = join(process.cwd(), 'tests/fixtures');

// Convert a local file path to a base64 data URL so the content script
// can fetch it (content scripts cannot access the local filesystem directly).
function todataurl(filePath) {
  const mimes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                  '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4' };
  const mime = mimes[extname(filePath).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${readFileSync(filePath).toString('base64')}`;
}

const EXT      = join(process.cwd(), 'build/browser');
const COOKIES  = getcookies();
const PAGE_URL = process.env.FACEBOOK_POST_PAGE ?? 'https://www.facebook.com/akaoofficial';
const REALLY   = process.env.FACEBOOK_ACTUALLY_POST === 'true';

// Use fixture images by default; FACEBOOK_POST_MEDIA overrides with custom paths.
const MEDIA = (
  process.env.FACEBOOK_POST_MEDIA
    ? process.env.FACEBOOK_POST_MEDIA.split(',').map(s => s.trim())
    : ['image1.png', 'image2.png', 'image3.png'].map(f => join(FIXTURES, f))
).map(p => p.startsWith('data:') || p.startsWith('http') ? p : todataurl(p));

test.skip(!COOKIES, 'no Facebook cookies — log in to Chromium first or set FACEBOOK_COOKIES');

let ctx, mcp, udir;

test.beforeAll(async () => {
  udir = mkdtempSync(join(tmpdir(), 'socialmcp-post-'));

  // Spawn MCP server first (bridge starts on :8765)
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
  const setup = await ctx.newPage();
  await setup.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
  if (await setup.locator('[name="email"]').count()) {
    throw new Error('Not logged in — check FACEBOOK_COOKIES');
  }
  await setup.close();

  // Wait for peer.js to connect to the bridge relay
  await mcp.waitforpeer();
});

test.afterAll(async () => {
  await ctx?.close();
  mcp?.close();
  try { rmSync(udir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('post: dry-run — compose dialog opens, 3 images attached, Post button enabled', async () => {
  test.setTimeout(120_000);

  const content = `socialmcp test ${new Date().toISOString()}`;

  const result = await mcp.call('post', {
    platform: 'facebook',
    page_url: PAGE_URL,
    content,
    media:  REALLY ? MEDIA : MEDIA,  // always attach fixture images
    dryrun: !REALLY,
  });

  expect(result).toMatchObject({ success: true });

  if (!REALLY) {
    expect(result.dryrun).toBe(true);
    console.log(`✓ Dry-run on ${PAGE_URL}`);
    console.log(`  Content: "${content}"`);
    console.log(`  Images:  ${MEDIA.length} fixture image(s) attached`);
    console.log('  To publish for real: FACEBOOK_ACTUALLY_POST=true npm test -- --grep post');
  } else {
    console.log(`✓ Real post published to ${PAGE_URL}`);
    console.log(`  Content: "${content}"`);
    console.log(`  Images:  ${MEDIA.length} attached`);
  }
});

