import { selectors }  from './selectors.js';
import { sleep }      from '../../../common/sleep.js';
import { setfiles }   from './setfiles.js';
import { finddialog } from './finddialog.js';
import { dismisswa }  from './dismisswa.js';
import { findtrigger } from './findtrigger.js';

export async function postpage({ content = '', media = [], image } = {}) {
  const files = media?.length ? media : (image ? [image] : []);
  await sleep(2000);
  dismisswa();

  const trigger = await findtrigger(12000);
  trigger.click();
  await sleep(1500);
  dismisswa();

  let dlg = null;
  for (let i = 0; i < 20; i++) { dlg = finddialog(); if (dlg) break; await sleep(400); }
  if (!dlg) throw new Error('Compose dialog did not open');

  if (files.length) {
    const photobtn = [...dlg.querySelectorAll('[role="button"]')]
      .find(b => b.getAttribute('aria-label') === 'Photo/video');
    if (photobtn) { photobtn.click(); await sleep(1500); }

    const fileinput = (
      [...dlg.querySelectorAll(selectors.fileinput)].pop() ??
      [...document.querySelectorAll(selectors.fileinput)].pop()
    );
    if (!fileinput) throw new Error('File input not found');
    await setfiles(fileinput, files);
    await sleep(4000);

    dlg = null;
    for (let i = 0; i < 15; i++) { dlg = finddialog(); if (dlg) break; await sleep(400); }
    if (!dlg) throw new Error('Dialog lost after media attach');
    dismisswa();
  }

  const box = dlg.querySelector('[contenteditable="true"]');
  if (!box) throw new Error('Compose textbox not found');
  box.focus();
  const sel   = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(box);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
  document.execCommand('insertText', false, content);
  await sleep(600);
  dismisswa();

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
