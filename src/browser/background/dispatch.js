import { findtab }    from './findtab.js';
import { navigate }    from './navigate.js';
import { sendmessage } from './sendmessage.js';

export async function dispatch(platform, action, params) {
  const tab = await findtab(platform);

  if (platform === 'facebook' && action === 'postpage' && params?.page_url?.startsWith('http')) {
    await navigate(tab.id, 'https://www.facebook.com/pages/?category=your_pages', 3500);
    await sendmessage(tab.id, { action: 'switchpage', params: { page_url: params.page_url } });
    await navigate(tab.id, params.page_url, 2500);
    const updated = await chrome.tabs.get(tab.id);
    return sendmessage(updated.id, { action, params });
  }

  const target = params?.page_url ?? params?._url;
  if (target?.startsWith('http') && !tab.url.includes(new URL(target).pathname.slice(0, 20))) {
    await navigate(tab.id, target);
    const updated = await chrome.tabs.get(tab.id);
    return sendmessage(updated.id, { action, params });
  }

  return sendmessage(tab.id, { action, params });
}
