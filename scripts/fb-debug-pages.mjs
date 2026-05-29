/**
 * fb-debug-pages.mjs — debug why getpages() misses some Facebook Pages.
 *
 * Reuses the saved session from scripts/.chrome-profile (run fb-login.mjs first).
 * Navigates to the "Your Pages" URL, runs every selector strategy from
 * getpages.js in the real page context, and prints detailed results.
 *
 * Usage:
 *   node scripts/fb-debug-pages.mjs
 *
 * Output: console log + scripts/debug-pages.png screenshot
 */

import { chromium } from 'playwright';
import path         from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const extPath    = path.resolve(__dirname, '../build/browser');
const profileDir = path.resolve(__dirname, '.chrome-profile');

console.log('Launching with saved session…');

const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: [
    `--load-extension=${extPath}`,
    `--disable-extensions-except=${extPath}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
});

const page = await ctx.newPage();

console.log('Navigating to Pages manager…');
await page.goto('https://www.facebook.com/pages/?category=your_pages', {
  waitUntil: 'load',
  timeout: 30000,
});

// Extra wait for SPA hydration (same as getpages.js)
console.log('Waiting 5 s for SPA hydration…');
await page.waitForTimeout(5000);

// ─── Run every selector strategy from getpages.js ───────────────────────────
const report = await page.evaluate(() => {
  const SKIP = /\/(help|privacy|policies|home|events|groups|marketplace|watch|gaming|notifications|latest|inbox|profile\.php)/;

  // Walk up from page link to find nearest notification link → extract asset_id
  function findpageid(link) {
    let el = link.parentElement;
    for (let i = 0; i < 12; i++) {
      if (!el) break;
      const notif = el.querySelector('a[href*="latest/home?asset_id="]');
      if (notif) {
        const m = notif.href.match(/asset_id=(\d+)/);
        if (m) return m[1];
      }
      el = el.parentElement;
    }
    return null;
  }

  function filter(links) {
    const seen  = new Set();
    const pages = [];
    for (const a of links) {
      const href = (a.href || '').split('?')[0].replace(/\/$/, '');
      if (!href || seen.has(href)) continue;
      if (SKIP.test(href)) continue;
      if (href === 'https://www.facebook.com') continue;
      const name = (
        a.querySelector('span[dir]')?.textContent?.trim() ||
        a.querySelector('span')?.textContent?.trim()      ||
        a.getAttribute('aria-label')?.trim()
      );
      if (!name || name.length < 2) continue;
      seen.add(href);
      const id = findpageid(a);
      pages.push({ name, href, id });
    }
    return pages;
  }

  // Strategy 1
  const s1raw   = [...document.querySelectorAll('[role="main"] [role="listitem"] a[href]')];
  const s1pages = filter(s1raw);

  // Strategy 2
  const s2raw   = [...document.querySelectorAll('[role="main"] a[href*="facebook.com/"]')]
    .filter(a => a.querySelector('span')?.textContent?.trim().length > 0);
  const s2pages = filter(s2raw);

  // Strategy 3
  const s3raw   = [...document.querySelectorAll('a[href*="facebook.com/"]')]
    .filter(a => a.querySelector('img') && a.querySelector('span'));
  const s3pages = filter(s3raw);

  // Final result (same logic as fixed getpages.js)
  const finalPages = s1pages.length ? s1pages : (s2pages.length ? s2pages : s3pages);

  // ── Extra diagnostic: all links inside [role="main"] ──
  const allMainLinks = [...document.querySelectorAll('[role="main"] a[href]')]
    .map(a => ({
      href:     a.href,
      text:     a.textContent.trim().slice(0, 80),
      hasSpan:  !!a.querySelector('span'),
      hasImg:   !!a.querySelector('img'),
      role:     a.getAttribute('role'),
      ariaLabel: a.getAttribute('aria-label'),
    }));

  // ── Extra: page title + URL ──
  const pageTitle = document.title;
  const pageUrl   = location.href;

  // ── Extra: all [role="listitem"] counts ──
  const listitemCount = document.querySelectorAll('[role="listitem"]').length;
  const mainListitemCount = document.querySelectorAll('[role="main"] [role="listitem"]').length;

  return {
    pageTitle,
    pageUrl,
    listitemCount,
    mainListitemCount,
    s1: { rawCount: s1raw.length, pages: s1pages },
    s2: { rawCount: s2raw.length, pages: s2pages },
    s3: { rawCount: s3raw.length, pages: s3pages },
    finalPages,
    allMainLinks,
  };
});

// ─── Print report ────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log('Page title :', report.pageTitle);
console.log('Page URL   :', report.pageUrl);
console.log('─────────────────────────────────────────');
console.log(`[role=listitem] on page : ${report.listitemCount}`);
console.log(`[role=listitem] in main : ${report.mainListitemCount}`);
console.log('─────────────────────────────────────────');
console.log(`Strategy 1 — raw links : ${report.s1.rawCount}  →  after filter : ${report.s1.pages.length}`);
for (const p of report.s1.pages) console.log('  ✓', p.name.padEnd(40), p.href);
console.log(`Strategy 2 — raw links : ${report.s2.rawCount}  →  after filter : ${report.s2.pages.length}`);
for (const p of report.s2.pages) console.log('  ✓', p.name.padEnd(40), p.href);
console.log(`Strategy 3 — raw links : ${report.s3.rawCount}  →  after filter : ${report.s3.pages.length}`);
for (const p of report.s3.pages) console.log('  ✓', p.name.padEnd(40), p.href);
console.log('─────────────────────────────────────────');
console.log(`FINAL RESULT (${report.finalPages.length} pages):`);
for (const p of report.finalPages) console.log('  ✓', p.name.padEnd(40), `id:${p.id ?? 'null'}`, p.href);
console.log('─────────────────────────────────────────');
console.log(`All links inside [role="main"] (${report.allMainLinks.length} total):`);
for (const l of report.allMainLinks) {
  console.log(
    ' ', (l.hasImg ? 'img' : '   '), (l.hasSpan ? 'span' : '    '),
    l.href.slice(0, 70).padEnd(72),
    l.text.slice(0, 40),
  );
}
console.log('══════════════════════════════════════════\n');

// Screenshot for visual reference
const shot = path.resolve(__dirname, 'debug-pages.png');
await page.screenshot({ path: shot, fullPage: true });
console.log('Screenshot saved →', shot);

await ctx.close();
