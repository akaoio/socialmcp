import { sleep }  from '../../../common/sleep.js';
import { filter } from './filter.js';

export async function getpages() {
  await sleep(3500);

  let pages = filter(
    [...document.querySelectorAll('[role="main"] [role="listitem"] a[href]')]
  );

  if (!pages.length) {
    pages = filter(
      [...document.querySelectorAll('[role="main"] a[href*="facebook.com/"]')]
        .filter(a => a.querySelector('span')?.textContent?.trim().length > 0)
    );
  }

  if (!pages.length) {
    pages = filter(
      [...document.querySelectorAll('a[href*="facebook.com/"]')]
        .filter(a => a.querySelector('img') && a.querySelector('span'))
    );
  }

  return { pages };
}
