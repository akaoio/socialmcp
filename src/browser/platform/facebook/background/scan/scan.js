import { navigate }    from '../../../background/navigate.js';
import { sendmessage } from '../../../background/sendmessage.js';

// Public action: scan the current account's managed Pages.
// Navigates the existing FB tab to the pages list, then asks the content
// script to extract them. Returns whatever HANDLERS.getpages returns.
export async function scan(tab, _params) {
  await navigate(tab.id, 'https://www.facebook.com/pages/?category=your_pages', 3500);
  const updated = await chrome.tabs.get(tab.id);
  return sendmessage(updated.id, { action: 'getpages', params: {} });
}
