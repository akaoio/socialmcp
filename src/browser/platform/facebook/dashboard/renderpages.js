export function renderpages(pages) {
  const list = document.getElementById('fb-pages');
  if (!pages.length) {
    list.innerHTML = '<span class="hint">No pages found. Make sure facebook.com is open in a tab.</span>';
    return;
  }
  list.innerHTML = pages.map(p => `
    <label class="pageitem">
      <input type="checkbox" name="fb-page" value="${p.url}" checked />
      <span class="pagename" title="${p.url}">${p.name}</span>
    </label>
  `).join('');

  document.getElementById('fb-targets').innerHTML = pages.map(p => `
    <label class="targetitem">
      <input type="checkbox" name="fb-target" value="${p.url}" checked />
      ${p.name}
    </label>`).join('');
}
