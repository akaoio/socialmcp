import S from './selectors.js';
import { wait, sleep, type } from '../common/utils.js';

export async function comment({ content }) {
  const replybtn = await wait(S.replybtn);
  replybtn.click();
  await sleep(500);

  const input = await wait(S.replyinput);
  type(input, content);
  await sleep(300);

  const btn = await wait(S.replybtnpost);
  btn.click();
  await sleep(1000);

  return { success: true };
}
