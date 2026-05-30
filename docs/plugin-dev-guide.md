# Plugin Development Guide — Social MCP

This guide is the single source of truth for adding new platforms and features. Follow it strictly to keep the architecture drift-free.

## Mental model

```
┌─────────────────────────────────────────────────────────────────┐
│ Core (platform-agnostic)                                        │
│   src/browser/background/   — service-worker host               │
│   src/browser/dashboard/    — UI shell                          │
│   src/browser/common/       — shared utilities                  │
│   src/browser/plugins.js    — central registry                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │ knows only the plugin manifest interface
┌──────────────────────▼──────────────────────────────────────────┐
│ Plugin (self-contained)                                         │
│   src/browser/platform/<id>/                                    │
│     plugin.js          ← THE manifest (default export)          │
│     hosts.js           ← URL substrings                         │
│     content.js         ← content-script entry                   │
│     background/        ← one file per public action             │
│     dashboard/         ← UI panel + handlers                    │
│     <feature>/         ← grouped DOM logic + own selectors.js   │
└─────────────────────────────────────────────────────────────────┘
```

**The core never knows the word `facebook`.** Test: grep the strings `facebook`, `x`, `instagram`, `threads` under `src/browser/{background,dashboard,common}/` — must return zero matches.

## Hard rules (non-negotiable)

1. **Naming.** Function names, file names, and exported identifiers are single lowercase words from `[a-z]`. No camelCase, no underscores, no multi-word names. Filename matches the function it exports (`post.js` exports `post`).
2. **One function per file** inside `background/` and `dashboard/` action folders. Aggregate at the plugin manifest level only.
3. **Platform code stays in `platform/<id>/`.** Never reach back into core from a plugin to add platform-specific behavior to core files. If core needs an extension point, redesign the manifest.
4. **No shared `selectors.js` at the platform root.** Each feature folder owns its own `selectors.js`. This prevents a single file from ballooning.
5. **Public action names = MCP tool names.** The keys of `plugin.background` are what `bridge.send(platform, action, params)` will look up — they must match the MCP tool name (`post`, `comment`, `scan`, …). Internal action names that travel between background and content script (e.g. `postpage`, `switchpage`, `getpages`) are private to the plugin and never reach an external caller.
6. **Storage keys are plugin-scoped.** Use `chrome.storage.local` keys prefixed with the plugin id (e.g. `facebook:pages`). Never use bare keys like `pages` that could collide between plugins.
7. **DOM ids in the dashboard panel are plugin-scoped.** Every id starts with `<plugin-id>-` (e.g. `fb-post`, `fb-pages`). Two plugins mounted at the same time must not collide.

## Adding a new platform

### 1. Create the folder

```
src/browser/platform/<id>/
  plugin.js
  hosts.js
  content.js
  background/
  dashboard/
```

Pick `<id>` carefully — it appears in:
- the MCP `platform` enum (`src/server/index.js`, already pre-populated with `facebook | x | instagram | threads`),
- `chrome.storage.local` key prefixes,
- the dashboard sidebar button (via `plugin.label`),
- folder names (must match the id exactly).

### 2. `hosts.js`

```js
export const hosts = ['example.com'];
```

`hosts` is a list of URL substrings used by `background/findtab(hosts)` to locate an open tab. The build script also parses this file (regex) to derive `content_scripts.matches` and `host_permissions` in `manifest.json`.

### 3. `plugin.js` — the manifest

```js
import { hosts } from './hosts.js';
import { post }  from './background/post.js';
import { mount } from './dashboard/mount.js';

export default {
  id:    'example',
  label: 'Example',
  hosts,
  css:   'platform/example/dashboard/panel.css',  // optional
  background: { post },       // public action handlers (MCP tool names)
  dashboard:  { mount },      // mount(container) — renders the plugin's UI
};
```

Fields:
| field | type | required | meaning |
|-------|------|----------|---------|
| `id` | string | yes | matches folder name + MCP `platform` enum |
| `label` | string | yes | sidebar button text |
| `hosts` | string[] | yes | from `hosts.js` |
| `css` | string | no | extension-relative path to a stylesheet auto-injected into the dashboard before mount |
| `background` | object | no | map of `<public-action> → (tab, params) => result` |
| `dashboard` | object | no | `{ mount(container) }` — see below |

### 4. Register the plugin

`src/browser/plugins.js`:

```js
import facebook from './platform/facebook/plugin.js';
import example  from './platform/example/plugin.js';
export const plugins = [facebook, example];
```

The build script automatically picks up `src/browser/platform/<id>/` folders (it scans for `plugin.js`) — you do **not** need to edit `build.js`.

### 5. Dev manifest

For dev mode (load `src/browser/` as unpacked), add a `content_scripts` entry and `host_permissions` entry to `src/browser/manifest.json` matching your hosts. The production build regenerates `manifest.json` from `hosts.js` automatically — so this dev edit is the only manual step.

> Future improvement: replace dev manifest with a generator that runs on `prepare`. For now, keep the two in sync.

## Adding a feature to an existing plugin

A "feature" is a coherent slice of UI + DOM logic (e.g. *post composing*, *page scanning*).

### Folder layout

```
platform/<id>/<feature>/
  <step>.js          ← one function per file (named to match)
  selectors.js       ← CSS selectors local to this feature
```

### Selector discipline

`selectors.js` contains only the selectors used inside the feature folder. Sibling files import it as `'./selectors.js'`. **Do not create a shared `selectors.js` higher up the tree.**

Prefer `aria-label`, `role`, `data-testid` over class names — they survive UI refactors.

