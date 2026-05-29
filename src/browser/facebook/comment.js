import S from './selectors.js';
import { wait, sleep, type, press } from '../common/utils.js';

export async function comment({ content }) {
  const area = await wait(S.commentarea);
  area.click();
  await sleep(300);

  const input = await wait(S.commentinput);
  type(input, content);
  await sleep(300);
  press(input, 'Enter');
  await sleep(1000);

  return { success: true };
}
