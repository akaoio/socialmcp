(function () {
  'use strict';

  const S = {
    newpostbtn:   '[aria-label="Create"]',
    composerbox:  'div[contenteditable="true"][role="textbox"]',
    postbtn:      'div[role="button"]:has-text("Post")',

    article:      'article',
    postcontent:  'span[dir="auto"]',
    postauthor:   'a[role="link"] span',
    postlink:     'a[href*="/post/"]',

    likebtn:      'svg[aria-label="Like"], svg[aria-label="Unlike"]',

    replybtn:     'svg[aria-label="Reply"]',
    replyinput:   'div[contenteditable="true"][role="textbox"]',
    replypost:    'div[role="button"]:has-text("Post")',

    searchbox:    'input[name="q"], input[placeholder*="earch"]',

    followbtn:    'div[role="button"]:has-text("Follow")',
    unfollowbtn:  'div[role="button"]:has-text("Following")',
    unfollowconfirm: 'div[role="button"]:has-text("Unfollow")',

    profilename:  'h1, h2',
    profilebio:   'span[dir="auto"]:not(h1 span):not(h2 span)',
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
    const btn = await wait(S.newpostbtn);
    btn.closest('[role="button"], a, button')?.click();
    await sleep(600);

    const input = await wait(S.composerbox);
    type(input, content);
    await sleep(400);

    const postbtn = await wait(S.postbtn);
    postbtn.click();
    await sleep(1500);

    return { success: true };
  }

  async function comment({ content }) {
    const btn = await wait(S.replybtn);
    btn.closest('[role="button"], button')?.click();
    await sleep(500);

    const input = await wait(S.replyinput);
    type(input, content);
    await sleep(300);

    const postbtn = await wait(S.replypost);
    postbtn.click();
    await sleep(1000);

    return { success: true };
  }

  async function react() {
    const btn = await wait(S.likebtn);
    btn.closest('[role="button"], button')?.click();
    await sleep(400);
    return { success: true };
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

  async function search({ query }) {
    const input = await wait(S.searchbox);
    input.focus();
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    press(input, 'Enter');
    await sleep(1500);

    const results = [];
    document.querySelectorAll('a[href*="/@"]').forEach(a => {
      const label = a.innerText?.trim();
      if (label && a.href) results.push({ label, link: a.href });
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
    const btn = await wait(S.unfollowbtn);
    btn.click();
    await sleep(600);
    try {
      const confirm = await wait(S.unfollowconfirm, 2000);
      confirm.click();
      await sleep(500);
    } catch { /* no confirm */ }
    return { success: true };
  }

  async function message() {
    throw new Error('Direct messaging is not available on Threads via DOM automation');
  }

  async function profile() {
    const name = document.querySelector(S.profilename)?.innerText?.trim();
    const bios = [...document.querySelectorAll(S.profilebio)];
    const bio  = bios.find(el => el.innerText?.trim())?.innerText?.trim();

    return { name, bio, url: window.location.href };
  }

  /**
   * threads/content.js � entry point (rollup bundles this into build/browser/threads/content.js)
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
