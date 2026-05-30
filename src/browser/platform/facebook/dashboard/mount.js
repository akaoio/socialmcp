import { html }              from './panel.js';
import { scanpages }         from './scanpages.js';
import { post }              from './post.js';
import { setupimagepicker }  from './setupimagepicker.js';
import { renderpages }       from './renderpages.js';
import { state }             from './state.js';

export async function mount(container) {
  container.innerHTML = html;

  document.getElementById('fb-scan').addEventListener('click', scanpages);
  document.getElementById('fb-post').addEventListener('click', post);
  setupimagepicker();

  const { fb_pages = [] } = await chrome.storage.local.get(['fb_pages']);
  state.pages = fb_pages;
  if (state.pages.length) renderpages(state.pages);
}
