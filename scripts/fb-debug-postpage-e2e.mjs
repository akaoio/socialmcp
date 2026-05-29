/**
 * fb-debug-postpage-e2e.mjs — end-to-end test for the 2-step postpage flow.
 * Simulates what background.js + postpage.js do:
 *   1. Navigate to admin URL (latest/home?asset_id=) → sets page identity
 *   2. Navigate to page handle URL
 *   3. Find composer trigger (structural, no text)
 *   4. Click it, verify composer opens
 *   (Does NOT actually submit the post)
 */
import { chromium } from 'playwright';
import path         from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const profileDir = path.resolve(__dirname, '.chrome-profile');
const extPath    = path.resolve(__dirname, '../build/browser');

const PAGE_ID     = process.argv[2] ?? '843538588847109';
const PAGE_HANDLE = process.argv[3] ?? 'https://www.facebook.com/akaoofficial';

const adminUrl = `https://www.facebook.com/latest/home?asset_id=${PAGE_ID}`;

const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: [`--load-extension=${extPath}`, `--disable-extensions-except=${extPath}`, '--no-first-run'],
});
const page = await ctx.newPage();

// ── Step 1: Admin URL ─────────────────────────────────────────────────────────
console.log('Step 1 — navigating to admin URL:', adminUrl);
await page.goto(adminUrl, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2000);
console.log('Step 1 done. URL now:', page.url());

// ── Step 2: Page handle URL ───────────────────────────────────────────────────
console.log('\nStep 2 — navigating to page handle:', PAGE_HANDLE);
await page.goto(PAGE_HANDLE, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2500);
console.log('Step 2 done. URL now:', page.url());

await page.screenshot({ path: path.resolve(__dirname, 'debug-e2e-landed.png') });

// ── Step 3: Find composer trigger (structural) ────────────────────────────────
const triggerInfo = await page.evaluate(() => {
  const s1 = '[role="main"] [role="button"][aria-haspopup="menu"]:not([aria-expanded="true"])';
  const s2 = '[role="main"] [role="button"][aria-haspopup="dialog"]';
  const s3 = '[role="main"] [role="button"][aria-haspopup]';
  const s4 = '[role="main"] [role="textbox"]';

  const el = document.querySelector(s1) ?? document.querySelector(s2) ??
             document.querySelector(s3) ?? document.querySelector(s4);

  if (!el) {
    // Dump all buttons in main for diagnosis
    const btns = [...document.querySelectorAll('[role="main"] [role="button"]')].map(b => ({
      text:     b.textContent.trim().slice(0, 50),
      aria:     b.getAttribute('aria-label'),
      haspopup: b.getAttribute('aria-haspopup'),
      expanded: b.getAttribute('aria-expanded'),
    }));
    return { found: false, btns };
  }

  return {
    found:    true,
    strategy: el.matches(s1) ? 's1' : el.matches(s2) ? 's2' : el.matches(s3) ? 's3' : 's4',
    text:     el.textContent.trim().slice(0, 50),
    aria:     el.getAttribute('aria-label'),
    haspopup: el.getAttribute('aria-haspopup'),
    html:     el.outerHTML.slice(0, 200),
  };
});

if (!triggerInfo.found) {
  console.log('\n✗ Composer trigger NOT found. Buttons in [role=main]:');
  for (const b of (triggerInfo.btns ?? [])) {
    console.log('  text:', (b.text||'').padEnd(45), '| aria:', b.aria, '| haspopup:', b.haspopup);
  }
  await ctx.close();
  process.exit(1);
}

console.log(`\n✓ Composer trigger found via strategy ${triggerInfo.strategy}`);
console.log('  text:', triggerInfo.text);
console.log('  aria:', triggerInfo.aria, '| haspopup:', triggerInfo.haspopup);

// ── Step 4: Click trigger, verify composer opens ──────────────────────────────
console.log('\nStep 4 — clicking trigger…');
await page.evaluate(() => {
  const el = document.querySelector('[role="main"] [role="button"][aria-haspopup="menu"]:not([aria-expanded="true"])') ??
             document.querySelector('[role="main"] [role="button"][aria-haspopup="dialog"]') ??
             document.querySelector('[role="main"] [role="button"][aria-haspopup]') ??
             document.querySelector('[role="main"] [role="textbox"]');
  el?.click();
});
await page.waitForTimeout(2000);
await page.screenshot({ path: path.resolve(__dirname, 'debug-e2e-composer.png') });

const boxInfo = await page.evaluate(() => {
  const box = document.querySelector('[role="textbox"][contenteditable="true"]');
  return {
    found: !!box,
    aria:  box?.getAttribute('aria-label'),
    ph:    box?.getAttribute('placeholder'),
    html:  box?.outerHTML?.slice(0, 200),
  };
});

if (boxInfo.found) {
  console.log('✓ Composer textbox appeared!');
  console.log('  aria:', boxInfo.aria, '| placeholder:', boxInfo.ph);
  console.log('\n✓ End-to-end flow works correctly — ready for actual posting.');
} else {
  console.log('✗ Textbox not found after clicking trigger.');
  console.log('  Screenshot saved: debug-e2e-composer.png');
}

await ctx.close();
