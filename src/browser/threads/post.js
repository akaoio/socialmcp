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

async function clickpost(timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const btn = [...document.querySelectorAll('[role="button"]')]
      .find(el => el.textContent?.trim() === 'Post');
    if (btn) { btn.click(); return; }
    await sleep(400);
  }
  throw new Error('Post button not found');
}

export async function post({ content, media = [] }) {
  const btn = await wait(S.newpostbtn);
  btn.closest('[role="button"], a, button')?.click();
  await sleep(600);

  const input = await wait(S.composerbox);
  type(input, content);
  await sleep(400);

  if (media.length) {
    const fileinput = await wait(S.mediainput, 5000).catch(() => null)
      ?? document.querySelector('input[type="file"]');
    if (fileinput) {
      await setfiles(fileinput, media);
      await sleep(3000);
    }
  }

  await clickpost(8000);
  await sleep(1500);

  return { success: true };
}
