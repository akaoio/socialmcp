/**
 * background.js — Extension service worker (MV3)
 *
 * Responsibilities:
 *  1. Connect to the MCP ZEN relay as a peer.
 *  2. Handle navigation before forwarding commands to content scripts.
 *  3. Keep the service worker alive via chrome.alarms (MV3 limitation).
 *
 * NOTE: MV3 service workers are terminated after ~30 s of inactivity.
 * The alarm below wakes it up periodically and reconnects if needed.
 */

import ZEN from '@akaoio/zen/zen.js';

const ZEN_URL = `ws://127.0.0.1:${self.SOCIALMCP_PORT ?? 8420}/zen`;
const NS      = 'socialmcp';

const PLATFORM_HOSTS = {
  facebook:  ['facebook.com'],
  x:         ['x.com'],
  instagram: ['instagram.com'],
  threads:   ['threads.net'],
};

let zen = null;

// ── ZEN peer ──────────────────────────────────────────────────────────────────

function connect() {
  if (zen) return;
  zen = new ZEN({ peers: [ZEN_URL], axe: false });

  zen.get(NS).get('cmd').map().on(async (raw, id) => {
    if (!raw || typeof raw !== 'string') return;
    let cmd;
    try { cmd = JSON.parse(raw); } catch { return; }
    if (Date.now() - (cmd.ts || 0) > 60000) return; // ignore stale commands

    // Clear the command so it is not processed again
    zen.get(NS).get('cmd').get(id).put(null);

    try {
      const result = await dispatch(cmd.platform, cmd.action, cmd.params);
      zen.get(NS).get('res').get(id).put(JSON.stringify({ ok: result }));
    } catch (err) {
      zen.get(NS).get('res').get(id).put(JSON.stringify({ err: err.message }));
    }
  });
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
