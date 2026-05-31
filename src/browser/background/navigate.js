import { waitload } from './waitload.js';

export async function navigate(tabId, url, extraWait = 800) {
  const p = waitload(tabId, extraWait);
  chrome.tabs.update(tabId, { url });
  return p;
}
