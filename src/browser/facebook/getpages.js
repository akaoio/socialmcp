import { sleep } from '../common/utils.js';

/**
 * getpages — scrape the list of Facebook Pages this account manages.
 * Called after background.js navigates the tab to:
 *   https://www.facebook.com/pages/?category=your_pages
 */
export async function getpages() {
  // Wait for the SPA to hydrate after navigation
  await sleep(3500);

  // Strategy 1 — list items in the main region (modern pages manager)
  let links = [...document.querySelectorAll('[role="main"] [role="listitem"] a[href]')];

  // Strategy 2 — any link inside a grid/list in main that has visible text
  if (!links.length) {
    links = [...document.querySelectorAll('[role="main"] a[href*="facebook.com/"]')]
      .filter(a => a.querySelector('span')?.textContent?.trim().length > 0);
  }

  // Strategy 3 — broadest fallback: any link with an img + span sibling
  if (!links.length) {
    links = [...document.querySelectorAll('a[href*="facebook.com/"]')]
      .filter(a => a.querySelector('img') && a.querySelector('span'));
  }

  const seen  = new Set();
  const pages = [];

  for (const a of links) {
    const href = (a.href || '').split('?')[0].replace(/\/$/, '');
    if (!href || seen.has(href)) continue;

    // Skip non-page URLs
    if (/\/(help|privacy|policies|home|events|groups|marketplace|watch|gaming|notifications)/.test(href)) continue;
    if (href === 'https://www.facebook.com') continue;

    const name = (
      a.querySelector('span[dir]')?.textContent?.trim() ||
      a.querySelector('span')?.textContent?.trim() ||
      a.getAttribute('aria-label')?.trim()
    );
    if (!name || name.length < 2) continue;

    seen.add(href);
    pages.push({ name, url: href });
  }

  return { pages };
}
