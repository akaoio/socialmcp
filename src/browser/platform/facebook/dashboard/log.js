export function log(msg) {
  const area  = document.getElementById('fb-log');
  const stamp = new Date().toLocaleTimeString();
  area.textContent += `[${stamp}] ${msg}\n`;
  area.scrollTop = area.scrollHeight;
}
