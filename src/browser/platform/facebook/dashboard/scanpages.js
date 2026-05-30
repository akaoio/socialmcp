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
    const result = await dispatch('facebook', 'scan', {});
    state.pages = result?.pages ?? [];
    renderpages(state.pages);
    await chrome.storage.local.set({ 'facebook:pages': state.pages });
    log(`Found ${state.pages.length} page(s).`);
  } catch (e) {
    log('Error: ' + e.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Scan pages';
  }
}
