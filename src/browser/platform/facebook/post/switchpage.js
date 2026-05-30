import { sleep } from '../../common/sleep.js';

export async function switchpage({ page_url } = {}) {
  await sleep(2000);
  const norm = new URL(page_url).pathname.replace(/\/$/, '').toLowerCase();
  const link = [...document.querySelectorAll('a[href]')].find(a => {
    try { return new URL(a.href).pathname.replace(/\/$/, '').toLowerCase() === norm; }
    catch { return false; }
  });
  if (!link) return { switched: false, reason: 'page link not found on /pages/' };
  let el = link.parentElement;
  for (let d = 1; d <= 12; d++) {
    if (!el) break;
    const btns = [...el.querySelectorAll('[role="button"]')].filter(b => !b.contains(link));
    if (btns.length === 1) { btns[0].click(); return { switched: true }; }
    el = el.parentElement;
  }
  return { switched: false, reason: 'already active' };
}
