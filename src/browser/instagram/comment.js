import S from './selectors.js';
import { wait, sleep, type } from '../common/utils.js';

export async function comment({ content }) {
  const btn = await wait(S.commentbtn);
  btn.closest('[role="button"], button')?.click();
  await sleep(400);

  const input = await wait(S.commentinput);
  type(input, content);
  await sleep(300);

  const post = await wait(S.commentpost);
  post.click();
  await sleep(1000);

  return { success: true };
}
