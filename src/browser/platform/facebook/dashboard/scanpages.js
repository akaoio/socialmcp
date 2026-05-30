import { log }         from './log.js';
import { dispatch }    from '../../../dashboard/dispatch.js';
import { renderpages } from './renderpages.js';
import { state }       from './state.js';

export async function scanpages() {
  const btn = document.getElementById('fb-scan');
  btn.disabled    = true;
  btn.textContent = 'Scanning...';
  log('Scanning Facebook pages...');
  try {
    const result = await dispatch('facebook', 'getpages', {
      _url: 'https://www.facebook.com/pages/?category=your_pages',
    });
    state.pages = result?.pages ?? [];
    renderpages(state.pages);
    await chrome.storage.local.set({ fb_pages: state.pages });
    log(`Found ${state.pages.length} page(s).`);
  } catch (e) {
    log('Error: ' + e.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Scan pages';
  }
}
