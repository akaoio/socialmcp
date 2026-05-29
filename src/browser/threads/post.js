import S from './selectors.js';
import { wait, sleep, type } from '../common/utils.js';

export async function post({ content }) {
  const btn = await wait(S.newpostbtn);
  btn.closest('[role="button"], a, button')?.click();
  await sleep(600);

  const input = await wait(S.composerbox);
  type(input, content);
  await sleep(400);

  const postbtn = await wait(S.postbtn);
  postbtn.click();
  await sleep(1500);

  return { success: true };
}
