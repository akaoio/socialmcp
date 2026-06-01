import { hosts } from './hosts.js';
import { post }  from './background/post/post.js';
import { scan }  from './background/scan/scan.js';

export default {
  id:    'facebook',
  label: 'Facebook',
  hosts,
  url:   'https://www.facebook.com',
  background: {
    post,
    scan,
  },
};
