import { plugins } from '../plugins.js';

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
    btn.addEventListener('click', () => activate(plugin.id));
    nav.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id        = `panel-${plugin.id}`;
    content.appendChild(panel);

    panels.set(plugin.id, { btn, panel, plugin, mounted: false });
  }

  async function activate(id) {
    for (const [pid, entry] of panels) {
      const active = pid === id;
      entry.btn.classList.toggle('active', active);
      entry.panel.classList.toggle('active', active);
      if (active && !entry.mounted) {
        entry.mounted = true;
        await entry.plugin.dashboard.mount(entry.panel);
      }
    }
  }

  if (plugins.length) await activate(plugins[0].id);
}
