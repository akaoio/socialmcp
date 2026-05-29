/**
 * fb-debug-adminpost.mjs — find the Create Post button structure on the Page admin home.
 */
import { chromium } from 'playwright';
import path         from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const profileDir = path.resolve(__dirname, '.chrome-profile');
const extPath    = path.resolve(__dirname, '../build/browser');

const adminUrl = process.argv[2] ?? 'https://www.facebook.com/latest/home?asset_id=843538588847109';

const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: [`--load-extension=${extPath}`, `--disable-extensions-except=${extPath}`, '--no-first-run'],
});
const page = await ctx.newPage();
await page.goto(adminUrl, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

await page.screenshot({ path: path.resolve(__dirname, 'debug-adminpost-before.png') });

const r = await page.evaluate(() => {
  // Find all buttons and their full attributes
  const allbtns = [...document.querySelectorAll('[role="button"], button')].map(el => ({
    tag:      el.tagName,
    role:     el.getAttribute('role'),
    aria:     el.getAttribute('aria-label'),
    haspopup: el.getAttribute('aria-haspopup'),
    expanded: el.getAttribute('aria-expanded'),
    testid:   el.getAttribute('data-testid'),
    text:     el.textContent.trim().slice(0, 60),
    html:     el.outerHTML.slice(0, 300),
  }));

  // Zoom in on those that look like "Create Post"
  const createPost = allbtns.filter(b =>
    /create.?post|write.?post|new.?post/i.test(b.text + b.aria)
  );

  // Also check if there's a textbox/input that acts as a trigger
  const textboxes = [...document.querySelectorAll('[role="textbox"], input[placeholder], [contenteditable="true"]')]
    .map(el => ({
      tag:  el.tagName,
      role: el.getAttribute('role'),
      ph:   el.getAttribute('placeholder'),
      aria: el.getAttribute('aria-label'),
      ce:   el.getAttribute('contenteditable'),
      html: el.outerHTML.slice(0, 300),
    }));

  return { createPost, textboxes, allbtnsCount: allbtns.length };
});

console.log('Total buttons on page:', r.allbtnsCount);
console.log('\n─── Create Post button candidates ───');
for (const b of r.createPost) {
  console.log('text:', b.text);
  console.log('aria:', b.aria, '| haspopup:', b.haspopup, '| testid:', b.testid);
  console.log('html:', b.html);
  console.log('---');
}
console.log('\n─── Textboxes / contenteditable ───');
for (const t of r.textboxes) {
  console.log('tag:', t.tag, '| role:', t.role, '| aria:', t.aria, '| ph:', t.ph);
  console.log('html:', t.html);
  console.log('---');
}

// Now click Create Post and see what happens
console.log('\nClicking Create Post…');
const clicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('[role="button"], button')]
    .find(el => /create.?post/i.test(el.textContent + (el.getAttribute('aria-label') ?? '')));
  if (btn) { btn.click(); return true; }
  return false;
});
console.log('Create Post clicked:', clicked);

if (clicked) {
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.resolve(__dirname, 'debug-adminpost-after.png') });

  // Check what appeared
  const after = await page.evaluate(() => {
    const box = document.querySelector('[role="textbox"][contenteditable="true"]');
    const dialog = document.querySelector('[role="dialog"]');
    const allbtns = [...document.querySelectorAll('[role="button"], button')].slice(0, 20).map(el => ({
      text:  el.textContent.trim().slice(0, 50),
      aria:  el.getAttribute('aria-label'),
      haspopup: el.getAttribute('aria-haspopup'),
    }));
    return {
      textboxFound: !!box,
      dialogFound:  !!dialog,
      boxHtml:      box?.outerHTML?.slice(0, 200),
      allbtns,
    };
  });

  console.log('After click — textbox found:', after.textboxFound, '| dialog found:', after.dialogFound);
  if (after.boxHtml) console.log('Textbox HTML:', after.boxHtml);
  console.log('Buttons after click:');
  for (const b of after.allbtns) {
    console.log('  text:', (b.text || '').padEnd(40), '| aria:', b.aria, '| haspopup:', b.haspopup);
  }
}

await ctx.close();
