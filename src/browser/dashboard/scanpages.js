import { el }          from './el.js';
import { fblog }       from './fblog.js';
import { dispatch }    from './dispatch.js';
import { renderpages } from './renderpages.js';
import { state }       from './state.js';

export async function scanpages() {
  const btn = el('fb-scan');
  btn.disabled = true;
  btn.textContent = 'Scanning...';
  fblog('Scanning Facebook pages...');
  try {
    const result = await dispatch('facebook', 'getpages', {
      _url: 'https://www.facebook.com/pages/?category=your_pages',
    });
    state.fbpages = result?.pages ?? [];
    renderpages(state.fbpages);
    await chrome.storage.local.set({ fb_pages: state.fbpages });
    fblog(`Found ${state.fbpages.length} page(s).`);
  } catch (e) {
    fblog('Error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan pages';
  }
}
