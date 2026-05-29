import S from './selectors.js';
import { wait, sleep, type, press } from '../common/utils.js';

export async function search({ query, type: searchType = 'posts' }) {
  const input = await wait(S.searchbox);
  input.click();
  type(input, query);
  press(input, 'Enter');
  await sleep(2000);

  const tabMap = { posts: 'Top', users: 'People', posts_latest: 'Latest' };
  const tabLabel = tabMap[searchType];
  if (tabLabel) {
    const tab = document.querySelector(`[role="tab"][aria-label="${tabLabel}"]`);
    if (tab) { tab.click(); await sleep(1000); }
  }

  const results = [];
  document.querySelectorAll(S.article).forEach(item => {
    const text = item.querySelector(S.tweettext)?.innerText?.trim();
    const link = item.querySelector(S.tweetlink)?.href;
    if (text && link) results.push({ text, link });
  });

  return { results };
}
