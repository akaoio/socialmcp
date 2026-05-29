import S from './selectors.js';
import { wait, sleep } from '../common/utils.js';

export async function follow() {
  const btn = await wait(S.followbtn);
  btn.click();
  await sleep(500);
  return { success: true };
}
