import S from './selectors.js';
import { wait, sleep, type } from '../common/utils.js';

/**
 * postpage — post content (with optional image) to a specific Facebook Page.
 * background.js navigates to params.page_url before this handler is called.
 */
export async function postpage({ content = '', image } = {}) {
  await sleep(1500);

  const trigger = await wait(S.composertrigger, 10000);
  trigger.click();
  await sleep(900);

  const box = await wait(S.composerbox, 8000);
  type(box, content);
  await sleep(400);

  if (image) await attachphoto(image);

  const submit = await wait(S.postbtn, 5000);
  submit.click();
  await sleep(2000);

  return { success: true };
}

async function attachphoto(dataurl) {
  // Click the Photo/Video button in the composer toolbar
  const photobtn = document.querySelector(S.photobtn);
  if (!photobtn) throw new Error('Photo button not found — update S.photobtn selector');
  photobtn.click();
  await sleep(1200);

  // Inject the image file into the hidden file input
  const fileinput = document.querySelector(S.fileinput);
  if (!fileinput) throw new Error('File input not found — update S.fileinput selector');

  const res  = await fetch(dataurl);
  const blob = await res.blob();
  const ext  = blob.type.split('/')[1] ?? 'jpg';
  const file = new File([blob], `upload.${ext}`, { type: blob.type });
  const dt   = new DataTransfer();
  dt.items.add(file);
  fileinput.files = dt.files;
  fileinput.dispatchEvent(new Event('change', { bubbles: true }));
  fileinput.dispatchEvent(new Event('input',  { bubbles: true }));
  await sleep(1500);
}
