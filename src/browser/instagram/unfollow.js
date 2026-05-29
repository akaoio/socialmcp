import S from './selectors.js';
import { wait, sleep } from '../common/utils.js';

export async function unfollow() {
  const btn = await wait(S.unfollowbtn);
  btn.click();
  await sleep(600);
  try {
    const confirm = await wait(S.unfollowconfirm, 2000);
    confirm.click();
    await sleep(500);
  } catch { /* no confirm */ }
  return { success: true };
}
