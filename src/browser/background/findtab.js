const PLATFORM_HOSTS = {
  facebook: ['facebook.com'],
};

export async function findtab(platform) {
  const hosts = PLATFORM_HOSTS[platform];
  if (!hosts) throw new Error(`Unknown platform: ${platform}`);
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find(t => t.url && hosts.some(h => t.url.includes(h)));
  if (!tab) throw new Error(`No open tab for platform: ${platform}`);
  return tab;
}
