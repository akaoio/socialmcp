/**
 * Launch Chromium with the built extension and collect all console errors
 * from the service worker + the extensions management page.
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extPath   = path.resolve(__dirname, '../build/browser');

const ctx = await chromium.launchPersistentContext('', {
  headless: false,
  args: [
    `--load-extension=${extPath}`,
    `--disable-extensions-except=${extPath}`,
  ],
});

const errors = [];

// Capture service worker console messages
ctx.on('serviceworker', sw => {
  console.log('[SW registered]', sw.url());
  sw.on('console', msg => {
    if (msg.type() === 'error') errors.push('[SW error] ' + msg.text());
    else console.log('[SW]', msg.type(), msg.text());
  });
});

// Give the service worker time to start and run
await new Promise(r => setTimeout(r, 3000));

// Open a page and capture any errors from it too
const page = await ctx.newPage();
page.on('console', msg => {
  if (msg.type() === 'error') errors.push('[page error] ' + msg.text());
});
page.on('pageerror', err => errors.push('[pageerror] ' + err.message));

// Open the extensions management page to read error badges
await page.goto('chrome://extensions/');
await page.waitForTimeout(2000);

// The extensions page is a custom element — try to pull error text via evaluate
let extErrors = [];
try {
  extErrors = await page.evaluate(() => {
    const mgr = document.querySelector('extensions-manager');
    if (!mgr?.shadowRoot) return ['(no shadow root on extensions-manager)'];
    const items = mgr.shadowRoot.querySelectorAll('extensions-item');
    const result = [];
    items.forEach(item => {
      const name  = item.shadowRoot?.querySelector('#name')?.textContent?.trim();
      const badge = item.shadowRoot?.querySelector('.errors-button');
      if (badge) result.push(`${name}: has error badge`);
    });
    return result;
  });
} catch (e) {
  extErrors.push('Could not read extension items: ' + e.message);
}

console.log('\n=== Extension error badges ===');
if (extErrors.length) extErrors.forEach(e => console.log(' •', e));
else console.log(' (none found via DOM)');

console.log('\n=== Collected console errors ===');
if (errors.length) errors.forEach(e => console.log(' •', e));
else console.log(' (no console errors captured)');

// Take a screenshot of the extensions page for visual inspection
await page.screenshot({ path: 'scripts/ext-errors.png', fullPage: true });
console.log('\nScreenshot saved → scripts/ext-errors.png');

await ctx.close();
