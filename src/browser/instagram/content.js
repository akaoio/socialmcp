/**
 * instagram/content.js
 * Handles all DOM interactions on instagram.com.
 *
 * Instagram heavily obfuscates class names; aria-labels and data-testid
 * attributes are used wherever possible for stability.
 */

// ── Selectors ─────────────────────────────────────────────────────────────────

const S = {
  // Composer
  newpostbtn:   'svg[aria-label="New post"]',
  composerimg:  'input[type="file"][accept*="image"]',
  compositext:  '[aria-label="Write a caption…"]',
  nextstep:     'button:has-text("Next"), div[role="button"]:has-text("Next")',
  sharebtn:     'div[role="button"]:has-text("Share")',

  // Feed
  article:      'article',
  postcontent:  'div > span:not([class])', // caption text
  postauthor:   'header a',
  postlink:     'a[href*="/p/"]',

  // Like
  likebtn:      'svg[aria-label="Like"], svg[aria-label="Unlike"]',

  // Comment
  commentbtn:   'svg[aria-label="Comment"]',
  commentinput: 'textarea[aria-label="Add a comment…"]',
  commentpost:  'div[role="button"]:has-text("Post")',

  // Search
  searchbox:    'input[placeholder="Search"]',
  searchresult: 'div[role="button"]',

  // Follow / Unfollow
  followbtn:    'button:has-text("Follow")',
  unfollowbtn:  'button:has-text("Following"), button:has-text("Requested")',
  unfollowconfirm: 'button:has-text("Unfollow")',

  // DM
  dmcompose:    'svg[aria-label="New message"]',
  dmsearch:     'input[placeholder="Search…"]',
  dmresult:     'div[role="button"]',
  dmnext:       'div[role="button"]:has-text("Next")',
  dminput:      'textarea[placeholder="Message…"]',
  dmsend:       'div[role="button"]:has-text("Send")',

  // Profile
  profilename:     'h2',
  profilebio:      'div.-vDIg span, section > div:nth-child(2)',
  followerscount:  'a[href$="/followers/"] span, button:has-text("followers") span',
  followingcount:  'a[href$="/following/"] span',
};

// ── Utilities ─────────────────────────────────────────────────────────────────

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
  if (el.isContentEditable || el.tagName === 'TEXTAREA') {
    const setter = el.isContentEditable
      ? null
      : Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    if (setter) {
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, text);
    }
  }
}

function press(el, key) {
  ['keydown', 'keypress', 'keyup'].forEach(t =>
    el.dispatchEvent(new KeyboardEvent(t, { key, code: key, bubbles: true }))
  );
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function post({ content }) {
  // Instagram requires clicking the + / New Post button in the nav
  const btn = await wait(S.newpostbtn);
  btn.closest('[role="button"], a, button')?.click();
  await sleep(600);

  // Caption step — assumes user has set up photo upload separately,
  // here we only set caption for text-based posts / reels
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
  return true;
});
