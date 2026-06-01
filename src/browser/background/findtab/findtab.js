import { waitload }  from '../waitload.js';
import { grouptab } from '../grouptab.js';
import { gettabs }  from './gettabs.js';

const KEY = 'socialmcp:tabs'; // session storage: { [platformId]: tabId }

// findtab(id, hosts, url)
// Always returns a tab owned by socialmcp — never touches user-opened tabs.
// Tab is created on first call (or if the previously-owned tab was closed).
export async function findtab(id, hosts, url) {
  const owned = await gettabs();

  if (owned[id] != null) {
    try {
      return await chrome.tabs.get(owned[id]);
    } catch {
      // tab was closed externally — fall through and create a new one
      const { [id]: _removed, ...rest } = owned;
      await chrome.storage.session.set({ [KEY]: rest });
    }
  }

  const target  = url ?? `https://${hosts[0]}`;
  const created = await chrome.tabs.create({ url: target, active: false });
  await waitload(created.id, 1500);
  await grouptab(created.id);

  await chrome.storage.session.set({ [KEY]: { ...owned, [id]: created.id } });
  return chrome.tabs.get(created.id);
}
