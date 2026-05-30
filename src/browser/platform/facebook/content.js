import { getpages }             from './scan/getpages.js';
import { postpage }             from './post/postpage.js';
import { switchpage }           from './post/switchpage.js';

const HANDLERS = { getpages, postpage, switchpage };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = HANDLERS[msg.action];
  if (!handler) {
    sendResponse({ error: `Unknown action: ${msg.action}` });
    return false;
  }
  handler(msg.params ?? {})
    .then(result => sendResponse({ result }))
    .catch(err   => sendResponse({ error: err.message }));
  return true;
});
