import S from './selectors.js';
import { wait, sleep } from '../common/utils.js';

export async function react({ reaction = 'like' }) {
  const btn = await wait(S.likebtn);

  if (reaction === 'like') {
    btn.click();
  } else {
    btn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await sleep(700);
    const picker = document.querySelector(`[aria-label="${cap(reaction)}"]`);
    if (picker) picker.click();
    else btn.click();
  }

  await sleep(500);
  return { success: true };
}

function cap(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
