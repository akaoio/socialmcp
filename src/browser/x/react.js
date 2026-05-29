import S from './selectors.js';
import { wait, sleep } from '../common/utils.js';

export async function react() {
  const btn = await wait(S.likebtn);
  btn.click();
  await sleep(400);
  return { success: true };
}
