/**
 * background.js — Extension service worker (MV3)
 *
 * Responsibilities:
 *  1. Maintain a WebSocket connection to the MCP bridge server.
 *  2. Handle navigation before forwarding commands to content scripts.
 *  3. Keep the service worker alive via chrome.alarms (MV3 limitation).
 *
 * NOTE: MV3 service workers are terminated after ~30 s of inactivity.
 * The alarm below wakes it up periodically and reconnects if needed.
 */

const WS_URL = `ws://127.0.0.1:${self.SOCIALMCP_PORT ?? 3456}`;

const PLATFORM_HOSTS = {
  facebook:  ['facebook.com'],
  x:         ['x.com'],
  instagram: ['instagram.com'],
  threads:   ['threads.net'],
};

let socket = null;
let backoff = 1000;

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connect() {
  if (socket && socket.readyState <= WebSocket.OPEN) return;

  socket = new WebSocket(WS_URL);

  socket.addEventListener('open', () => {
    backoff = 1000;
    socket.send(JSON.stringify({
      type: 'register',
      platforms: Object.keys(PLATFORM_HOSTS),
    }));
  });

  socket.addEventListener('message', async event => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    try {
      const result = await dispatch(msg.platform, msg.action, msg.params);
      socket.send(JSON.stringify({ type: 'response', id: msg.id, result }));
    } catch (err) {
      socket.send(JSON.stringify({ type: 'response', id: msg.id, error: err.message }));
    }
  });

  socket.addEventListener('close', () => {
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 30000);
  });

  socket.addEventListener('error', () => socket.close());
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

async function findtab(platform) {
  const hosts = PLATFORM_HOSTS[platform];
  if (!hosts) throw new Error(`Unknown platform: ${platform}`);
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find(t => t.url && hosts.some(h => t.url.includes(h)));
  if (!tab) throw new Error(`No open tab for platform: ${platform}`);
  return tab;
}

async function navigate(tabId, url) {
  return new Promise(resolve => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        // Extra wait for SPA JavaScript to initialize
        setTimeout(resolve, 800);
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

  // Navigate to target URL if one is specified and we're not already there
  const target = params?.post_url ?? params?.user;
  if (target?.startsWith('http') && !tab.url.includes(new URL(target).pathname.slice(0, 20))) {
    await navigate(tab.id, target);
    // Re-fetch tab after navigation
    const updated = await chrome.tabs.get(tab.id);
    return sendmessage(updated.id, { action, params });
  }

  return sendmessage(tab.id, { action, params });
}

// ── Keep-alive ────────────────────────────────────────────────────────────────

chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'keepalive') connect();
});

connect();
