import { state } from './state.js';

export function clearpicker() {
  state.media                                     = [];
  document.getElementById('fb-imagefile').value   = '';
  const previews                                  = document.getElementById('fb-imagepreviews');
  previews.innerHTML                              = '';
  previews.hidden                                 = true;
  document.getElementById('fb-imagehint').hidden  = false;
  document.getElementById('fb-imageclear').hidden = true;
}
