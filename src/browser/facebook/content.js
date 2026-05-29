/**
 * facebook/content.js — entry point (rollup bundles this into build/browser/facebook/content.js)
 */

import { post }     from './post.js';
import { comment }  from './comment.js';
import { react }    from './react.js';
import { scroll }   from './scroll.js';
import { search }   from './search.js';
import { follow }   from './follow.js';
import { unfollow } from './unfollow.js';
import { message }  from './message.js';
import { profile }  from './profile.js';
import { getpages }  from './getpages.js';
import { postpage, switchpage } from './postpage.js';

const HANDLERS = { post, comment, react, scroll, search, follow, unfollow, message, profile, getpages, postpage, switchpage };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = HANDLERS[msg.action];
  if (!handler) {
    sendResponse({ error: `Unknown action: ${msg.action}` });
    return false;
  }
  handler(msg.params ?? {})
    .then(result => sendResponse({ result }))
    .catch(err  => sendResponse({ error: err.message }));
  return true;
});
