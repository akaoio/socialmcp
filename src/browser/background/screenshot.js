// Captures a screenshot of the socialmcp-owned tab.
// Makes the tab active in its window before capturing (required by captureVisibleTab).
export async function screenshot(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await new Promise(r => setTimeout(r, 300)); // let rendering settle
  const dataurl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  return { dataurl };
}
