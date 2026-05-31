export function waitload(tabId, extraWait = 1500) {
  return new Promise(resolve => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, extraWait);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}
