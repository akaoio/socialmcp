import { waitload }  from './waitload.js';
import { grouptab } from './grouptab.js';

export async function findtab(hosts, url) {
  const tabs = await chrome.tabs.query({});
  const tab  = tabs.find(t => t.url && hosts.some(h => t.url.includes(h)));
  if (tab) return tab;

  const target  = url ?? `https://${hosts[0]}`;
  const created = await chrome.tabs.create({ url: target, active: false });
  await waitload(created.id, 1500);
  await grouptab(created.id);
  return chrome.tabs.get(created.id);
}
