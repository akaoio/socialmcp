import { log }      from './log.js';
import { dispatch } from '../../../dashboard/dispatch.js';
import { state }    from './state.js';

export async function post() {
  const content = document.getElementById('fb-content').value.trim();
  const targets = [...document.querySelectorAll('input[name="fb-target"]:checked')].map(c => c.value);

  if (!content && !state.media.length) { log('Nothing to post.'); return; }
  if (!targets.length) { log('No target selected.'); return; }

  const btn = document.getElementById('fb-post');
  btn.disabled = true;

  for (const target of targets) {
    const name = state.pages.find(p => p.url === target)?.name ?? target;
    log(`Posting to ${name}...`);
    try {
      const params = {};
      if (content)             params.content = content;
      if (state.media.length)  params.media   = state.media;
      const page = state.pages.find(p => p.url === target);
      await dispatch('facebook', 'post', { page_url: target, page_id: page?.id, ...params });
      log(`Done: ${name}`);
    } catch (e) {
      log(`Error ${name}: ${e.message}`);
    }
  }

  btn.disabled = false;
}
