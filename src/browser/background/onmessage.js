import { dispatch } from './dispatch.js';

export function onmessage(msg, _sender, sendResponse) {
  if (msg?.type !== 'ui:dispatch') return false;
  dispatch(msg.platform, msg.action, msg.params ?? {})
    .then(result => sendResponse({ result }))
    .catch(err   => sendResponse({ error: err.message }));
  return true;
}
