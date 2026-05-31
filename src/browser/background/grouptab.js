const TITLE = 'socialmcp';
const COLOR  = 'blue';

export async function grouptab(tabId) {
  const groups = await chrome.tabGroups.query({ title: TITLE });
  const groupId = groups[0]?.id;
  if (groupId == null) {
    const id = await chrome.tabs.group({ tabIds: [tabId] });
    await chrome.tabGroups.update(id, { title: TITLE, color: COLOR });
  } else {
    await chrome.tabs.group({ tabIds: [tabId], groupId });
  }
}
