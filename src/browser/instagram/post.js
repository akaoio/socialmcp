import S from './selectors.js';
import { wait, sleep, type } from '../common/utils.js';

export async function post({ content }) {
  const btn = await wait(S.newpostbtn);
  btn.closest('[role="button"], a, button')?.click();
  await sleep(600);

  const caption = await wait(S.compositext, 5000).catch(() => null);
  if (caption) {
    type(caption, content);
    await sleep(400);
    const share = await wait(S.sharebtn);
    share.click();
    await sleep(2000);
  }

  return { success: true };
}
