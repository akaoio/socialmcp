import { navigate }    from '../../../../background/navigate.js';
import { sendmessage } from '../../../../background/sendmessage.js';

// Public MCP action: post a new post to a specific Facebook page.
// Required param: page_url (full https URL of the page wall).
// Optional: content (string), media (string[] of object URLs).
export async function post(tab, params) {
  if (!params?.page_url?.startsWith('http')) {
    return sendmessage(tab.id, { action: 'postpage', params });
  }
  await navigate(tab.id, 'https://www.facebook.com/pages/?category=your_pages', 3500);
  await sendmessage(tab.id, { action: 'switchpage', params: { page_url: params.page_url } });
  await navigate(tab.id, params.page_url, 2500);
  const updated = await chrome.tabs.get(tab.id);
  return sendmessage(updated.id, { action: 'postpage', params });
}
