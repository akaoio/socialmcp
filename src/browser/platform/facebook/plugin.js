import { hosts }    from './hosts.js';
import { dispatch } from './background/dispatch.js';
import { mount }    from './dashboard/mount.js';

export default {
  id:    'facebook',
  label: 'Facebook',
  hosts,
  css:   'platform/facebook/dashboard/panel.css',
  background: {
    postpage: dispatch,
  },
  dashboard: {
    mount,
  },
};
