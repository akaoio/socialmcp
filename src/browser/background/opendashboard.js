export async function opendashboard() {
  const url = chrome.runtime.getURL('dashboard/index.html');
  const [existing] = await chrome.tabs.query({ url });
  if (existing) {
    chrome.tabs.update(existing.id, { active: true });
    chrome.windows.update(existing.windowId, { focused: true });
  } else {
    chrome.tabs.create({ url });
  }
}
