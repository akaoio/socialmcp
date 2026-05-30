export async function findtab(hosts) {
  const tabs = await chrome.tabs.query({});
  const tab  = tabs.find(t => t.url && hosts.some(h => t.url.includes(h)));
  if (!tab) throw new Error(`No open tab matching hosts: ${hosts.join(', ')}`);
  return tab;
}
