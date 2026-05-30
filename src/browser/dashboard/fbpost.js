import { el }       from './el.js';
import { fblog }    from './fblog.js';
import { dispatch } from './dispatch.js';
import { state }    from './state.js';

export async function fbpost() {
  const content = el('fb-content').value.trim();
  const targets = [...document.querySelectorAll('input[name="fb-target"]:checked')].map(c => c.value);

  if (!content && !state.imageDataUrls.length) { fblog('Nothing to post.'); return; }
  if (!targets.length) { fblog('No target selected.'); return; }

  const btn = el('fb-post');
  btn.disabled = true;

  for (const target of targets) {
    const name = state.fbpages.find(p => p.url === target)?.name ?? target;
    fblog(`Posting to ${name}...`);
    try {
      const params = {};
      if (content)                     params.content = content;
      if (state.imageDataUrls.length)  params.media   = state.imageDataUrls;
      const page = state.fbpages.find(p => p.url === target);
      await dispatch('facebook', 'postpage', { page_url: target, page_id: page?.id, ...params });
      fblog(`Done: ${name}`);
    } catch (e) {
      fblog(`Error ${name}: ${e.message}`);
    }
  }

  btn.disabled = false;
}
