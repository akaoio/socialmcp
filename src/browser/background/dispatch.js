import { findtab }    from './findtab.js';
import { sendmessage } from './sendmessage.js';
import { plugins }    from '../plugins.js';

// Plugin registry — keyed by id. The core never knows platform-specific concepts;
// any per-action behavior (navigation, multi-step flows) lives in the plugin itself.
const REGISTRY = Object.fromEntries(plugins.map(p => [p.id, p]));

export async function dispatch(platform, action, params) {
  const plugin = REGISTRY[platform];
  if (!plugin) throw new Error(`Unknown platform: ${platform}`);

  const tab = await findtab(plugin.hosts, plugin.url);

  // Explicit handler wins. Plugins should declare a handler for every public action
  // (MCP tool name) they support — see docs/plugin-dev-guide.md.
  const handler = plugin.background?.[action];
  if (handler) return handler(tab, params);

  // Generic fallback: just forward to the content script with the same action name.
  // Useful for stateless actions that need no tab navigation.
  return sendmessage(tab.id, { action, params });
}
