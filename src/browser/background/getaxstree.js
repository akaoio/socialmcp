// Returns a compact accessibility tree of the socialmcp-owned tab.
// Uses ancestor-marking: finds all semantic/interactive elements via
// querySelectorAll, marks their ancestors as keepers, then walks only
// keeper nodes — preserving true hierarchy with no depth cap.
// Note: chrome.automation (CDP-level AX tree) is not available in MV3
// service workers. This DOM-walk is the correct approach for extensions.
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

      // Mark all interesting elements and their ancestors as keepers.
      const keepers = new Set();
      for (const el of document.querySelectorAll(SEL)) {
        let node = el;
        while (node && node !== document.documentElement) {
          if (keepers.has(node)) break; // ancestor already traversed
          keepers.add(node);
          node = node.parentElement;
        }
      }

      if (keepers.size === 0) return '(empty)';

      function walk(el, depth) {
        if (!keepers.has(el)) return null;
        const role   = el.getAttribute('role') || el.tagName.toLowerCase();
        const label  = el.getAttribute('aria-label') || '';
        const id     = el.id ? `#${el.id}` : '';
        const isLeaf = ![...el.children].some(c => keepers.has(c));
        const text   = isLeaf ? (el.textContent?.trim().slice(0, 100) ?? '') : '';
        const indent = '  '.repeat(depth);
        const attrs  = [id, label ? `"${label}"` : '', text ? `"${text}"` : '']
          .filter(Boolean).join(' ');
        const line   = `${indent}<${role}${attrs ? ' ' + attrs : ''}>`;
        const children = [...el.children]
          .map(c => walk(c, depth + 1))
          .filter(Boolean)
          .join('\n');
        return children ? `${line}\n${children}` : line;
      }

      return walk(document.body, 0) || '(empty)';
    },
  });
  return { tree: result };
}
