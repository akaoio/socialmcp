/**
 * common/scroll.js
 * Generic feed-scroll shared by all platforms.
 *
 * @param {object} params   - { count }
 * @param {object} sel      - { article, text, author, link }
 *   article  — selector for the post container
 *   text     — selector for post body text (inside article)
 *   author   — selector for author name (inside article)
 *   link     — selector for permalink anchor (inside article)
 */

import { sleep } from './utils.js';

export async function scroll({ count = 10 }, sel) {
  const seen  = new Set();
  const posts = [];

  for (let attempts = 0; posts.length < count && attempts < 30; attempts++) {
    document.querySelectorAll(sel.article).forEach(item => {
      if (posts.length >= count) return;
      const text   = item.querySelector(sel.text)?.innerText?.trim();
      const author = item.querySelector(sel.author)?.innerText?.trim();
      const link   = item.querySelector(sel.link)?.href;
      if (text && !seen.has(text)) {
        seen.add(text);
        posts.push({ author, text, link });
      }
    });

    if (posts.length < count) {
      window.scrollBy(0, 900);
      await sleep(1200);
    }
  }

  return { posts };
}
