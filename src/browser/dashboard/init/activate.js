import { plugins } from '../../plugins.js';

// activate(panels, id) — shows panel for `id`, mounts it on first activation.
export async function activate(panels, id) {
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
