/**
 * fb-debug-switchbanner.mjs — find the structural parent of the Switch/Switch Now banner.
 */
import { chromium } from 'playwright';
import path         from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const profileDir = path.resolve(__dirname, '.chrome-profile');
const extPath    = path.resolve(__dirname, '../build/browser');

// Navigate to page as personal identity (NOT admin URL) to see Switch banner
const pageUrl = process.argv[2] ?? 'https://www.facebook.com/akaoofficial';

const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: [`--load-extension=${extPath}`, `--disable-extensions-except=${extPath}`, '--no-first-run'],
});

// To ensure we're in personal identity, open a fresh context by navigating to personal feed first
const page = await ctx.newPage();
await page.goto('https://www.facebook.com/', { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.goto(pageUrl, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

const r = await page.evaluate(() => {
  // Find the Switch Now button (in whatever language), walk up to find pagelet/container
  // We look for any button that has a sibling button and is NOT in main/navigation
  function walkup(el, depth = 0) {
    if (!el || depth > 15) return null;
    return {
      tag:      el.tagName,
      role:     el.getAttribute('role'),
      pagelet:  el.getAttribute('data-pagelet'),
      testid:   el.getAttribute('data-testid'),
      id:       el.id,
      cls:      el.className?.slice(0, 60),
      children: el.children.length,
      parent:   walkup(el.parentElement, depth + 1),
    };
  }

  // Find all role=button pairs (siblings in same container) outside main/navigation
  const allBtns = [...document.querySelectorAll('[role="button"]')];
  const pairedBtns = allBtns.filter(btn => {
    if (btn.closest('[role="main"]') || btn.closest('[role="navigation"]')) return false;
    const parent = btn.parentElement;
    if (!parent) return false;
    const siblings = [...parent.children].filter(c => c.getAttribute('role') === 'button');
    return siblings.length >= 2;
  });

  const switchBannerInfo = pairedBtns.slice(0, 4).map(btn => ({
    text: btn.textContent.trim().slice(0, 40),
    aria: btn.getAttribute('aria-label'),
    ancestors: walkup(btn.parentElement),
  }));

  // Also find all data-pagelet values on the page
  const pagelets = [...document.querySelectorAll('[data-pagelet]')]
    .map(el => el.getAttribute('data-pagelet'))
    .filter(Boolean);

  // Check if composer is present
  const composerPresent = !!document.querySelector('[role="main"] [role="button"][aria-haspopup]');

  return { switchBannerInfo, pagelets, composerPresent };
});

console.log('Composer (aria-haspopup) present:', r.composerPresent);
console.log('\nAll data-pagelet values:', r.pagelets.join(', '));
console.log('\nPaired buttons outside main/navigation:');
for (const b of r.switchBannerInfo) {
  console.log('  text:', b.text, '| aria:', b.aria);
  // Print ancestor chain pagelet/testid
  let a = b.ancestors;
  let depth = 0;
  while (a && depth < 10) {
    if (a.pagelet || a.testid || a.id) {
      console.log(`    depth ${depth}: pagelet=${a.pagelet} testid=${a.testid} id=${a.id} role=${a.role} children=${a.children}`);
    }
    a = a.parent;
    depth++;
  }
}

await ctx.close();
