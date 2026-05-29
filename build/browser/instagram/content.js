(function () {
  'use strict';

  const S = {
    newpostbtn:   'svg[aria-label="New post"]',
    composerimg:  'input[type="file"][accept*="image"]',
    compositext:  '[aria-label="Write a caption…"]',
    nextstep:     'button:has-text("Next"), div[role="button"]:has-text("Next")',
    sharebtn:     'div[role="button"]:has-text("Share")',

    article:      'article',
    postcontent:  'div > span:not([class])',
    postauthor:   'header a',
    postlink:     'a[href*="/p/"]',

    likebtn:      'svg[aria-label="Like"], svg[aria-label="Unlike"]',

    commentbtn:   'svg[aria-label="Comment"]',
    commentinput: 'textarea[aria-label="Add a comment…"]',
    commentpost:  'div[role="button"]:has-text("Post")',

    searchbox:    'input[placeholder="Search"]',
    searchresult: 'div[role="button"]',

    followbtn:    'button:has-text("Follow")',
    unfollowbtn:  'button:has-text("Following"), button:has-text("Requested")',
    unfollowconfirm: 'button:has-text("Unfollow")',

    dmcompose:    'svg[aria-label="New message"]',
    dmsearch:     'input[placeholder="Search…"]',
    dmresult:     'div[role="button"]',
    dmnext:       'div[role="button"]:has-text("Next")',
    dminput:      'textarea[placeholder="Message…"]',
    dmsend:       'div[role="button"]:has-text("Send")',

    profilename:     'h2',
    profilebio:      'div.-vDIg span, section > div:nth-child(2)',
    followerscount:  'a[href$="/followers/"] span, button:has-text("followers") span',
    followingcount:  'a[href$="/following/"] span',
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

    const caption = await wait(S.compositext, 5000).catch(() => null);
    if (caption) {
      type(caption, content);
      await sleep(400);
      const share = await wait(S.sharebtn);
      share.click();
      await sleep(2000);
    }

    return { success: true };
  }

  async function comment({ content }) {
    const btn = await wait(S.commentbtn);
    btn.closest('[role="button"], button')?.click();
    await sleep(400);

    const input = await wait(S.commentinput);
    type(input, content);
    await sleep(300);

    const post = await wait(S.commentpost);
    post.click();
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
    input.click();
    type(input, query);
    await sleep(1000);

    const results = [];
    document.querySelectorAll(S.searchresult).forEach(item => {
      const label = item.innerText?.trim();
      if (label) results.push({ label });
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

  async function message({ user: username, content }) {
    const dmBtn = await wait(S.dmcompose);
    dmBtn.closest('[role="button"], a')?.click();
    await sleep(800);

    const searchInput = await wait(S.dmsearch);
    type(searchInput, username);
    await sleep(800);

    const result = await wait(S.dmresult);
    result.click();
    await sleep(400);

    const next = await wait(S.dmnext);
    next.click();
    await sleep(500);

    const input = await wait(S.dminput);
    type(input, content);
    await sleep(300);
    press(input, 'Enter');
    await sleep(500);

    return { success: true };
  }

  async function profile() {
    const name      = document.querySelector(S.profilename)?.innerText?.trim();
    const bio       = document.querySelector(S.profilebio)?.innerText?.trim();
    const followers = document.querySelector(S.followerscount)?.innerText?.trim();
    const following = document.querySelector(S.followingcount)?.innerText?.trim();

    return { name, bio, followers, following, url: window.location.href };
  }

  /**
   * instagram/content.js � entry point (rollup bundles this into build/browser/instagram/content.js)
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
