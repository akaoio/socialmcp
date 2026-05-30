import { findtab }    from './findtab.js';
import { navigate }   from './navigate.js';
import { sendmessage } from './sendmessage.js';
import { plugins }    from '../plugins.js';

const REGISTRY = Object.fromEntries(plugins.map(p => [p.id, p]));

export async function dispatch(platform, action, params) {
  const plugin = REGISTRY[platform];
  if (!plugin) throw new Error(`Unknown platform: ${platform}`);

  const tab = await findtab(plugin.hosts);

  const handler = plugin.background?.[action];
  if (handler) return handler(tab, params);

  const target = params?.page_url ?? params?._url;
  if (target?.startsWith('http') && !tab.url.includes(new URL(target).pathname.slice(0, 20))) {
    await navigate(tab.id, target);
    const updated = await chrome.tabs.get(tab.id);
    return sendmessage(updated.id, { action, params });
  }

  return sendmessage(tab.id, { action, params });
}
