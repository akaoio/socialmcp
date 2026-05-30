import { findpageid } from './findpageid.js';

const SKIP = /\/(help|privacy|policies|home|events|groups|marketplace|watch|gaming|notifications|latest|inbox|profile\.php)/;

export function filter(links) {
  const seen  = new Set();
  const pages = [];
  for (const a of links) {
    const href = (a.href || '').split('?')[0].replace(/\/$/, '');
    if (!href || seen.has(href)) continue;
    if (SKIP.test(href)) continue;
    if (href === 'https://www.facebook.com') continue;
    const name = (
      a.querySelector('span[dir]')?.textContent?.trim() ||
      a.querySelector('span')?.textContent?.trim()      ||
      a.getAttribute('aria-label')?.trim()
    );
    if (!name || name.length < 2) continue;
    seen.add(href);
    const id = findpageid(a);
    pages.push({ name, url: href, id });
  }
  return pages;
}
