// Returns the full outer HTML of the socialmcp-owned tab's document.
export async function getdom(tab) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.documentElement.outerHTML,
  });
  return { html: result };
}
