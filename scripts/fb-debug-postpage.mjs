/**
 * fb-debug-postpage.mjs — debug posting to a Facebook Page.
 *
 * Navigates to a Page URL, waits for hydration, then dumps all relevant
 * composer-related elements to find the right selectors for "post as Page".
 *
 * Usage:
 *   node scripts/fb-debug-postpage.mjs https://www.facebook.com/akaoofficial
 *
 * Reuses the saved session from scripts/.chrome-profile (run fb-login.mjs first).
 */

import { chromium } from 'playwright';
import path         from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const extPath    = path.resolve(__dirname, '../build/browser');
const profileDir = path.resolve(__dirname, '.chrome-profile');

const pageUrl = process.argv[2] ?? 'https://www.facebook.com/akaoofficial';

console.log('Launching with saved session…');
console.log('Target page:', pageUrl);

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

console.log('Navigating…');
await page.goto(pageUrl, { waitUntil: 'load', timeout: 30000 });

console.log('Waiting 4 s for hydration…');
await page.waitForTimeout(4000);

await page.screenshot({ path: path.resolve(__dirname, 'debug-postpage-before.png'), fullPage: false });
console.log('Screenshot (before) → scripts/debug-postpage-before.png');

// ── Dump composer area ─────────────────────────────────────────────────────
const report = await page.evaluate(() => {
  function attrs(el) {
    const out = {};
    for (const a of el.attributes) out[a.name] = a.value.slice(0, 120);
    return out;
  }

  function dump(selector) {
    return [...document.querySelectorAll(selector)].map(el => ({
      tag:       el.tagName.toLowerCase(),
      text:      el.textContent.trim().slice(0, 80),
      attrs:     attrs(el),
    }));
  }

  // Check if we're viewing as page admin (look for "Switch account" or "Act as Page" buttons)
  const switchBtns = dump('[role="button"]').filter(b =>
    /switch|act as|posting as|share as|create post/i.test(b.text + JSON.stringify(b.attrs))
  );

  // Composer triggers
  const triggers = dump('[aria-label="Create a post"], [aria-label*="post"], [aria-label*="Post"], [data-testid*="composer"], [aria-label*="Write"]');

  // Identify whose profile this is (are we the admin?)
  const adminIndicators = dump('[aria-label*="Your Pages"], [aria-label*="Switch"], [data-pagelet="ProfileActions"]');

  // Page header area
  const pageheader = dump('[data-pagelet="ProfileTilesFeed_0"], [data-pagelet="ProfileActions"], [data-pagelet="ProfileTimeline"]').slice(0, 5);

  // All buttons in the page header / actions zone
  const allBtns = [...document.querySelectorAll('[role="button"]')].slice(0, 30).map(el => ({
    text:      el.textContent.trim().slice(0, 60),
    arialabel: el.getAttribute('aria-label'),
  }));

  return {
    url: location.href,
    title: document.title,
    switchBtns,
    triggers,
    adminIndicators,
    allBtns,
  };
});

console.log('\n══════════════════════════════════════════');
console.log('URL   :', report.url);
console.log('Title :', report.title);
console.log('─────────────────────────────────────────');
console.log('Switch/Act-as buttons:', report.switchBtns.length);
for (const b of report.switchBtns) console.log('  ', JSON.stringify(b));
console.log('─────────────────────────────────────────');
console.log('Composer triggers found:', report.triggers.length);
for (const t of report.triggers) console.log('  ', JSON.stringify(t));
console.log('─────────────────────────────────────────');
console.log('Admin indicators:', report.adminIndicators.length);
for (const a of report.adminIndicators) console.log('  ', JSON.stringify(a));
console.log('─────────────────────────────────────────');
console.log('All [role=button] (first 30):');
for (const b of report.allBtns) {
  console.log('  text:', (b.text || '').padEnd(40), '  aria-label:', b.arialabel ?? '');
}
console.log('══════════════════════════════════════════\n');

// ── Now try to find the "Manage Page" / admin view ─────────────────────────
// Facebook Page admins see a "Manage" tab or a banner to switch to Page identity
console.log('Looking for admin/manage elements…');
const adminReport = await page.evaluate(() => {
  const links = [...document.querySelectorAll('a[href]')].filter(a =>
    /manage|admin|create|post/i.test(a.textContent + (a.getAttribute('aria-label') ?? ''))
  ).slice(0, 20).map(a => ({
    text: a.textContent.trim().slice(0, 60),
    href: a.href.slice(0, 100),
    aria: a.getAttribute('aria-label'),
  }));

  // Look for "Act as Page" / "Switch to Page" button
  const actAs = [...document.querySelectorAll('[role="button"], button, [role="menuitem"]')]
    .filter(el => /act as|switch|post as|manage/i.test(el.textContent + (el.getAttribute('aria-label') ?? '')))
    .slice(0, 10)
    .map(el => ({
      tag:  el.tagName.toLowerCase(),
      text: el.textContent.trim().slice(0, 80),
      aria: el.getAttribute('aria-label'),
    }));

  return { links, actAs };
});

console.log('Admin/manage links:', adminReport.links.length);
for (const l of adminReport.links) console.log('  ', l.text.padEnd(40), l.href);
console.log('Act-as / Switch buttons:', adminReport.actAs.length);
for (const b of adminReport.actAs) console.log('  ', JSON.stringify(b));
console.log('══════════════════════════════════════════\n');

await page.screenshot({ path: path.resolve(__dirname, 'debug-postpage-after.png'), fullPage: false });
console.log('Screenshot (after) → scripts/debug-postpage-after.png');

await ctx.close();
