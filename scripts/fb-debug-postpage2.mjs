/**
 * fb-debug-postpage2.mjs — check what happens AFTER clicking Switch Now.
 *
 * Usage:
 *   node scripts/fb-debug-postpage2.mjs https://www.facebook.com/akaoofficial
 */

import { chromium } from 'playwright';
import path         from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const extPath    = path.resolve(__dirname, '../build/browser');
const profileDir = path.resolve(__dirname, '.chrome-profile');

const pageUrl = process.argv[2] ?? 'https://www.facebook.com/akaoofficial';

const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: [
    `--load-extension=${extPath}`,
    `--disable-extensions-except=${extPath}`,
    '--no-first-run',
  ],
});

const page = await ctx.newPage();
await page.goto(pageUrl, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

// Check if Switch Now button is present
const hasSwitchNow = await page.$('[aria-label="Switch Now"]');
console.log('Switch Now button present:', !!hasSwitchNow);

if (hasSwitchNow) {
  console.log('Clicking Switch Now…');
  await hasSwitchNow.click();

  // Wait for navigation / reload
  await page.waitForTimeout(5000);

  await page.screenshot({ path: path.resolve(__dirname, 'debug-switched.png'), fullPage: false });

  const afterReport = await page.evaluate(() => {
    // Is Switch Now gone now?
    const switchGone = !document.querySelector('[aria-label="Switch Now"]');

    // Is composer available?
    const composer = !!document.querySelector('[aria-label="Create a post"]');

    // What URL are we on?
    const url = location.href;

    // All buttons for context
    const btns = [...document.querySelectorAll('[role="button"]')].slice(0, 20).map(el => ({
      text:  el.textContent.trim().slice(0, 60),
      aria:  el.getAttribute('aria-label'),
    }));

    return { switchGone, composer, url, btns };
  });

  console.log('\n══════════════════════════════════════════');
  console.log('After Switch Now:');
  console.log('  URL          :', afterReport.url);
  console.log('  Switch gone  :', afterReport.switchGone);
  console.log('  Composer found:', afterReport.composer);
  console.log('─────────────────────────────────────────');
  console.log('Buttons:');
  for (const b of afterReport.btns) {
    console.log('  text:', (b.text || '').padEnd(40), '  aria:', b.aria ?? '');
  }
  console.log('══════════════════════════════════════════\n');
} else {
  console.log('No Switch Now button — already acting as Page.');

  const r = await page.evaluate(() => ({
    composer: !!document.querySelector('[aria-label="Create a post"]'),
    url: location.href,
  }));
  console.log('Composer available:', r.composer);
  console.log('URL:', r.url);
}

await ctx.close();
