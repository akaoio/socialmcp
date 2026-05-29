import S from './selectors.js';
import { wait, sleep, type, press } from '../common/utils.js';

export async function search({ query, type: searchType = 'posts' }) {
  const input = await wait(S.searchbox);
  input.click();
  type(input, query);
  press(input, 'Enter');
  await sleep(2000);

  const tabMap = { posts: 'Posts', users: 'People', groups: 'Groups', pages: 'Pages' };
  const tabLabel = tabMap[searchType];
  if (tabLabel) {
    const tab = document.querySelector(`[role="tab"][aria-label="${tabLabel}"]`);
    if (tab) { tab.click(); await sleep(1000); }
  }

  const results = [];
  document.querySelectorAll('[role="article"]').forEach(item => {
    const title = item.querySelector('span')?.innerText?.trim();
    const link  = item.querySelector('a')?.href;
    if (title && link) results.push({ title, link });
  });

  return { results };
}
