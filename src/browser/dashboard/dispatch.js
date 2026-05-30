export async function dispatch(platform, action, params) {
  const resp = await chrome.runtime.sendMessage({ type: 'ui:dispatch', platform, action, params });
  if (resp?.error) throw new Error(resp.error);
  return resp?.result;
}
