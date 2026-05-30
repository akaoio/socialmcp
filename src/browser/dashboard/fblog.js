import { el } from './el.js';

export function fblog(msg) {
  const area = el('fb-log');
  const stamp = new Date().toLocaleTimeString();
  area.textContent += `[${stamp}] ${msg}\n`;
  area.scrollTop = area.scrollHeight;
}
