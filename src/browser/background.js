/**
 * background.js — Extension service worker (MV3)
 * Handles navigation and forwards commands from the dashboard to content scripts.
 */

const PLATFORM_HOSTS = {
  facebook: ['facebook.com'],
};

// ── Dispatch ──────────────────────────────────────────────────────────────────

async function findtab(platform) {
  const hosts = PLATFORM_HOSTS[platform];
  if (!hosts) throw new Error(`Unknown platform: ${platform}`);
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find(t => t.url && hosts.some(h => t.url.includes(h)));
  if (!tab) throw new Error(`No open tab for platform: ${platform}`);
  return tab;
}

async function navigate(tabId, url, extraWait = 800) {
  return new Promise(resolve => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, extraWait);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.update(tabId, { url });
  });
}

async function sendmessage(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, response => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (response?.error) return reject(new Error(response.error));
      resolve(response?.result);
    });
  });
}

async function dispatch(platform, action, params) {
  const tab = await findtab(platform);

  // postpage: navigate to pages list → switchpage (identity switch) → page URL → postpage
  if (platform === 'facebook' && action === 'postpage' && params?.page_url?.startsWith('http')) {
    await navigate(tab.id, 'https://www.facebook.com/pages/?category=your_pages', 3500);
    await sendmessage(tab.id, { action: 'switchpage', params: { page_url: params.page_url } });
    await navigate(tab.id, params.page_url, 2500);
    const updated = await chrome.tabs.get(tab.id);
    return sendmessage(updated.id, { action, params });
  }

  // Navigate to target URL if specified and not already there
  const target = params?.page_url ?? params?._url ?? params?.post_url ?? params?.user;
  if (target?.startsWith('http') && !tab.url.includes(new URL(target).pathname.slice(0, 20))) {
    await navigate(tab.id, target);
    const updated = await chrome.tabs.get(tab.id);
    return sendmessage(updated.id, { action, params });
  }

  return sendmessage(tab.id, { action, params });
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'ui:dispatch') return false;

  dispatch(msg.platform, msg.action, msg.params ?? {})
    .then(result => sendResponse({ result }))
    .catch(err => sendResponse({ error: err.message }));

  return true;
});
