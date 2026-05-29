/**
 * fb-debug-switchmap.mjs
 * Map each page link in [role=main] to its Switch Now button by walking up DOM.
 * Goal: find the minimal ancestor that contains both the page link and its switch button.
 */
import { chromium } from 'playwright';
import path         from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const profileDir = path.resolve(__dirname, '.chrome-profile');
const extPath    = path.resolve(__dirname, '../build/browser');

const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: [`--load-extension=${extPath}`, `--disable-extensions-except=${extPath}`, '--no-first-run'],
});
const page = await ctx.newPage();
await page.goto('https://www.facebook.com/pages/?category=your_pages', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500);

const result = await page.evaluate(() => {
  const main = document.querySelector('[role="main"]');
  if (!main) return { error: 'no main' };

  // Find all facebook page links in main (exclude navigation/help links)
  const pageLinks = [...main.querySelectorAll('a[href]')].filter(a => {
    const u = a.href;
    return /facebook\.com\/[a-zA-Z0-9._-]+\/?$/.test(u) &&
      !/\/(pages|groups|events|marketplace|watch|gaming|home|login|help|privacy|policies)\/?$/.test(u);
  });

  const maps = pageLinks.map(link => {
    // Walk up until we find a container that also has a [role=button] NOT containing this link
    let el = link.parentElement;
    for (let depth = 1; depth <= 20; depth++) {
      if (!el) break;
      const btns = [...el.querySelectorAll('[role="button"]')].filter(b => !b.contains(link));
      if (btns.length > 0) {
        return {
          pageHref:   link.href,
          pageText:   link.textContent.trim().slice(0, 40),
          depth,
          containerTag: el.tagName,
          buttons: btns.map(b => ({
            aria:    b.getAttribute('aria-label'),
            text:    b.textContent.trim().slice(0, 50),
            testid:  b.getAttribute('data-testid'),
            html:    b.outerHTML.slice(0, 300),
          })),
          containerHtml: el.outerHTML.slice(0, 600),
        };
      }
      el = el.parentElement;
    }
    return { pageHref: link.href, depth: -1, error: 'no sibling button found' };
  });

  return { maps };
});

if (result.error) { console.log('ERROR:', result.error); }
else {
  for (const m of result.maps) {
    console.log(`\n═══ ${m.pageText} — ${m.pageHref}`);
    if (m.error) { console.log('  ERROR:', m.error); continue; }
    console.log(`  depth: ${m.depth} | containerTag: ${m.containerTag}`);
    for (const b of m.buttons) {
      console.log(`  btn: aria="${b.aria}" | text="${b.text}" | testid=${b.testid}`);
    }
    console.log('  containerHtml:', m.containerHtml);
  }
}

await ctx.close();
