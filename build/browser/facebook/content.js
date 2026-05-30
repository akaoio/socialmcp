(function () {
  'use strict';

  /**
   * facebook/selectors.js
   * All CSS selectors for facebook.com in one place.
   * Update only here when Facebook changes markup.
   */

  const S = {
    // Feed composer
    composerbox:     '[contenteditable="true"][role="textbox"]',

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

    // Post composer (inside compose dialog)
    photobtn:        '[aria-label="Photo/video"]',
    fileinput:       'input[type="file"][accept*="video/mp4"]',
    nextbtn:         '[aria-label="Next"]',
    postbtn:         '[aria-label="Post"]',
    whatsappdismiss: '[aria-label="Not now"]',
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

  async function setfiles$1(fileinput, urls) {
    const dt = new DataTransfer();
    for (const url of urls) {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = blob.type.split('/')[1] ?? 'jpg';
      dt.items.add(new File([blob], `upload.${ext}`, { type: blob.type }));
    }
    fileinput.multiple = true;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
    if (setter) setter.call(fileinput, dt.files);
    else fileinput.files = dt.files;
    fileinput.dispatchEvent(new Event('change', { bubbles: true }));
    fileinput.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }

  function finddialog$1() {
    return [...document.querySelectorAll('[role="dialog"]')].find(d => d.querySelector('[contenteditable="true"]')) ?? null;
  }

  function dismisswa$1() {
    document.querySelector('[aria-label="Not now"]')?.click();
  }

  async function findtrigger$1(timeout = 12000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const main = document.querySelector('[role="main"]');
      if (main) {
        const photobtn = [...main.querySelectorAll('[role="button"]')].find(b => b.getAttribute('aria-label') === 'Photo/video');
        if (photobtn) {
          let el = photobtn.parentElement;
          for (let d = 1; d <= 10; d++) {
            if (!el) break;
            const btn = [...el.querySelectorAll('[role="button"]')].find(
              b => !b.getAttribute('aria-label') && !b.getAttribute('aria-haspopup') &&
                   b.textContent.trim().length > 0 && !b.querySelector('[role="button"]')
            );
            if (btn) return btn;
            el = el.parentElement;
          }
        }
      }
      await sleep(400);
    }
    throw new Error('Compose trigger not found');
  }

  async function post({ content, media = [] }) {
    const trigger = await findtrigger$1(12000);
    trigger.click();
    await sleep(1000);
    dismisswa$1();

    let dlg = null;
    for (let i = 0; i < 20; i++) { dlg = finddialog$1(); if (dlg) break; await sleep(400); }
    if (!dlg) throw new Error('Compose dialog did not open');

    if (media.length) {
      const photobtn = [...dlg.querySelectorAll('[role="button"]')].find(b => b.getAttribute('aria-label') === 'Photo/video');
      if (photobtn) { photobtn.click(); await sleep(1000); }

      const fileinput = (
        [...dlg.querySelectorAll(S.fileinput)].pop() ??
        [...document.querySelectorAll(S.fileinput)].pop()
      );
      if (!fileinput) throw new Error('File input not found');
      await setfiles$1(fileinput, media);
      await sleep(4000);

      dlg = null;
      for (let i = 0; i < 15; i++) { dlg = finddialog$1(); if (dlg) break; await sleep(400); }
      if (!dlg) throw new Error('Dialog lost after media attach');
      dismisswa$1();
    }

    const box = dlg.querySelector('[contenteditable="true"]');
    if (!box) throw new Error('Compose textbox not found');
    type(box, content);
    await sleep(400);

    let postbtn = null;
    for (let i = 0; i < 20; i++) {
      dismisswa$1();
      const d = finddialog$1();
      if (d) {
        const b = [...d.querySelectorAll('[role="button"]')].find(
          b => b.getAttribute('aria-label') === 'Post' && b.getAttribute('aria-disabled') !== 'true'
        );
        if (b) { postbtn = b; break; }
      }
      await sleep(400);
    }
    if (!postbtn) throw new Error('Post button not found');
    postbtn.click();
    await sleep(2000);

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

  async function setfiles(fileinput, urls) {
    const dt = new DataTransfer();
    for (const url of urls) {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = blob.type.split('/')[1] ?? 'jpg';
      dt.items.add(new File([blob], `upload.${ext}`, { type: blob.type }));
    }
    fileinput.multiple = true;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
    if (setter) setter.call(fileinput, dt.files);
    else fileinput.files = dt.files;
    fileinput.dispatchEvent(new Event('change', { bubbles: true }));
    fileinput.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }

  // Find the compose dialog: [role="dialog"] containing contenteditable
  function finddialog() {
    return [...document.querySelectorAll('[role="dialog"]')].find(d => d.querySelector('[contenteditable="true"]')) ?? null;
  }

  // Dismiss WhatsApp "Not now" popup if present
  function dismisswa() {
    document.querySelector('[aria-label="Not now"]')?.click();
  }

  // Find the "What's on your mind?" trigger in [role=main] using Photo/video as anchor.
  async function findtrigger(timeout = 12000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const main = document.querySelector('[role="main"]');
      if (main) {
        const photobtn = [...main.querySelectorAll('[role="button"]')].find(b => b.getAttribute('aria-label') === 'Photo/video');
        if (photobtn) {
          let el = photobtn.parentElement;
          for (let d = 1; d <= 10; d++) {
            if (!el) break;
            const btn = [...el.querySelectorAll('[role="button"]')].find(
              b => !b.getAttribute('aria-label') && !b.getAttribute('aria-haspopup') &&
                   b.textContent.trim().length > 0 && !b.querySelector('[role="button"]')
            );
            if (btn) return btn;
            el = el.parentElement;
          }
        }
      }
      await sleep(400);
    }
    throw new Error('Compose trigger not found — is the page loaded and identity switched?');
  }

  // switchpage — runs on /pages/?category=your_pages
  async function switchpage({ page_url } = {}) {
    await sleep(2000);
    const norm = new URL(page_url).pathname.replace(/\/$/, '').toLowerCase();
    const link = [...document.querySelectorAll('a[href]')].find(a => {
      try { return new URL(a.href).pathname.replace(/\/$/, '').toLowerCase() === norm; } catch { return false; }
    });
    if (!link) return { switched: false, reason: 'page link not found on /pages/' };
    let el = link.parentElement;
    for (let d = 1; d <= 12; d++) {
      if (!el) break;
      const btns = [...el.querySelectorAll('[role="button"]')].filter(b => !b.contains(link));
      if (btns.length === 1) { btns[0].click(); return { switched: true }; }
      el = el.parentElement;
    }
    return { switched: false, reason: 'already active' };
  }

  // postpage — post to a Facebook Page (with optional media array).
  async function postpage({ content = '', media = [], image } = {}) {
    const files = media?.length ? media : (image ? [image] : []);
    await sleep(2000);
    dismisswa();

    const trigger = await findtrigger(12000);
    trigger.click();
    await sleep(1500);
    dismisswa();

    let dlg = null;
    for (let i = 0; i < 20; i++) { dlg = finddialog(); if (dlg) break; await sleep(400); }
    if (!dlg) throw new Error('Compose dialog did not open');

    // Attach media FIRST — typing after avoids text loss when Facebook switches to album mode
    if (files.length) {
      const photobtn = [...dlg.querySelectorAll('[role="button"]')].find(b => b.getAttribute('aria-label') === 'Photo/video');
      if (photobtn) { photobtn.click(); await sleep(1500); }

      const fileinput = (
        [...dlg.querySelectorAll(S.fileinput)].pop() ??
        [...document.querySelectorAll(S.fileinput)].pop()
      );
      if (!fileinput) throw new Error('File input not found');
      await setfiles(fileinput, files);
      await sleep(4000);

      dlg = null;
      for (let i = 0; i < 15; i++) { dlg = finddialog(); if (dlg) break; await sleep(400); }
      if (!dlg) throw new Error('Dialog lost after media attach');
      dismisswa();
    }

    const box = dlg.querySelector('[contenteditable="true"]');
    if (!box) throw new Error('Compose textbox not found');
    box.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(box);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.execCommand('insertText', false, content);
    await sleep(600);
    dismisswa();

    // Wait for Next to be enabled
    let nexted = false;
    for (let i = 0; i < 40; i++) {
      dismisswa();
      dlg = finddialog();
      if (dlg) {
        const btn = [...dlg.querySelectorAll('[role="button"]')].find(
          b => b.getAttribute('aria-label') === 'Next' && b.getAttribute('aria-disabled') !== 'true'
        );
        if (btn) { btn.click(); nexted = true; break; }
      }
      await sleep(400);
    }
    if (!nexted) throw new Error('Next button never became enabled');
    await sleep(2000);
    dismisswa();

    // Find Post button (in Post Settings dialog after Next)
    let postbtn = null;
    for (let i = 0; i < 25; i++) {
      dismisswa();
      for (const d of document.querySelectorAll('[role="dialog"]')) {
        const b = [...d.querySelectorAll('[role="button"]')].find(
          b => b.getAttribute('aria-label') === 'Post' && b.getAttribute('aria-disabled') !== 'true'
        );
        if (b) { postbtn = b; break; }
      }
      if (postbtn) break;
      await sleep(400);
    }
    if (!postbtn) throw new Error('Post button not found');
    postbtn.click();
    await sleep(4000);
    dismisswa();

    return { success: true };
  }

  /**
   * facebook/content.js — entry point (rollup bundles this into build/browser/facebook/content.js)
   */


  const HANDLERS = { post, comment, react, scroll, search, follow, unfollow, message, profile, getpages, postpage, switchpage };

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
