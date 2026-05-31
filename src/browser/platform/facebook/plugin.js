import { hosts } from './hosts.js';
import { post }  from './background/post.js';
import { scan }  from './background/scan.js';
import { mount } from './dashboard/mount.js';

export default {
  id:    'facebook',
  label: 'Facebook',
  hosts,
  url:   'https://www.facebook.com',
  css:   'platform/facebook/dashboard/panel.css',
  background: {
    // Public action names (MCP tools + dashboard-facing aliases) → handler(tab, params).
    // Internal content-script action names (e.g. 'postpage', 'switchpage', 'getpages')
    // are NOT exposed here — they are implementation details of this plugin.
    post,
    scan,
  },
  dashboard: {
    mount,
  },
};
