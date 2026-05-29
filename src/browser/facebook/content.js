/**
 * facebook/content.js
 * Handles all DOM interactions on facebook.com.
 *
 * Selectors are grouped at the top for easy maintenance when Facebook
 * changes their markup — which happens frequently.
 */

// ── Selectors ─────────────────────────────────────────────────────────────────

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

// ── Utilities ─────────────────────────────────────────────────────────────────

function wait(selector, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - start > timeout) return reject(new Error(`Timeout waiting for: ${selector}`));
      setTimeout(check, 200);
    })();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Works with React-managed contenteditable fields and plain inputs
function type(el, text) {
  el.focus();
  if (el.isContentEditable) {
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
    document.execCommand('insertText', false, text);
  } else {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function press(el, key) {
  ['keydown', 'keypress', 'keyup'].forEach(t =>
    el.dispatchEvent(new KeyboardEvent(t, { key, code: key, bubbles: true }))
  );
}

// ── Action handlers ───────────────────────────────────────────────────────────

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
    // Hold over Like button to open reaction picker
    btn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await sleep(700);
    const picker = document.querySelector(`[aria-label="${cap(reaction)}"]`);
    if (picker) picker.click();
    else btn.click(); // fallback to like
  }

  await sleep(500);
  return { success: true };
}

async function scroll({ count = 10 }) {
  const seen = new Set();
  const posts = [];

  for (let attempts = 0; posts.length < count && attempts < 30; attempts++) {
    document.querySelectorAll(S.article).forEach(item => {
      if (posts.length >= count) return;
      const text   = item.querySelector(S.postcontent)?.innerText?.trim();
      const author = item.querySelector(S.postauthor)?.innerText?.trim();
      const link   = item.querySelector(S.postlink)?.href;
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

async function search({ query, type: searchType = 'posts' }) {
  const input = await wait(S.searchbox);
  input.click();
  type(input, query);
  press(input, 'Enter');
  await sleep(2000);

  // Filter tabs: Posts / People / Groups / Pages
  const tabMap = { posts: 'Posts', users: 'People', groups: 'Groups', pages: 'Pages' };
  const tabLabel = tabMap[searchType];
  if (tabLabel) {
    const tab = document.querySelector(`[role="tab"][aria-label="${tabLabel}"]`);
    if (tab) { tab.click(); await sleep(1000); }
  }

  const results = [];
  document.querySelectorAll(S.article).forEach(item => {
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
  // Confirm dialog
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function cap(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Router ────────────────────────────────────────────────────────────────────

const HANDLERS = { post, comment, react, scroll, search, follow, unfollow, message, profile };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = HANDLERS[msg.action];
  if (!handler) {
    sendResponse({ error: `Unknown action: ${msg.action}` });
    return false;
  }
  handler(msg.params ?? {})
    .then(result => sendResponse({ result }))
    .catch(err => sendResponse({ error: err.message }));
  return true; // keep message channel open for async response
});
