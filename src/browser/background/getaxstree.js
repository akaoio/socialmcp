// Returns a compact accessibility tree of the socialmcp-owned tab.
// Uses querySelectorAll to find semantic/interactive elements at any depth.
export async function getaxstree(tab) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const SEL = [
        'button', 'input', 'select', 'textarea', 'a[href]',
        '[role]', '[aria-label]', '[aria-labelledby]',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'main', 'nav', 'header', 'footer', 'dialog', 'form',
      ].join(',');

      const els = Array.from(document.querySelectorAll(SEL)).slice(0, 200);
      if (els.length === 0) return '(empty)';

      return els.map(el => {
        const role    = el.getAttribute('role') || el.tagName.toLowerCase();
        const label   = el.getAttribute('aria-label') || '';
        const id      = el.id ? `#${el.id}` : '';
        const isLeaf  = el.children.length === 0;
        const text    = isLeaf ? (el.textContent?.trim().slice(0, 100) ?? '') : '';
        const attrs   = [id, label ? `"${label}"` : '', text ? `"${text}"` : '']
          .filter(Boolean).join(' ');
        return `<${role}${attrs ? ' ' + attrs : ''}>`;
      }).join('\n');
    },
  });
  return { tree: result };
}
