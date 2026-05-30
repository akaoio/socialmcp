import { el }          from './el.js';
import { filetourl }   from './filetourl.js';
import { state }       from './state.js';

export async function loadfiles(files) {
  const valid = [...files].filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
  if (!valid.length) return;
  state.imageDataUrls = await Promise.all(valid.map(filetourl));
  const previews = el('fb-imagepreviews');
  const hint     = el('fb-imagehint');
  const clear    = el('fb-imageclear');
  previews.innerHTML = state.imageDataUrls.map(url => `<img class="imagethumb" src="${url}" />`).join('');
  previews.hidden = false;
  hint.hidden     = true;
  clear.hidden    = false;
}
