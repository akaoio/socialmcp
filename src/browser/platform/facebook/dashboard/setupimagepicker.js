import { loadfiles }   from './loadfiles.js';
import { clearpicker } from './clearpicker.js';

export function setupimagepicker() {
  const input = document.getElementById('fb-imagefile');
  const clear = document.getElementById('fb-imageclear');
  const drop  = document.getElementById('fb-imagedrop');

  input.addEventListener('change', () => loadfiles(input.files));
  clear.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); clearpicker(); });

  drop.addEventListener('dragover',  ev => { ev.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', ev => {
    ev.preventDefault();
    drop.classList.remove('drag');
    loadfiles(ev.dataTransfer.files);
  });
}
