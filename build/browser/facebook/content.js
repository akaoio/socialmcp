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
   * facebook/content.js — entry point (rollup bundles this into build/browser/facebook/content.js)
   */


  const HANDLERS = { post, comment, react, scroll, search, follow, unfollow, message, profile };

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
