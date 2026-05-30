import { sleep } from '../../../common/sleep.js';

export async function findtrigger(timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const main = document.querySelector('[role="main"]');
    if (main) {
      const photobtn = [...main.querySelectorAll('[role="button"]')]
        .find(b => b.getAttribute('aria-label') === 'Photo/video');
      if (photobtn) {
        let el = photobtn.parentElement;
        for (let d = 1; d <= 10; d++) {
          if (!el) break;
          const btn = [...el.querySelectorAll('[role="button"]')].find(
            b => !b.getAttribute('aria-label') && !b.getAttribute('aria-haspopup') &&
                 b.textContent.trim().length > 0 && !b.querySelector('[role="button"]')
          );
          if (btn) return btn;
          el = el.parentElement;
        }
      }
    }
    await sleep(400);
  }
  throw new Error('Compose trigger not found — is the page loaded and identity switched?');
}
