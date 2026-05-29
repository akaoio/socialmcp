import S from './selectors.js';
import { wait, sleep, type, press } from '../common/utils.js';

export async function message({ user: username, content }) {
  const dmBtn = await wait(S.dmcompose);
  dmBtn.closest('[role="button"], a')?.click();
  await sleep(800);

  const searchInput = await wait(S.dmsearch);
  type(searchInput, username);
  await sleep(800);

  const result = await wait(S.dmresult);
  result.click();
  await sleep(400);

  const next = await wait(S.dmnext);
  next.click();
  await sleep(500);

  const input = await wait(S.dminput);
  type(input, content);
  await sleep(300);
  press(input, 'Enter');
  await sleep(500);

  return { success: true };
}
