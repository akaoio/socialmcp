import S from './selectors.js';
import { wait, sleep, type } from '../common/utils.js';

async function setfiles(fileinput, urls) {
  const dt = new DataTransfer();
  for (const url of urls.slice(0, 4)) { // X supports max 4 media
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

export async function post({ content, media = [] }) {
  const composerbtn = await wait(S.composerbtn);
  composerbtn.click();
  await sleep(500);

  const input = await wait(S.composerbox);
  type(input, content);
  await sleep(400);

  if (media.length) {
    const fileinput = document.querySelector('input[data-testid="fileInput"]') ??
                      document.querySelector('input[type="file"]');
    if (fileinput) {
      await setfiles(fileinput, media);
      await sleep(3000);
    }
  }

  const btn = await wait(S.postbtn);
  btn.click();
  await sleep(1500);

  return { success: true };
}
