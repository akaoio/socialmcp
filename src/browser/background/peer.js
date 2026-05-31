import { dispatch } from './dispatch.js';

const base = 'http://localhost:8420';

let polling = false;

async function poll() {
  if (polling) return;
  polling = true;
  while (true) {
    try {
      const resp = await fetch(`${base}/job`, { signal: AbortSignal.timeout(26000) });
      if (resp.status === 200) {
        const job = await resp.json();
        let result;
        try {
          const value = await dispatch(job.platform, job.action, job.params ?? {});
          result = { ok: true, value: value ?? null };
        } catch (e) {
          result = { ok: false, error: e.message };
        }
        fetch(`${base}/result/${job.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result),
        }).catch(() => {});
      }
    } catch {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// Keep service worker alive: alarm fires every 20s to re-trigger poll if it died
chrome.alarms.create('keepalive', { periodInMinutes: 1 / 3 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'keepalive') { polling = false; poll(); } });

poll();

