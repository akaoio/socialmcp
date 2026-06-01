import { plugins }  from '../../plugins.js';
import { activate } from './activate.js';

export async function init() {
  const nav     = document.getElementById('sidebar-nav');
  const content = document.getElementById('content');

  const panels = new Map();

  for (const plugin of plugins) {
    if (plugin.css) {
      const link = document.createElement('link');
      link.rel  = 'stylesheet';
      link.href = plugin.css;
      document.head.appendChild(link);
    }

    const btn = document.createElement('button');
    btn.className   = 'platformbtn';
    btn.textContent = plugin.label;
    btn.addEventListener('click', () => activate(panels, plugin.id));
    nav.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id        = `panel-${plugin.id}`;
    content.appendChild(panel);

    panels.set(plugin.id, { btn, panel, plugin, mounted: false });
  }

  if (plugins.length) await activate(panels, plugins[0].id);
}
