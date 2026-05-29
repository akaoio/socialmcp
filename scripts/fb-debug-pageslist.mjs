/**
 * fb-debug-pageslist.mjs
 * Navigate to /pages/?category=your_pages and inspect the Switch Now button structure.
 * Goal: find structural selector for Switch Now next to a specific page.
 */
import { chromium } from 'playwright';
import path         from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const profileDir = path.resolve(__dirname, '.chrome-profile');
const extPath    = path.resolve(__dirname, '../build/browser');

const TARGET_HANDLE = process.argv[2] ?? 'akaoofficial';

const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: [`--load-extension=${extPath}`, `--disable-extensions-except=${extPath}`, '--no-first-run'],
});
const page = await ctx.newPage();
await page.goto('https://www.facebook.com/pages/?category=your_pages', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: path.resolve(__dirname, 'debug-pageslist.png') });

const result = await page.evaluate((handle) => {
  // Find all links on the page
  const allLinks = [...document.querySelectorAll('a[href]')]
    .map(a => ({ href: a.href, text: a.textContent.trim().slice(0, 40) }))
    .filter(a => a.href.includes(handle));

  // Find the card/container for our target page and dump its structure
  const targetLink = [...document.querySelectorAll('a[href]')]
    .find(a => a.href.includes(handle));

  if (!targetLink) {
    // Show all page-related links for diagnosis
    const pageLinks = [...document.querySelectorAll('a[href]')]
      .filter(a => /facebook\.com\/[a-z0-9._]+\/?$/i.test(a.href) && !/(pages|groups|events|marketplace|watch|home|login)/.test(a.href))
      .map(a => ({ href: a.href, text: a.textContent.trim().slice(0, 40) }));
    return { found: false, allLinks, pageLinks };
  }

  // Walk up to find a container with buttons
  let container = targetLink.parentElement;
  let depth = 0;
  while (container && depth < 15) {
    const btns = [...container.querySelectorAll('[role="button"], button')];
    if (btns.length >= 1) break;
    container = container.parentElement;
    depth++;
  }

  // Dump the container's buttons
  const buttons = container
    ? [...container.querySelectorAll('[role="button"], button')].map(b => ({
        tag:      b.tagName,
        role:     b.getAttribute('role'),
        aria:     b.getAttribute('aria-label'),
        haspopup: b.getAttribute('aria-haspopup'),
        testid:   b.getAttribute('data-testid'),
        text:     b.textContent.trim().slice(0, 50),
        html:     b.outerHTML.slice(0, 400),
      }))
    : [];

  // Walk up ancestry for data-pagelet / testid anchors
  function ancestry(el, max = 12) {
    const chain = [];
    let cur = el;
    for (let i = 0; i < max && cur; i++) {
      const info = {
        tag:     cur.tagName,
        role:    cur.getAttribute('role'),
        pagelet: cur.getAttribute('data-pagelet'),
        testid:  cur.getAttribute('data-testid'),
        id:      cur.id || null,
      };
      if (info.role || info.pagelet || info.testid || info.id) chain.push(info);
      cur = cur.parentElement;
    }
    return chain;
  }

  return {
    found:     true,
    linkHref:  targetLink.href,
    linkText:  targetLink.textContent.trim().slice(0, 40),
    containerDepth: depth,
    containerTag:   container?.tagName,
    buttons,
    ancestry: ancestry(targetLink),
    containerHtml: container?.outerHTML?.slice(0, 800),
  };
}, TARGET_HANDLE);

if (!result.found) {
  console.log('Target link NOT found on pages list.');
  console.log('Matching links:', result.allLinks);
  console.log('All page-like links:', result.pageLinks?.slice(0, 20));
} else {
  console.log(`Found link: ${result.linkHref}`);
  console.log(`Container depth: ${result.containerDepth} | tag: ${result.containerTag}`);
  console.log('\n─── Buttons in container ───');
  for (const b of result.buttons) {
    console.log(`  [${b.tag}] role=${b.role} aria=${b.aria} haspopup=${b.haspopup} testid=${b.testid}`);
    console.log(`  text: ${b.text}`);
    console.log(`  html: ${b.html.slice(0, 200)}`);
    console.log('  ---');
  }
  console.log('\n─── Ancestry of target link ───');
  for (const a of result.ancestry) {
    console.log(`  ${a.tag} role=${a.role} pagelet=${a.pagelet} testid=${a.testid} id=${a.id}`);
  }
}

console.log('\nScreenshot saved: debug-pageslist.png');
await ctx.close();
