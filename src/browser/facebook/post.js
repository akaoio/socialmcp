import S from './selectors.js';
import { sleep, type } from '../common/utils.js';

async function setfiles(fileinput, urls) {
  const dt = new DataTransfer();
  for (const url of urls) {
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = blob.type.split('/')[1] ?? 'jpg';
    dt.items.add(new File([blob], `upload.${ext}`, { type: blob.type }));
  }
  fileinput.multiple = true;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
  if (setter) setter.call(fileinput, dt.files);
  else fileinput.files = dt.files;
  fileinput.dispatchEvent(new Event('change', { bubbles: true }));
  fileinput.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

function finddialog() {
  return [...document.querySelectorAll('[role="dialog"]')].find(d => d.querySelector('[contenteditable="true"]')) ?? null;
}

function dismisswa() {
  document.querySelector('[aria-label="Not now"]')?.click();
}

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
  throw new Error('Compose trigger not found');
}

export async function post({ content, media = [] }) {
  const trigger = await findtrigger(12000);
  trigger.click();
  await sleep(1000);
  dismisswa();

  let dlg = null;
  for (let i = 0; i < 20; i++) { dlg = finddialog(); if (dlg) break; await sleep(400); }
  if (!dlg) throw new Error('Compose dialog did not open');

  if (media.length) {
    const photobtn = [...dlg.querySelectorAll('[role="button"]')].find(b => b.getAttribute('aria-label') === 'Photo/video');
    if (photobtn) { photobtn.click(); await sleep(1000); }

    const fileinput = (
      [...dlg.querySelectorAll(S.fileinput)].pop() ??
      [...document.querySelectorAll(S.fileinput)].pop()
    );
    if (!fileinput) throw new Error('File input not found');
    await setfiles(fileinput, media);
    await sleep(4000);

    dlg = null;
    for (let i = 0; i < 15; i++) { dlg = finddialog(); if (dlg) break; await sleep(400); }
    if (!dlg) throw new Error('Dialog lost after media attach');
    dismisswa();
  }

  const box = dlg.querySelector('[contenteditable="true"]');
  if (!box) throw new Error('Compose textbox not found');
  type(box, content);
  await sleep(400);

  let postbtn = null;
  for (let i = 0; i < 20; i++) {
    dismisswa();
    const d = finddialog();
    if (d) {
      const b = [...d.querySelectorAll('[role="button"]')].find(
        b => b.getAttribute('aria-label') === 'Post' && b.getAttribute('aria-disabled') !== 'true'
      );
      if (b) { postbtn = b; break; }
    }
    await sleep(400);
  }
  if (!postbtn) throw new Error('Post button not found');
  postbtn.click();
  await sleep(2000);

  return { success: true };
}
