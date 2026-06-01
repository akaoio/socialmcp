/**
 * Facebook post — integration tests
 *
 * Tests the full production pipeline for posting to a Facebook Page via MCP:
 *
 *   test stdin (JSON-RPC tools/call post)
 *   → MCP server (index.js)
 *   → bridge.send() → HTTP relay localhost:8420
 *   → peer.js GET /job
 *   → dispatch → facebook/background/post.js
 *     → navigate /pages/?category=your_pages
 *     → content script switchpage (switch account to the target page)
 *     → navigate page_url
 *     → content script postpage (open compose dialog, type content)
 *   → POST /result/:id
 *   → MCP server stdout (JSON-RPC response)
 *
 * Two modes:
 *
 *   Dry-run (default when FACEBOOK_POST_PAGE is set):
 *     Runs the full flow but stops BEFORE clicking "Post".
 *     Proves the compose dialog opens, text is typed, and the Post
 *     button is found and enabled — without publishing anything.
 *
 *   Real post (also set FACEBOOK_ACTUALLY_POST=true):
 *     Completes the post including any media. Use on a private test page
 *     with no audience (e.g. the AKAO page).
 *
 * Required env vars:
 *   FACEBOOK_COOKIES      — JSON cookie array (node scripts/extractcookies.js)
 *   FACEBOOK_POST_PAGE    — Full URL of the Page to post to
 *                           e.g. https://www.facebook.com/akaoofficial
 *
 * Optional:
 *   FACEBOOK_ACTUALLY_POST=true  — actually click Post (default: dry-run)
 *   FACEBOOK_POST_MEDIA          — comma-separated absolute file paths to attach
 *                                  e.g. /path/to/img1.png,/path/to/img2.jpg
 *
 * Run:
 *   FACEBOOK_COOKIES=$(node scripts/extractcookies.js) \
 *   FACEBOOK_POST_PAGE=https://www.facebook.com/yourpage \
 *   npm test -- --grep post
 *
 *   # Real post with image:
 *   FACEBOOK_ACTUALLY_POST=true \
 *   FACEBOOK_POST_MEDIA=/abs/path/to/image.png \
 *   FACEBOOK_COOKIES=$(node scripts/extractcookies.js) \
 *   FACEBOOK_POST_PAGE=https://www.facebook.com/akaoofficial \
 *   npm test -- --grep post
 */
import { test, expect, chromium }           from '@playwright/test';
import { join, extname }                    from 'path';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir }                           from 'os';
import { startmcp }                         from './mcpclient.js';
import { getcookies }                       from './cookies.js';

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
const PAGE_URL = process.env.FACEBOOK_POST_PAGE   ?? null;
const REALLY   = process.env.FACEBOOK_ACTUALLY_POST === 'true';
const MEDIA    = (process.env.FACEBOOK_POST_MEDIA ? process.env.FACEBOOK_POST_MEDIA.split(',').map(s => s.trim()) : [])
                   .map(p => p.startsWith('data:') || p.startsWith('http') ? p : todataurl(p));

test.skip(!COOKIES || !PAGE_URL,
  !COOKIES ? 'no Facebook cookies — log in to Chromium first or set FACEBOOK_COOKIES'
           : 'set FACEBOOK_POST_PAGE to enable post tests');

let ctx, mcp, udir;

test.beforeAll(async () => {
  udir = mkdtempSync(join(tmpdir(), 'socialmcp-post-'));

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

test('post: full MCP pipeline — compose dialog opens, content typed, Post button enabled', async () => {
  test.setTimeout(120_000);

  const content = `Test post — socialmcp ${REALLY ? 'REAL' : 'dry-run'} ${new Date().toISOString()}`;

  const result = await mcp.call('post', {
    platform: 'facebook',
    page_url: PAGE_URL,
    content,
    media:   MEDIA,
    dryrun:  !REALLY,
  });

  expect(result).toMatchObject({ success: true });

  if (!REALLY) {
    expect(result.dryrun).toBe(true);
    console.log(`✓ Dry-run: compose dialog opened, Post button found.`);
    console.log(`  Content: "${content}"`);
    console.log('  To publish for real: set FACEBOOK_ACTUALLY_POST=true');
  } else {
    console.log(`✓ Real post published to ${PAGE_URL}`);
    console.log(`  Content: "${content}"`);
    if (MEDIA.length) console.log(`  Media:   ${MEDIA.join(', ')}`);
  }
});
