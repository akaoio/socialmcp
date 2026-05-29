import S from './selectors.js';
import { wait, sleep, type } from '../common/utils.js';

export async function post({ content }) {
  const composerbtn = await wait(S.composerbtn);
  composerbtn.click();
  await sleep(500);

  const input = await wait(S.composerbox);
  type(input, content);
  await sleep(400);

  const btn = await wait(S.postbtn);
  btn.click();
  await sleep(1500);

  return { success: true };
}
