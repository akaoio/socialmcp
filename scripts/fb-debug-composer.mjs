import { chromium } from 'playwright';
import path         from 'path';
import { fileURLToPath } from 'url';
import fs           from 'fs';
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const profileDir = path.resolve(__dirname, '.chrome-profile');
const extPath    = path.resolve(__dirname, '../build/browser');
const PAGE_URL = process.argv[2] ?? 'https://www.facebook.com/akaoofficial';

const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: [`--load-extension=${extPath}`, `--disable-extensions-except=${extPath}`, '--no-first-run'],
});
const page = await ctx.newPage();

// Step -1: Navigate to pages list and switch to target page
console.log('=== STEP -1: Switch page identity ===');
try { await page.goto('https://www.facebook.com/pages/?category=your_pages', { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch(e) {}
await page.waitForTimeout(3500);

const switchResult = await page.evaluate((pageUrl) => {
  const norm = pageUrl.replace(/\/$/, '').toLowerCase();
  const links = [...document.querySelectorAll('a[href]')];
  const link = links.find(a => {
    try { return new URL(a.href).pathname.replace(/\/$/, '').toLowerCase() === new URL(pageUrl).pathname.replace(/\/$/, '').toLowerCase(); } catch(e) { return false; }
  });
  if (!link) return { switched: false, reason: 'page link not found on /pages/', linkCount: links.length };
  let el = link.parentElement;
  for (let d = 1; d <= 12; d++) {
    if (!el) break;
    const btns = [...el.querySelectorAll('[role="button"]')].filter(b => !b.contains(link));
    if (btns.length === 1) {
      btns[0].click();
      return { switched: true, depth: d, btnText: btns[0].textContent.trim() };
    }
    el = el.parentElement;
  }
  return { switched: false, reason: 'already on this page (no switch btn found within depth 12)' };
}, PAGE_URL);
console.log('Switch result:', switchResult);
await page.waitForTimeout(3000);
await page.screenshot({ path: path.resolve(__dirname, 'debug-c-1-switch.png') });

// Now navigate to the page
console.log('\n=== STEP 0: Navigate to page ===');
try { await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch(e) {}
await page.waitForTimeout(3500);
await page.evaluate(() => window.scrollBy(0, 400));
await page.waitForTimeout(1000);

// Helper: find compose dialog
function findComposeDialog() {
  return page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    return dialogs.find(d => d.querySelector('[contenteditable="true"]') ||
      [...d.querySelectorAll('[role="button"]')].some(b => b.getAttribute('aria-label') === 'Next' || b.textContent.trim() === 'Next'));
  });
}

// Step 0: Dump main area to confirm identity switched
const mainDump = await page.evaluate(() => {
  const main = document.querySelector('[role="main"]');
  if (!main) return { found: false };
  const btns = [...main.querySelectorAll('[role="button"]')].map(b => ({
    aria: b.getAttribute('aria-label'), haspopup: b.getAttribute('aria-haspopup'),
    text: b.textContent.trim().slice(0, 60)
  }));
  return { found: true, btns };
});
console.log('\n=== Main area buttons after switch ===');
for (const b of (mainDump.btns ?? [])) console.log(`  aria="${b.aria}" | haspopup=${b.haspopup} | text="${b.text}"`);
await page.screenshot({ path: path.resolve(__dirname, 'debug-c0-main.png') });

// Step 1: click compose trigger (use Photo/video in main as anchor)
await page.evaluate(() => {
  const main = document.querySelector('[role="main"]');
  const photobtn = [...main.querySelectorAll('[role="button"]')].find(b => b.getAttribute('aria-label') === 'Photo/video');
  if (!photobtn) return;
  let el = photobtn.parentElement;
  for (let d = 1; d <= 10; d++) {
    if (!el) break;
    const btn = [...el.querySelectorAll('[role="button"]')]
      .find(b => !b.getAttribute('aria-label') && !b.getAttribute('aria-haspopup') && b.textContent.trim().length > 0 && !b.querySelector('[role="button"]'));
    if (btn) { btn.click(); return; }
    el = el.parentElement;
  }
});
await page.waitForTimeout(2000);

// Step 2: Click Photo/video button IN the dialog
const clickedPhoto = await page.evaluate(() => {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')];
  const dlg = dialogs.find(d => d.querySelector('[contenteditable="true"]'));
  if (!dlg) return { done: false };
  const photobtn = [...dlg.querySelectorAll('[role="button"]')].find(b => b.getAttribute('aria-label') === 'Photo/video');
  if (!photobtn) return { done: false, reason: 'no Photo/video btn in dialog' };
  photobtn.click();
  return { done: true };
});
console.log('Photo btn in dialog clicked:', clickedPhoto);
await page.waitForTimeout(1500);
await page.screenshot({ path: path.resolve(__dirname, 'debug-c2-photoclicked.png') });

// Step 3: Inspect what appeared (file inputs, buttons)
const afterPhoto = await page.evaluate(() => {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')];
  const dlg = dialogs.find(d => d.querySelector('[contenteditable="true"]') ||
    [...d.querySelectorAll('[role="button"]')].some(b => b.getAttribute('aria-label') === 'Next'));
  if (!dlg) return { found: false };
  const btns = [...dlg.querySelectorAll('[role="button"]')].map(b => ({
    aria: b.getAttribute('aria-label'), text: b.textContent.trim().slice(0,40), disabled: b.getAttribute('aria-disabled')
  }));
  const inputs = [...document.querySelectorAll('input[type="file"]')].map(i => ({ accept: i.accept.slice(0,60) }));
  return { found: true, btns, inputs };
});
console.log('\nAfter photo click - buttons:');
for (const b of (afterPhoto.btns ?? [])) console.log(`  aria="${b.aria}" | text="${b.text}" | disabled=${b.disabled}`);
console.log('File inputs:', afterPhoto.inputs);

// Step 4: Inject test image
const testImg = path.resolve(__dirname, 'debug-c-step2.png');
let injected = false;
if (fs.existsSync(testImg)) {
  const inputs = await page.locator('input[type="file"]').all();
  // Find the photo/video one (accepts video/mp4)
  for (const inp of inputs) {
    const accept = await inp.getAttribute('accept');
    if (accept && accept.includes('video/mp4')) {
      await inp.setInputFiles(testImg);
      injected = true;
      console.log('\nFile injected into video/mp4 input');
      break;
    }
  }
}
if (!injected) console.log('\nNo suitable file input found');
await page.waitForTimeout(2500);
await page.screenshot({ path: path.resolve(__dirname, 'debug-c3-withfile.png') });

// Step 5: Type content
await page.evaluate(() => {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')];
  const dlg = dialogs.find(d => d.querySelector('[contenteditable="true"]'));
  if (!dlg) return;
  const ce = dlg.querySelector('[contenteditable="true"]');
  if (!ce) return;
  ce.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(ce);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand('insertText', false, 'Debug test post — please ignore');
});
await page.waitForTimeout(1000);

// Step 6: Check if Next button became enabled
const nextEnabled = await page.evaluate(() => {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')];
  const dlg = dialogs.find(d => d.querySelector('[contenteditable="true"]') ||
    [...d.querySelectorAll('[role="button"]')].some(b => b.getAttribute('aria-label') === 'Next'));
  if (!dlg) return { found: false };
  const btns = [...dlg.querySelectorAll('[role="button"]')].map(b => ({
    aria: b.getAttribute('aria-label'), text: b.textContent.trim().slice(0,40), disabled: b.getAttribute('aria-disabled')
  }));
  return { found: true, btns };
});
console.log('\nAfter typing - buttons:');
for (const b of (nextEnabled.btns ?? [])) console.log(`  aria="${b.aria}" | text="${b.text}" | disabled=${b.disabled}`);
await page.screenshot({ path: path.resolve(__dirname, 'debug-c4-typed.png') });

// Step 7: Click Next
const nextResult = await page.evaluate(() => {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')];
  const dlg = dialogs.find(d => d.querySelector('[contenteditable="true"]') ||
    [...d.querySelectorAll('[role="button"]')].some(b => b.getAttribute('aria-label') === 'Next'));
  if (!dlg) return { done: false };
  const nextbtn = [...dlg.querySelectorAll('[role="button"]')].find(b => b.getAttribute('aria-label') === 'Next' && b.getAttribute('aria-disabled') !== 'true');
  if (!nextbtn) return { done: false, reason: 'Next disabled or not found' };
  nextbtn.click();
  return { done: true };
});
console.log('\nNext clicked:', nextResult);
await page.waitForTimeout(2500);
await page.screenshot({ path: path.resolve(__dirname, 'debug-c5-afternext.png') });

// Step 8: Dump what appeared after Next
const afterNext = await page.evaluate(() => {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')];
  return dialogs.map(dlg => ({
    btns: [...dlg.querySelectorAll('[role="button"]')].map(b => ({
      aria: b.getAttribute('aria-label'), text: b.textContent.trim().slice(0,50), disabled: b.getAttribute('aria-disabled')
    })),
    ce: !!dlg.querySelector('[contenteditable="true"]'),
  }));
});
console.log('\nAfter Next - all dialogs:');
for (const [i, d] of afterNext.entries()) {
  console.log(`  Dialog ${i}: ce=${d.ce}`);
  for (const b of d.btns) console.log(`    aria="${b.aria}" | text="${b.text}" | disabled=${b.disabled}`);
}

// Step 9: Click Post button
const postResult = await page.evaluate(() => {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')];
  const dlg = dialogs.find(d =>
    [...d.querySelectorAll('[role="button"]')].some(b => b.getAttribute('aria-label') === 'Post' && b.getAttribute('aria-disabled') !== 'true')
  );
  if (!dlg) return { done: false, reason: 'No dialog with Post button found' };
  const postbtn = [...dlg.querySelectorAll('[role="button"]')].find(b => b.getAttribute('aria-label') === 'Post' && b.getAttribute('aria-disabled') !== 'true');
  if (!postbtn) return { done: false, reason: 'Post button not found' };
  postbtn.click();
  return { done: true };
});
console.log('\nPost clicked:', postResult);
await page.waitForTimeout(4000);
await page.screenshot({ path: path.resolve(__dirname, 'debug-c6-afterpost.png') });

// Step 10: Check for WhatsApp or any new dialogs
const afterPost = await page.evaluate(() => {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')];
  return dialogs.map((dlg, i) => ({
    i,
    text: dlg.innerText?.slice(0, 200),
    btns: [...dlg.querySelectorAll('[role="button"]')].map(b => ({
      aria: b.getAttribute('aria-label'), text: b.textContent.trim().slice(0, 60), disabled: b.getAttribute('aria-disabled')
    })),
  }));
});
console.log('\nAfter Post - all dialogs:');
for (const d of afterPost) {
  console.log(`  Dialog ${d.i}: "${d.text?.replace(/\n/g,' ').slice(0,100)}"`);
  for (const b of d.btns) console.log(`    aria="${b.aria}" | text="${b.text}" | disabled=${b.disabled}`);
}
await ctx.close();
