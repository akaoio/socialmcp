(function () {
  'use strict';

  /**
   * facebook/selectors.js
   * All CSS selectors for facebook.com in one place.
   * Update only here when Facebook changes markup.
   */

  const S = {
    // Feed composer
    composertrigger: '[aria-label="Create a post"]',
    composerbox:     '[contenteditable="true"][role="textbox"]',
    postbtn:         '[aria-label="Post"][type="submit"]',

    // Feed articles
    article:         '[role="article"]',
    postcontent:     '[data-ad-comet-preview="message"], [data-ad-preview="message"]',
    postauthor:      'h3 a, h4 a',
    postlink:        'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"]',

    // Reactions
    likebtn:         '[aria-label^="Like"][role="button"]:not([aria-label*="comment"])',

    // Comments
    commentarea:     '[aria-label="Write a comment…"]',
    commentinput:    '[contenteditable="true"][aria-label="Write a comment…"]',

    // Search
    searchbox:       '[aria-label="Search Facebook"]',

    // Follow / Unfollow
    followbtn:       '[aria-label="Follow"][role="button"]',
    followingbtn:    '[aria-label="Following"][role="button"]',
    unfollowconfirm: '[aria-label="Unfollow"][role="button"]',

    // Message
    messagebtn:      '[aria-label="Message"][role="button"]',
    messageinput:    '[contenteditable="true"][aria-label*="essage"]',

    // Profile
    profilename:     'h1',
    profilebio:      '[data-overflowtooltip-content]',

    // Photo/video upload inside the post composer
    photobtn:  '[aria-label="Photo/video"], [aria-label="Photo/Video"], [aria-label*="Photo"]',
    fileinput: 'input[type="file"][accept*="image"]',
  };

  /**
   * common/utils.js
   * Shared DOM utilities for all platform content scripts.
   * Exported as plain functions — rollup tree-shakes unused ones per platform.
   */

  function wait(selector, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function check() {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return reject(new Error(`Timeout: ${selector}`));
        setTimeout(check, 200);
      })();
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function type(el, text) {
    el.focus();
    if (el.isContentEditable) {
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
      document.execCommand('insertText', false, text);
    } else {
      const proto  = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function press(el, key) {
    ['keydown', 'keypress', 'keyup'].forEach(t =>
      el.dispatchEvent(new KeyboardEvent(t, { key, code: key, bubbles: true }))
    );
  }

  async function post({ content }) {
    const trigger = await wait(S.composertrigger);
    trigger.click();
    await sleep(600);

    const input = await wait(S.composerbox);
    type(input, content);
    await sleep(400);

    const btn = await wait(S.postbtn);
    btn.click();
    await sleep(1500);

    return { success: true };
  }

  async function comment({ content }) {
    const area = await wait(S.commentarea);
    area.click();
    await sleep(300);

    const input = await wait(S.commentinput);
    type(input, content);
    await sleep(300);
    press(input, 'Enter');
    await sleep(1000);

    return { success: true };
  }

  async function react({ reaction = 'like' }) {
    const btn = await wait(S.likebtn);

    if (reaction === 'like') {
      btn.click();
    } else {
      btn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await sleep(700);
      const picker = document.querySelector(`[aria-label="${cap(reaction)}"]`);
      if (picker) picker.click();
      else btn.click();
    }

    await sleep(500);
    return { success: true };
  }

  function cap(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

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


  async function scroll$1({ count = 10 }, sel) {
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

  function scroll(params) {
    return scroll$1(params, {
      article: S.article,
      text:    S.postcontent,
      author:  S.postauthor,
      link:    S.postlink,
    });
  }

  async function search({ query, type: searchType = 'posts' }) {
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

  async function follow() {
    const btn = await wait(S.followbtn);
    btn.click();
    await sleep(500);
    return { success: true };
  }

  async function unfollow() {
    const btn = await wait(S.followingbtn);
    btn.click();
    await sleep(600);
    try {
      const confirm = await wait(S.unfollowconfirm, 2000);
      confirm.click();
      await sleep(500);
    } catch { /* no confirm dialog */ }
    return { success: true };
  }

  async function message({ content }) {
    const btn = await wait(S.messagebtn);
    btn.click();
    await sleep(1000);

    const input = await wait(S.messageinput);
    type(input, content);
    await sleep(300);
    press(input, 'Enter');
    await sleep(500);

    return { success: true };
  }

  async function profile() {
    const name      = document.querySelector(S.profilename)?.innerText?.trim();
    const bio       = document.querySelector(S.profilebio)?.innerText?.trim();
    const followers = document.querySelector('[aria-label*="follower"]')?.innerText?.trim();
    const following = document.querySelector('[aria-label*="following"]')?.innerText?.trim();

    return { name, bio, followers, following, url: window.location.href };
  }

  /**
   * getpages — scrape the list of Facebook Pages this account manages.
   * Called after background.js navigates the tab to:
   *   https://www.facebook.com/pages/?category=your_pages
   */
  async function getpages() {
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

  /**
   * postpage — post content (with optional image) to a specific Facebook Page.
   * background.js navigates to params.page_url before this handler is called.
   */
  async function postpage({ content = '', image } = {}) {
    await sleep(1500);

    const trigger = await wait(S.composertrigger, 10000);
    trigger.click();
    await sleep(900);

    const box = await wait(S.composerbox, 8000);
    type(box, content);
    await sleep(400);

    if (image) await attachphoto(image);

    const submit = await wait(S.postbtn, 5000);
    submit.click();
    await sleep(2000);

    return { success: true };
  }

  async function attachphoto(dataurl) {
    // Click the Photo/Video button in the composer toolbar
    const photobtn = document.querySelector(S.photobtn);
    if (!photobtn) throw new Error('Photo button not found — update S.photobtn selector');
    photobtn.click();
    await sleep(1200);

    // Inject the image file into the hidden file input
    const fileinput = document.querySelector(S.fileinput);
    if (!fileinput) throw new Error('File input not found — update S.fileinput selector');

    const res  = await fetch(dataurl);
    const blob = await res.blob();
    const ext  = blob.type.split('/')[1] ?? 'jpg';
    const file = new File([blob], `upload.${ext}`, { type: blob.type });
    const dt   = new DataTransfer();
    dt.items.add(file);
    fileinput.files = dt.files;
    fileinput.dispatchEvent(new Event('change', { bubbles: true }));
    fileinput.dispatchEvent(new Event('input',  { bubbles: true }));
    await sleep(1500);
  }

  /**
   * facebook/content.js — entry point (rollup bundles this into build/browser/facebook/content.js)
   */


  const HANDLERS = { post, comment, react, scroll, search, follow, unfollow, message, profile, getpages, postpage };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const handler = HANDLERS[msg.action];
    if (!handler) {
      sendResponse({ error: `Unknown action: ${msg.action}` });
      return false;
    }
    handler(msg.params ?? {})
      .then(result => sendResponse({ result }))
      .catch(err  => sendResponse({ error: err.message }));
    return true;
  });

})();
//# sourceMappingURL=content.js.map
