// Minimal relay page — used by automated tests to send dispatch messages
// into the extension background without requiring any UI.
window.dispatch = (platform, action, params) =>
  new Promise((resolve, reject) =>
    chrome.runtime.sendMessage(
      { type: 'ui:dispatch', platform, action, params },
      r => r?.error ? reject(new Error(r.error)) : resolve(r)
    )
  );
