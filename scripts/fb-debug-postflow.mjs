/**
 * fb-debug-postflow.mjs — simulate the full post flow after switching to Page identity.
 *
 * Does NOT actually submit — stops just before clicking the Post button.
 *
 * Usage:
 *   node scripts/fb-debug-postflow.mjs https://www.facebook.com/akaoofficial
 */
import { chromium } from 'playwright';
import path         from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const profileDir = path.resolve(__dirname, '.chrome-profile');
const extPath    = path.resolve(__dirname, '../build/browser');

const pageUrl = process.argv[2] ?? 'https://www.facebook.com/akaoofficial';

const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: [`--load-extension=${extPath}`, `--disable-extensions-except=${extPath}`, '--no-first-run'],
});
const page = await ctx.newPage();
await page.goto(pageUrl, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

// Step 1: Switch Now
const sw = await page.$('[aria-label="Switch Now"]');
if (sw) {
  console.log('[1] Clicking Switch Now…');
  await sw.click();
  await page.waitForTimeout(4500);
  console.log('[1] Done. URL:', page.url());
} else {
  console.log('[1] No Switch Now button — already acting as Page.');
}

await page.screenshot({ path: path.resolve(__dirname, 'debug-flow-1-switched.png') });

// Step 2: Find composer trigger (aria-label OR text content)
console.log('[2] Looking for composer trigger…');
const trigger = await page.evaluate(() => {
  const byAria = document.querySelector('[aria-label="Create a post"]');
  if (byAria) return { method: 'aria', text: byAria.textContent.trim().slice(0, 60) };
  const byText = [...document.querySelectorAll('[role="button"]')].find(el =>
    /share a thought|what.s on your mind/i.test(el.textContent)
  );
  if (byText) return { method: 'text', text: byText.textContent.trim().slice(0, 60) };
  return null;
});
console.log('[2] Trigger found:', JSON.stringify(trigger));

if (!trigger) {
  console.log('ERROR: Composer trigger not found. Dumping all [role=button]:');
  const btns = await page.evaluate(() =>
    [...document.querySelectorAll('[role="button"]')].slice(0, 30).map(el => ({
      text: el.textContent.trim().slice(0, 60),
      aria: el.getAttribute('aria-label'),
    }))
  );
  for (const b of btns) console.log(' ', b.text.padEnd(40), b.aria ?? '');
  await ctx.close();
  process.exit(1);
}

// Click the trigger
if (trigger.method === 'aria') {
  await page.click('[aria-label="Create a post"]');
} else {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[role="button"]')].find(el =>
      /share a thought|what.s on your mind/i.test(el.textContent)
    );
    el?.click();
  });
}
console.log('[2] Clicked trigger.');
await page.waitForTimeout(1500);
await page.screenshot({ path: path.resolve(__dirname, 'debug-flow-2-composer.png') });

// Step 3: Check if composer dialog opened
const composerbox = await page.$('[contenteditable="true"][role="textbox"]');
console.log('[3] Composer textbox found:', !!composerbox);

if (composerbox) {
  // Type test content
  await composerbox.click();
  await page.keyboard.type('[TEST] Playwright debug — will not submit', { delay: 30 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.resolve(__dirname, 'debug-flow-3-typed.png') });

  // Check post button
  const postbtn = await page.$('[aria-label="Post"][type="submit"]');
  console.log('[4] Post button found:', !!postbtn);

  if (!postbtn) {
    // Try alternative post button selectors
    const r = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('button, [role="button"]')].filter(el =>
        /^post$/i.test(el.textContent.trim()) || /^post$/i.test(el.getAttribute('aria-label') ?? '')
      );
      return candidates.map(el => ({
        tag:  el.tagName,
        text: el.textContent.trim().slice(0, 40),
        aria: el.getAttribute('aria-label'),
        type: el.getAttribute('type'),
        disabled: el.disabled,
      }));
    });
    console.log('[4] Alternative post buttons:', JSON.stringify(r));
  }

  console.log('✓ Flow looks OK up to submission. NOT submitting (debug mode).');
  console.log('  Close the browser manually to dismiss the composer dialog.');
  await page.waitForTimeout(5000);
} else {
  console.log('[3] ERROR: No textbox found after clicking trigger.');
  const all = await page.evaluate(() =>
    [...document.querySelectorAll('[contenteditable]')].map(el => ({
      ce: el.getAttribute('contenteditable'),
      role: el.getAttribute('role'),
      aria: el.getAttribute('aria-label'),
      text: el.textContent.trim().slice(0, 40),
    }))
  );
  console.log('All contenteditable:', JSON.stringify(all, null, 2));
}

await ctx.close();
