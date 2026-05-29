import S from './selectors.js';
import { sleep } from '../common/utils.js';

// Find the compose dialog: [role="dialog"] containing contenteditable
function finddialog() {
  return [...document.querySelectorAll('[role="dialog"]')].find(d => d.querySelector('[contenteditable="true"]')) ?? null;
}

// Dismiss WhatsApp "Not now" popup if present
function dismisswa() {
  document.querySelector('[aria-label="Not now"]')?.click();
}

// Find the "What's on your mind?" trigger in [role=main] using Photo/video as anchor.
async function findtrigger(timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const main = document.querySelector('[role="main"]');
    if (main) {
      const photobtn = [...main.querySelectorAll('[role="button"]')].find(b => b.getAttribute('aria-label') === 'Photo/video');
      if (photobtn) {
        let el = photobtn.parentElement;
        for (let d = 1; d <= 10; d++) {
          if (!el) break;
          const btn = [...el.querySelectorAll('[role="button"]')].find(
            b => !b.getAttribute('aria-label') && !b.getAttribute('aria-haspopup') &&
                 b.textContent.trim().length > 0 && !b.querySelector('[role="button"]')
          );
          if (btn) return btn;
          el = el.parentElement;
        }
      }
    }
    await sleep(400);
  }
  throw new Error('Compose trigger not found — is the page loaded and identity switched?');
}

// switchpage — runs on /pages/?category=your_pages
export async function switchpage({ page_url } = {}) {
  await sleep(2000);
  const norm = new URL(page_url).pathname.replace(/\/$/, '').toLowerCase();
  const link = [...document.querySelectorAll('a[href]')].find(a => {
    try { return new URL(a.href).pathname.replace(/\/$/, '').toLowerCase() === norm; } catch { return false; }
  });
  if (!link) return { switched: false, reason: 'page link not found on /pages/' };
  let el = link.parentElement;
  for (let d = 1; d <= 12; d++) {
    if (!el) break;
    const btns = [...el.querySelectorAll('[role="button"]')].filter(b => !b.contains(link));
    if (btns.length === 1) { btns[0].click(); return { switched: true }; }
    el = el.parentElement;
  }
  return { switched: false, reason: 'already active' };
}

// postpage — post content (with optional image) to a Facebook Page.
export async function postpage({ content = '', image } = {}) {
  await sleep(2000);
  dismisswa();

  const trigger = await findtrigger(12000);
  trigger.click();
  await sleep(1500);
  dismisswa();

  // Wait for compose dialog
  let dlg = null;
  for (let i = 0; i < 20; i++) { dlg = finddialog(); if (dlg) break; await sleep(400); }
  if (!dlg) throw new Error('Compose dialog did not open');

  // Type content first
  const box = dlg.querySelector('[contenteditable="true"]');
  if (!box) throw new Error('Compose textbox not found');
  box.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(box);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
  document.execCommand('insertText', false, content);
  await sleep(600);
  dismisswa();

  // Attach photo after typing
  if (image) await attachphoto(image);
  dismisswa();

  // Wait for Next to be enabled — re-query every iteration, click immediately (no stale refs)
  let nexted = false;
  for (let i = 0; i < 40; i++) {
    dismisswa();
    dlg = finddialog();
    if (dlg) {
      const btn = [...dlg.querySelectorAll('[role="button"]')].find(
        b => b.getAttribute('aria-label') === 'Next' && b.getAttribute('aria-disabled') !== 'true'
      );
      if (btn) { btn.click(); nexted = true; break; }
    }
    await sleep(400);
  }
  if (!nexted) throw new Error('Next button never became enabled');
  await sleep(2000);
  dismisswa();

  // Find Post button (in Post Settings dialog that appears after Next)
  let postbtn = null;
  for (let i = 0; i < 25; i++) {
    dismisswa();
    for (const d of document.querySelectorAll('[role="dialog"]')) {
      const b = [...d.querySelectorAll('[role="button"]')].find(
        b => b.getAttribute('aria-label') === 'Post' && b.getAttribute('aria-disabled') !== 'true'
      );
      if (b) { postbtn = b; break; }
    }
    if (postbtn) break;
    await sleep(400);
  }
  if (!postbtn) throw new Error('Post button not found');
  postbtn.click();
  await sleep(4000);
  dismisswa();

  return { success: true };
}

async function attachphoto(dataurl) {
  // Click Photo/video in the dialog to open the upload area
  const dlg = finddialog();
  if (!dlg) throw new Error('Dialog not found for photo attach');
  const photobtn = [...dlg.querySelectorAll('[role="button"]')].find(b => b.getAttribute('aria-label') === 'Photo/video');
  if (photobtn) { photobtn.click(); await sleep(1500); }

  // Prefer file input scoped inside the dialog; fall back to document-wide
  const fileinput = (
    [...dlg.querySelectorAll('input[type="file"]')].find(i => i.accept.includes('video/mp4')) ??
    [...document.querySelectorAll('input[type="file"]')].find(i => i.accept.includes('video/mp4'))
  );
  if (!fileinput) throw new Error('File input not found');

  const res  = await fetch(dataurl);
  const blob = await res.blob();
  const ext  = blob.type.split('/')[1] ?? 'jpg';
  const file = new File([blob], `upload.${ext}`, { type: blob.type });
  const dt   = new DataTransfer();
  dt.items.add(file);

  // Use native setter so React's synthetic event system picks up the change
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
  if (nativeSetter) nativeSetter.call(fileinput, dt.files);
  else fileinput.files = dt.files;

  fileinput.dispatchEvent(new Event('change', { bubbles: true }));
  fileinput.dispatchEvent(new InputEvent('input', { bubbles: true }));

  // Wait until Facebook acknowledges the file (Remove Post Attachment button appears)
  for (let i = 0; i < 25; i++) {
    dismisswa();
    const d = finddialog();
    if (d?.querySelector('[aria-label="Remove Post Attachment"]')) break;
    await sleep(400);
  }
}

