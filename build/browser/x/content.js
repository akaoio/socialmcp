(function () {
  'use strict';

  const S = {
    composerbtn:  '[data-testid="SideNav_NewTweet_Button"], [aria-label="Post"]',
    composerbox:  '[data-testid="tweetTextarea_0"]',
    postbtn:      '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]',

    article:      'article[data-testid="tweet"]',
    tweettext:    '[data-testid="tweetText"]',
    tweetauthor:  '[data-testid="User-Name"]',
    tweetlink:    'a[href*="/status/"]',

    likebtn:      '[data-testid="like"]',

    replybtn:     '[data-testid="reply"]',
    replyinput:   '[data-testid="tweetTextarea_0"]',
    replybtnpost: '[data-testid="tweetButton"]',

    searchbox:    '[data-testid="SearchBox_Search_Input"]',

    followbtn:    '[data-testid$="-follow"]',
    unfollowbtn:  '[data-testid$="-unfollow"]',
    unfollowconfirm: '[data-testid="confirmationSheetConfirm"]',

    dmcompose:    '[aria-label="New message"]',
    dmsearch:     '[aria-label="Search people"]',
    dmresult:     '[data-testid="TypeaheadUser"]',
    dmnext:       '[data-testid="multi-destination-user-form-next-button"]',
    dminput:      '[data-testid="dmComposerTextInput"]',
    dmsend:       '[data-testid="dmComposerSendButton"]',

    profilename:   '[data-testid="UserName"]',
    profilebio:    '[data-testid="UserDescription"]',
    followerslink: 'a[href$="/followers"]',
    followinglink: 'a[href$="/following"]',
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

  async function setfiles(fileinput, urls) {
    const dt = new DataTransfer();
    for (const url of urls.slice(0, 4)) { // X supports max 4 media
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

  async function post({ content, media = [] }) {
    const composerbtn = await wait(S.composerbtn);
    composerbtn.click();
    await sleep(500);

    const input = await wait(S.composerbox);
    type(input, content);
    await sleep(400);

    if (media.length) {
      const fileinput = document.querySelector('input[data-testid="fileInput"]') ??
                        document.querySelector('input[type="file"]');
      if (fileinput) {
        await setfiles(fileinput, media);
        await sleep(3000);
      }
    }

    const btn = await wait(S.postbtn);
    btn.click();
    await sleep(1500);

    return { success: true };
  }

  async function comment({ content }) {
    const replybtn = await wait(S.replybtn);
    replybtn.click();
    await sleep(500);

    const input = await wait(S.replyinput);
    type(input, content);
    await sleep(300);

    const btn = await wait(S.replybtnpost);
    btn.click();
    await sleep(1000);

    return { success: true };
  }

  async function react() {
    const btn = await wait(S.likebtn);
    btn.click();
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
      text:    S.tweettext,
      author:  S.tweetauthor,
      link:    S.tweetlink,
    });
  }

  async function search({ query, type: searchType = 'posts' }) {
    const input = await wait(S.searchbox);
    input.click();
    type(input, query);
    press(input, 'Enter');
    await sleep(2000);

    const tabMap = { posts: 'Top', users: 'People', posts_latest: 'Latest' };
    const tabLabel = tabMap[searchType];
    if (tabLabel) {
      const tab = document.querySelector(`[role="tab"][aria-label="${tabLabel}"]`);
      if (tab) { tab.click(); await sleep(1000); }
    }

    const results = [];
    document.querySelectorAll(S.article).forEach(item => {
      const text = item.querySelector(S.tweettext)?.innerText?.trim();
      const link = item.querySelector(S.tweetlink)?.href;
      if (text && link) results.push({ text, link });
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
    dmBtn.click();
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

    const send = await wait(S.dmsend);
    send.click();
    await sleep(500);

    return { success: true };
  }

  async function profile() {
    const name      = document.querySelector(S.profilename)?.innerText?.trim();
    const bio       = document.querySelector(S.profilebio)?.innerText?.trim();
    const followers = document.querySelector(S.followerslink)?.innerText?.trim();
    const following = document.querySelector(S.followinglink)?.innerText?.trim();

    return { name, bio, followers, following, url: window.location.href };
  }

  /**
   * x/content.js � entry point (rollup bundles this into build/browser/x/content.js)
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
