import { sleep } from '../common/utils.js';

/**
 * getpages — scrape the list of Facebook Pages this account manages.
 * Called after background.js navigates the tab to:
 *   https://www.facebook.com/pages/?category=your_pages
 */
export async function getpages() {
  // Wait for the SPA to hydrate after navigation
  await sleep(3500);

  // Paths that are never page URLs
  const SKIP = /\/(help|privacy|policies|home|events|groups|marketplace|watch|gaming|notifications|latest|inbox|profile\.php)/;

  // Walk up the DOM from a page link to find a sibling notification link
  // whose href contains ?asset_id=, then extract the numeric page ID.
  function findpageid(link) {
    let el = link.parentElement;
    for (let i = 0; i < 12; i++) {
      if (!el) break;
      const notif = el.querySelector('a[href*="latest/home?asset_id="]');
      if (notif) {
        const m = notif.href.match(/asset_id=(\d+)/);
        if (m) return m[1];
      }
      el = el.parentElement;
    }
    return null;
  }

  function filter(links) {
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

  // Strategy 1 — list items in the main region (modern pages manager)
  let pages = filter(
    [...document.querySelectorAll('[role="main"] [role="listitem"] a[href]')]
  );

  // Strategy 2 — any link inside main that has visible span text (fallback)
  if (!pages.length) {
    pages = filter(
      [...document.querySelectorAll('[role="main"] a[href*="facebook.com/"]')]
        .filter(a => a.querySelector('span')?.textContent?.trim().length > 0)
    );
  }

  // Strategy 3 — broadest fallback: any facebook link with img + span
  if (!pages.length) {
    pages = filter(
      [...document.querySelectorAll('a[href*="facebook.com/"]')]
        .filter(a => a.querySelector('img') && a.querySelector('span'))
    );
  }

  return { pages };
}
