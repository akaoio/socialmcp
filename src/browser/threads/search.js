import S from './selectors.js';
import { wait, sleep, press } from '../common/utils.js';

export async function search({ query }) {
  const input = await wait(S.searchbox);
  input.focus();
  input.value = query;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  press(input, 'Enter');
  await sleep(1500);

  const results = [];
  document.querySelectorAll('a[href*="/@"]').forEach(a => {
    const label = a.innerText?.trim();
    if (label && a.href) results.push({ label, link: a.href });
  });

  return { results };
}
