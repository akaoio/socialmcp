import { filetourl } from '../../../common/filetourl.js';
import { state }     from './state.js';

export async function loadfiles(files) {
  const valid = [...files].filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
  if (!valid.length) return;
  state.media = await Promise.all(valid.map(filetourl));
  const previews = document.getElementById('fb-imagepreviews');
  const hint     = document.getElementById('fb-imagehint');
  const clear    = document.getElementById('fb-imageclear');
  previews.innerHTML = state.media.map(url => `<img class="imagethumb" src="${url}" />`).join('');
  previews.hidden = false;
  hint.hidden     = true;
  clear.hidden    = false;
}
