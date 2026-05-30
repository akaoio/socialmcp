import S from './selectors.js';
import { wait, sleep, type } from '../common/utils.js';

async function setfiles(fileinput, urls) {
  const dt = new DataTransfer();
  for (const url of urls) {
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = blob.type.split('/')[1] ?? 'jpg';
    dt.items.add(new File([blob], `upload.${ext}`, { type: blob.type }));
  }
  fileinput.multiple = true;
  fileinput.files = dt.files;
  fileinput.dispatchEvent(new Event('change', { bubbles: true }));
  fileinput.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

async function clicknext(timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const btn = [...document.querySelectorAll('div[role="button"][tabindex="0"]')]
      .find(el => el.textContent?.trim() === 'Next');
    if (btn) { btn.click(); return; }
    await sleep(500);
  }
  throw new Error('Next button not found');
}

async function clickshare(timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const btn = [...document.querySelectorAll('div[role="button"][tabindex="0"]')]
      .find(el => el.textContent?.trim() === 'Share');
    if (btn) { btn.click(); return; }
    await sleep(500);
  }
  throw new Error('Share button not found');
}

export async function post({ content, media = [] }) {
  const btn = await wait(S.newpostbtn);
  btn.closest('[role="button"], a, button')?.click();
  await sleep(600);

  if (media.length) {
    const fileinput = await wait(S.composerimg, 8000);
    await setfiles(fileinput, media);
    await sleep(5000);

    await clicknext(12000); // crop/arrange step
    await sleep(3000);

    await clicknext(12000); // filter/adjust step
    await sleep(3000);
  }

  // Caption editor — try aria-label first, fall back to any contenteditable with aria-placeholder
  const caption = await wait('[aria-label="Write a caption\u2026"]', 8000).catch(() => null)
    ?? [...document.querySelectorAll('[contenteditable="true"]')]
         .find(el => el.getAttribute('aria-placeholder')?.toLowerCase().includes('caption'))
    ?? null;

  if (caption) {
    type(caption, content);
    await sleep(400);
  }

  await clickshare(10000);
  await sleep(2000);

  return { success: true };
}