### Wiring the feature into the content script

`platform/<id>/content.js`:

```js
import { getpages }  from './scan/getpages.js';
import { postpage }  from './post/postpage.js';
import { switchpage } from './post/switchpage.js';

const HANDLERS = { getpages, postpage, switchpage };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = HANDLERS[msg.action];
  if (!handler) { sendResponse({ error: `Unknown action: ${msg.action}` }); return false; }
  handler(msg.params ?? {})
    .then(result => sendResponse({ result }))
    .catch(err   => sendResponse({ error: err.message }));
  return true;
});
```

`HANDLERS` keys are **internal** action names — they only need to match what the plugin's own background handlers (or its dashboard, via `chrome.runtime.sendMessage`) send. They do not need to match MCP tool names.

### Wiring a feature into background

For each public action your plugin supports, add a file under `platform/<id>/background/`:

```js
// platform/example/background/post.js
import { navigate }    from '../../../background/navigate.js';
import { sendmessage } from '../../../background/sendmessage.js';

export async function post(tab, params) {
  if (params?.url) await navigate(tab.id, params.url);
  const updated = await chrome.tabs.get(tab.id);
  return sendmessage(updated.id, { action: 'postcomposer', params });
}
```

Then expose it in `plugin.js`:

```js
import { post } from './background/post.js';
export default {
  // …
  background: { post },
};
```

Multi-step flows (navigate → switch → fill → submit) live entirely inside this file. The core never sees them.

### Wiring a feature into the dashboard

`platform/<id>/dashboard/` holds the UI panel. Recommended layout:

```
dashboard/
  mount.js                 ← entry: mount(container) — injects html, wires events
  panel.js                 ← export const html = `...`
  panel.css                ← styles (loaded via plugin.css)
  state.js                 ← per-plugin mutable shared state
  log.js                   ← export function log(msg) — writes to the panel
  <action>.js              ← one file per dashboard button handler
```

`mount.js`:

```js
import { html }        from './panel.js';
import { post }        from './post.js';
import { state }       from './state.js';

export async function mount(container) {
  container.innerHTML = html;
  container.querySelector('#ex-post').addEventListener('click', post);

  const { 'example:lastdraft': draft } = await chrome.storage.local.get(['example:lastdraft']);
  if (draft) container.querySelector('#ex-content').value = draft;
}
```

Notes:
- Mount is called **lazily** the first time the user activates the plugin tab in the sidebar.
- The dashboard core (`dashboard/init.js`) creates a `<div class="panel" id="panel-<id>">` for every plugin up front, but only invokes `mount(container)` on activation.
- Each panel action handler invokes the bridge via `dispatch('<plugin-id>', '<public-action>', params)` imported from `../../../dashboard/dispatch.js`. This goes through `background/onmessage` → `background/dispatch` → plugin `background[<action>]`.

### Per-plugin state

`state.js` exports a single mutable object:

```js
export const state = { pages: [], media: [] };
```

Keep field names short and a-z. Persist any data you care about across reloads to `chrome.storage.local` under plugin-scoped keys.

## Adding an MCP tool

If the new tool maps to an existing public action across platforms (e.g. `react` already in the schema):

1. Implement `plugin.background.react` in every plugin that supports it.
2. Implement an internal handler in each plugin's content script if needed.

If the tool is brand new:

1. Add `mcp.tool(name, desc, schema, handler)` in `src/server/index.js`.
2. The tool's handler calls `bridge.send(platform, '<name>', params)`.
3. Each plugin that wants to support it adds `plugin.background.<name>`.

## The MCP-server-to-extension transport

> ⚠️ **No transport between the MCP server and the extension exists yet.**
> `src/server/bridge.js` is a placeholder — every `bridge.send(...)` throws `socialmcp: no transport between MCP server and extension yet`. The AI-agent path is therefore non-functional today; the dashboard is the only way to drive plugin actions.
>
> When a transport is added later, only two files need to change:
> 1. `src/server/bridge.js` — replace the stub with the real `send(platform, action, params)` implementation.
> 2. `src/browser/background/index.js` — receive transport messages and call the existing `dispatch(platform, action, params)` (the same generic dispatcher the dashboard uses).
>
> Plugins do not need to change — they already speak the public-action contract.

## Build & test

| command | what it does |
|---------|--------------|
| `npm run build:ext` | bundles extension into `build/browser/`; auto-discovers plugins; auto-generates `manifest.json` `content_scripts` + `host_permissions` |
| `npm run build:server` | bundles MCP server into `build/server/index.js` |
| `npm run build` | both |
| `NODE_ENV=production node build.js` | enables terser minification |

Dev cycle:
1. Edit source.
2. Reload the extension in `chrome://extensions` (Reload button on the Social MCP card).
3. Open the dashboard from the extension icon.
4. Watch the service-worker DevTools console for errors.

## Drift checklist (run before every PR)

- [ ] `grep -ri "facebook\|instagram\|threads\|\\bx\\b" src/browser/{background,dashboard,common}/` returns nothing.
- [ ] Every file in `src/browser/` is imported by at least one other file (or is an entry point listed in `manifest.json` / `build.js`).
- [ ] Every `selectors.js` lives inside the feature folder that uses it; no platform-root `selectors.js`.
- [ ] Every plugin's `background` keys match the MCP tool names that callers will use.
- [ ] Every DOM id in a plugin's panel starts with `<plugin-id>-`.
- [ ] Every `chrome.storage.local` key starts with `<plugin-id>:`.
- [ ] `npm run build:ext` passes.
- [ ] A diary entry is added under `docs/diary/`.
