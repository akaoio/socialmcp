/**
 * fb-login.mjs — first-time Facebook login with the extension loaded.
 *
 * Saves the entire browser profile (cookies, localStorage, IndexedDB) to
 * scripts/.chrome-profile so subsequent debug runs don't need you to log in.
 *
 * Usage (run once):
 *   node scripts/fb-login.mjs
 *
 * The browser will open. Log in to Facebook normally, then come back here
 * and press Enter. The session is saved automatically.
 */

import { chromium } from 'playwright';
import path         from 'path';
import { fileURLToPath } from 'url';
import readline      from 'readline';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const extPath    = path.resolve(__dirname, '../build/browser');
const profileDir = path.resolve(__dirname, '.chrome-profile');

console.log('Profile directory:', profileDir);
console.log('Extension:        ', extPath);
console.log('');
console.log('Opening browser… Please log in to Facebook, then come back and press Enter.');
console.log('');

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
await page.goto('https://www.facebook.com/');

// Wait for user to finish logging in
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await new Promise(resolve => rl.question('Press Enter once you are logged in… ', () => {
  rl.close();
  resolve();
}));

console.log('Saving session and closing…');
await ctx.close();
console.log('Done! Session saved to scripts/.chrome-profile');
console.log('You can now run:  node scripts/fb-debug-pages.mjs');
