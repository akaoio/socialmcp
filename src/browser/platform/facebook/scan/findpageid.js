export function findpageid(link) {
  let el = link.parentElement;
  for (let i = 0; i < 12; i++) {
    if (!el) break;
    const notif = el.querySelector('a[href*="latest/home?asset_id="]');
    if (notif) {
      const m = notif.href.match(/asset_id=(\d+)/);
      if (m) return m[1];
    }
    el = el.parentElement;
  }
  return null;
}
