import S from './selectors.js';
import { wait, sleep, type, press } from '../common/utils.js';

export async function message({ content }) {
  const btn = await wait(S.messagebtn);
  btn.click();
  await sleep(1000);

  const input = await wait(S.messageinput);
  type(input, content);
  await sleep(300);
  press(input, 'Enter');
  await sleep(500);

  return { success: true };
}
