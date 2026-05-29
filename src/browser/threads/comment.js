import S from './selectors.js';
import { wait, sleep, type } from '../common/utils.js';

export async function comment({ content }) {
  const btn = await wait(S.replybtn);
  btn.closest('[role="button"], button')?.click();
  await sleep(500);

  const input = await wait(S.replyinput);
  type(input, content);
  await sleep(300);

  const postbtn = await wait(S.replypost);
  postbtn.click();
  await sleep(1000);

  return { success: true };
}
