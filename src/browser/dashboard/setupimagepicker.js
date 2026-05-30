import { el }        from './el.js';
import { loadfiles } from './loadfiles.js';
import { state }     from './state.js';

export function setupimagepicker() {
  const input    = el('fb-imagefile');
  const previews = el('fb-imagepreviews');
  const hint     = el('fb-imagehint');
  const clear    = el('fb-imageclear');
  const drop     = el('fb-imagedrop');

  input.addEventListener('change', () => loadfiles(input.files));

  clear.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    state.imageDataUrls = [];
    input.value         = '';
    previews.innerHTML  = '';
    previews.hidden     = true;
    hint.hidden         = false;
    clear.hidden        = true;
  });

  drop.addEventListener('dragover', ev => { ev.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', ev => {
    ev.preventDefault();
    drop.classList.remove('drag');
    loadfiles(ev.dataTransfer.files);
  });
}
