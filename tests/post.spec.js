/**
 * Facebook post — integration tests
 *
 * Tests the full production pipeline for posting to a Facebook Page:
 *   dispatch post → background/post.js
 *   → navigate /pages/?category=your_pages
 *   → content script switchpage (switch account to the target page)
 *   → navigate page_url
 *   → content script postpage (open compose dialog, type content)
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
import { test, expect, chromium }    from '@playwright/test';
import { join, extname }             from 'path';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir }                    from 'os';

// Convert a local file path to a base64 data URL so the content script
// can fetch it (content scripts cannot access the local filesystem).
function todataurl(filePath) {
  const mimes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                  '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4' };
  const mime = mimes[extname(filePath).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${readFileSync(filePath).toString('base64')}`;
}

const EXT      = join(process.cwd(), 'build/browser');
const COOKIES  = process.env.FACEBOOK_COOKIES      ? JSON.parse(process.env.FACEBOOK_COOKIES) : null;
const PAGE_URL = process.env.FACEBOOK_POST_PAGE    ?? null;
const REALLY   = process.env.FACEBOOK_ACTUALLY_POST === 'true';
// Convert any local file paths to data URLs so the content script can fetch them.
const MEDIA    = (process.env.FACEBOOK_POST_MEDIA  ? process.env.FACEBOOK_POST_MEDIA.split(',').map(s => s.trim()) : [])
                   .map(p => p.startsWith('data:') || p.startsWith('http') ? p : todataurl(p));

test.skip(!COOKIES || !PAGE_URL,
  'set FACEBOOK_COOKIES and FACEBOOK_POST_PAGE to enable post tests');

let ctx, dash, eid, udir;

test.beforeAll(async () => {
  udir = mkdtempSync(join(tmpdir(), 'socialmcp-post-'));
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

  await ctx.addCookies(COOKIES);
  const setup = await ctx.newPage();
  await setup.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
  if (await setup.locator('[name="email"]').count()) {
    throw new Error('Not logged in — check FACEBOOK_COOKIES');
  }
  await setup.close();

  dash = await ctx.newPage();
  await dash.goto(`chrome-extension://${eid}/dashboard/index.html`);
});

test.afterAll(async () => {
  await ctx?.close();
  try { rmSync(udir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// Helper — sends dispatch message from the dashboard page (real extension path).
async function call(platform, action, params = {}) {
  const resp = await dash.evaluate(
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

test('post: full pipeline — compose dialog opens, content typed, Post button enabled', async () => {
  test.setTimeout(120_000);

  const content  = `Test post — socialmcp ${REALLY ? 'REAL' : 'dry-run'} ${new Date().toISOString()}`;
  const dryrun   = !REALLY;

  const result = await call('facebook', 'post', {
    page_url: PAGE_URL,
    content,
    media: MEDIA,
    dryrun,
  });

  expect(result).toMatchObject({ success: true });

  if (dryrun) {
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
