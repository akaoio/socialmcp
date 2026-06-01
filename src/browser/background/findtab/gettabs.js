const KEY = 'socialmcp:tabs'; // session storage: { [platformId]: tabId }

export async function gettabs() {
  const r = await chrome.storage.session.get([KEY]);
  return r[KEY] ?? {};
}
