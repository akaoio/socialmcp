/**
 * fb-debug-pageslist2.mjs
 * Inspect page cards in [role=main] on pages list — find Switch Now structural selector.
 */
import { chromium } from 'playwright';
import path         from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const profileDir = path.resolve(__dirname, '.chrome-profile');
const extPath    = path.resolve(__dirname, '../build/browser');

const TARGET_HANDLE = process.argv[2] ?? 'hpoqou'; // pick one with Switch Now

const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: [`--load-extension=${extPath}`, `--disable-extensions-except=${extPath}`, '--no-first-run'],
});
const page = await ctx.newPage();
await page.goto('https://www.facebook.com/pages/?category=your_pages', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500);

const result = await page.evaluate((handle) => {
  const main = document.querySelector('[role="main"]');
  if (!main) return { error: 'No [role=main]' };

  // Find all buttons in main
  const allMainBtns = [...main.querySelectorAll('[role="button"], button')].map(b => ({
    tag:     b.tagName,
    role:    b.getAttribute('role'),
    aria:    b.getAttribute('aria-label'),
    haspopup:b.getAttribute('aria-haspopup'),
    testid:  b.getAttribute('data-testid'),
    text:    b.textContent.trim().slice(0, 60),
    html:    b.outerHTML.slice(0, 300),
  }));

  // Find all links in main
  const mainLinks = [...main.querySelectorAll('a[href]')].map(a => ({
    href: a.href,
    text: a.textContent.trim().slice(0, 40),
  })).filter(a => /facebook\.com\/[a-z0-9._-]+\/?$/i.test(a.href));

  // Find the specific page link
  const targetLink = [...main.querySelectorAll('a[href]')]
    .find(a => a.href.toLowerCase().includes(handle.toLowerCase()));

  if (!targetLink) return { error: 'Target link not found in main', mainLinks, allMainBtns };

  // Walk up to find the card container that also contains a Switch Now button
  let card = targetLink.parentElement;
  for (let i = 0; i < 15; i++) {
    if (!card) break;
    const btns = [...card.querySelectorAll('[role="button"]')];
    if (btns.length >= 2) break; // Notifications + Messages + Switch Now
    card = card.parentElement;
  }

  const cardBtns = card
    ? [...card.querySelectorAll('[role="button"], button')].map(b => ({
        tag:     b.tagName,
        role:    b.getAttribute('role'),
        aria:    b.getAttribute('aria-label'),
        testid:  b.getAttribute('data-testid'),
        text:    b.textContent.trim().slice(0, 60),
        html:    b.outerHTML.slice(0, 400),
      }))
    : [];

  // Get a broader area of the card HTML
  function ancestry(el, max = 12) {
    const chain = [];
    let cur = el;
    for (let i = 0; i < max && cur; i++) {
      chain.push({
        tag:     cur.tagName,
        role:    cur.getAttribute('role'),
        testid:  cur.getAttribute('data-testid'),
        id:      cur.id || null,
        cls:     cur.className?.slice?.(0, 40) || null,
      });
      cur = cur.parentElement;
    }
    return chain;
  }

  return {
    targetLink: targetLink.href,
    card: card?.tagName,
    cardHtml: card?.outerHTML?.slice(0, 1000),
    cardBtns,
    ancestry: ancestry(targetLink, 10),
    allMainBtns: allMainBtns.slice(0, 30),
  };
}, TARGET_HANDLE);

if (result.error) {
  console.log('ERROR:', result.error);
  console.log('Main links:', result.mainLinks?.slice(0, 20));
  console.log('Main buttons:', result.allMainBtns?.slice(0, 20));
} else {
  console.log('Target link:', result.targetLink);
  console.log('Card tag:', result.card);
  console.log('\n─── Ancestry of target link ───');
  for (const a of result.ancestry) {
    console.log(`  ${a.tag} role=${a.role} testid=${a.testid} id=${a.id}`);
  }
  console.log('\n─── Buttons in card ───');
  for (const b of result.cardBtns) {
    console.log(`  [${b.tag}] role=${b.role} | aria="${b.aria}" | testid=${b.testid}`);
    console.log(`  text: "${b.text}"`);
    console.log(`  html: ${b.html.slice(0, 250)}`);
    console.log('  ---');
  }
  console.log('\n─── Card HTML (first 800 chars) ───');
  console.log(result.cardHtml);
}

await ctx.close();
