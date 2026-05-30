import { el }               from './el.js';
import { scanpages }        from './scanpages.js';
import { fbpost }           from './fbpost.js';
import { setupimagepicker } from './setupimagepicker.js';
import { renderpages }      from './renderpages.js';
import { state }            from './state.js';

export async function init() {
  el('fb-scan').addEventListener('click', scanpages);
  el('fb-post').addEventListener('click', fbpost);
  setupimagepicker();

  const { fb_pages = [] } = await chrome.storage.local.get(['fb_pages']);
  state.fbpages = fb_pages;
  if (state.fbpages.length) renderpages(state.fbpages);
}
