import S from './selectors.js';
import { wait, sleep, type } from '../common/utils.js';

export async function search({ query }) {
  const input = await wait(S.searchbox);
  input.click();
  type(input, query);
  await sleep(1000);

  const results = [];
  document.querySelectorAll(S.searchresult).forEach(item => {
    const label = item.innerText?.trim();
    if (label) results.push({ label });
  });

  return { results };
}
