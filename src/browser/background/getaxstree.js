// Returns a compact accessibility tree of the socialmcp-owned tab.
// Only includes interactive/landmark elements and elements with ARIA attributes.
export async function getaxstree(tab) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const LANDMARKS = new Set([
        'A','BUTTON','INPUT','SELECT','TEXTAREA',
        'FORM','NAV','MAIN','HEADER','FOOTER','ASIDE','SECTION','ARTICLE',
        'H1','H2','H3','H4','H5','H6','LABEL','DIALOG',
      ]);

      function interesting(el) {
        return el.getAttribute('role') ||
               el.getAttribute('aria-label') ||
               el.getAttribute('aria-labelledby') ||
               LANDMARKS.has(el.tagName);
      }

      function walk(el, depth, maxDepth) {
        if (depth > maxDepth) return null;
        const role   = el.getAttribute('role') || el.tagName.toLowerCase();
        const label  = el.getAttribute('aria-label') || '';
        const id     = el.id ? `#${el.id}` : '';
        const isLeaf = el.children.length === 0;
        const text   = isLeaf ? (el.textContent?.trim().slice(0, 120) ?? '') : '';
        const indent = '  '.repeat(depth);

        const children = Array.from(el.children)
          .map(c => walk(c, depth + 1, maxDepth))
          .filter(Boolean)
          .join('\n');

        if (!interesting(el) && !children) return null;

        const attrs = [id, label ? `"${label}"` : '', text ? `"${text}"` : '']
          .filter(Boolean).join(' ');
        const line = `${indent}<${role}${attrs ? ' ' + attrs : ''}>`;
        return children ? `${line}\n${children}` : line;
      }

      return walk(document.body, 0, 8) || '(empty)';
    },
  });
  return { tree: result };
}
