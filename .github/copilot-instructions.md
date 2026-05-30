# Copilot Instructions — Social MCP

## Documentation Rules (ALWAYS follow)

- **Keep this file up to date** when architecture, plugin layout, dependencies, build system, or conventions change.
- **Keep `README.md` in sync** with actual setup/usage.
- **Write a diary entry** at `docs/diary/YYYYMMDDHHmm.md` for every session that makes meaningful changes (what changed, why, tradeoffs).

## Naming Convention (HARD RULE)

Function names, file names, and exported identifiers are **single lowercase words from `[a-z]` only**. No camelCase, no underscores, no multi-word names. Example: `mount`, `post`, `scanpages`, `filetourl`, `setupimagepicker`.
Filename matches the function it exports (`post.js` exports `post`).

## Project Overview

Social MCP lets AI agents drive social media via clean MCP tool calls instead of DOM scraping. Two parts:

1. **Node MCP server** (`src/server/`) — stdio MCP; transport to the extension is **not yet implemented** — tools throw a clear error until wired.
2. **Chrome MV3 extension** (`src/browser/`) — plugin-based host (background + dashboard) that loads platform plugins.

**Supported platforms:** `facebook` (active), `x` / `instagram` / `threads` (schema-reserved, plugin pending).

## Architecture

```
AI Agent (stdio/MCP)
    └── src/server/index.js          MCP tools
            └── src/server/bridge.js (placeholder — throws until transport added)
                    └── src/browser/background/index.js  MV3 SW
                            └── src/browser/background/dispatch.js  ← reads plugin registry
                                    └── src/browser/platform/<id>/content.js  DOM actions
```

The dashboard (`src/browser/dashboard/`) is a separate extension page used for manual testing — also reads the plugin registry, knows nothing about specific platforms.

## Plugin Architecture (CRITICAL)

`src/browser/{background,dashboard,common}/` are **platform-agnostic**. They must contain ZERO references to `facebook`, `x`, etc. All platform-specific code lives under `src/browser/platform/<id>/`.

For any plugin/feature work, **follow [docs/plugin-dev-guide.md](../docs/plugin-dev-guide.md)** — it is the binding contract.

### Plugin registry — `src/browser/plugins.js`

```js
import facebook from './platform/facebook/plugin.js';
export const plugins = [facebook];
```

### Plugin manifest — `src/browser/platform/<id>/plugin.js`

Each plugin exports a default object:

```js
{
  id:    'facebook',         // platform id used in MCP `platform` param
  label: 'Facebook',         // human label for dashboard sidebar
  hosts: ['facebook.com'],   // URL substrings used by background findtab()
  css:   'platform/facebook/dashboard/panel.css',  // optional, injected into dashboard
  background: { post, scan },        // PUBLIC action names → (tab, params) => result
  dashboard:  { mount },             // mount(container) — renders the plugin's UI panel
}
```

**Keys in `plugin.background` are the public action names** — they must match what `bridge.send(platform, action, params)` passes (i.e. MCP tool names + dashboard-facing aliases). Internal action names used between background and content script (`postpage`, `switchpage`, `getpages`) are private to the plugin.

### Plugin folder layout

```
src/browser/platform/<id>/
  plugin.js                     ← THE manifest (default export)
  hosts.js                      ← export const hosts = [...]
  content.js                    ← content-script entry; HANDLERS map + chrome.runtime.onMessage
  background/
    <action>.js                 ← ONE FILE PER PUBLIC ACTION (post.js, scan.js, …)
  dashboard/
    mount.js                    ← mount(container): injects panel.js html, wires events
    panel.js                    ← export const html = `...`
    panel.css                   ← styles, loaded via plugin.css
    state.js                    ← per-plugin mutable shared state (e.g. { pages: [], media: [] })
    <action>.js                 ← one file per dashboard action (post, scanpages, …)
  <feature>/                    ← grouped DOM logic (post/, scan/, …)
    selectors.js                ← selectors are LOCAL TO THE FEATURE (do not create a shared selectors.js)
    <step>.js                   ← one function per file
```

## Browser core (platform-agnostic)

### `src/browser/background/`
- `index.js` — service-worker entry; wires `chrome.action.onClicked` + `chrome.runtime.onMessage`.
- `onmessage.js` — receives `{ type: 'ui:dispatch', platform, action, params }` from the dashboard, calls `dispatch`, replies via `sendResponse`.
- `dispatch.js` — looks up plugin in registry; if `plugin.background[action]` exists calls it with `(tab, params)`; otherwise falls back to generic `findtab → sendmessage` (no navigation, no platform-specific magic).
- `findtab.js` — `findtab(hosts)` returns first `chrome.tabs` whose URL includes any host string.
- `navigate.js`, `sendmessage.js` — generic Chrome tab helpers (imported by plugin background handlers as needed).
- `opendashboard.js` — opens the dashboard page.

> ⚠️ **Known gap:** the MCP server has no transport to the extension yet — `src/server/bridge.js` is a placeholder that throws. The dashboard is currently the only way to invoke plugin actions. When a transport is chosen, only `bridge.js` and `src/browser/background/index.js` need to change — plugins already speak the public-action contract.

### `src/browser/dashboard/`
- `index.html` — generic shell: sidebar + content container, no platform markup.
- `index.css` — shell styles only.
- `index.js`, `init.js` — iterates `plugins`, injects each plugin's CSS link, builds sidebar button, lazy-mounts plugin panel on first activation.
- `dispatch.js` — generic `(platform, action, params) => chrome.runtime.sendMessage(...)`.

### `src/browser/common/`
Reusable utilities for both background and content scripts (content scripts re-import as bundled IIFE — keep dependency-free vanilla JS):

`sleep.js`, `filetourl.js`. Add new shared utils here only when at least one importer exists.

## Selector discipline

- No shared `selectors.js` at the platform root. Each feature folder owns its own `selectors.js`, imported as `'./selectors.js'` from sibling files.
- Prefer `aria-label`, `role`, `data-testid` over class names.

## Server — Zero External Runtime Deps

Uses only Node built-ins:

| File | Purpose | Replaces |
|------|---------|----------|
| `src/server/mcp.js` | MCP JSON-RPC server + zod-compatible `schema` builder | `@modelcontextprotocol/sdk` + `zod` |
| `src/server/bridge.js` | Placeholder transport — throws until a real transport is wired | — |
| `src/server/index.js` | Declares 9 MCP tools via `mcp.tool(name, desc, schema, handler)` | — |

There is no per-folder package.json. The root `package.json` currently has no runtime dependencies.

### Bridge — `src/server/bridge.js`
- Stub: every `send(platform, action, ...)` throws `socialmcp: no transport between MCP server and extension yet`.
- When a transport is added, this is the only server-side file that needs to change.

## MCP tools — `src/server/index.js`

Each tool takes a `platform` enum (`facebook | x | instagram | threads`) plus its own params, and calls `bridge.send(p, action, params)` wrapped in `reply()`.

Current tools: `post`, `comment`, `react`, `scroll`, `search`, `follow`, `unfollow`, `message`, `profile`.

To add a tool:
1. Add `mcp.tool(...)` in `src/server/index.js`.
2. Add `async function <action>(params)` in the plugin's content script (under a feature folder, re-exported via `HANDLERS`).
3. Register it in the content script's `HANDLERS` map.

## Adding a new platform

Follow [docs/plugin-dev-guide.md](../docs/plugin-dev-guide.md). Summary:

1. `src/browser/platform/<id>/` — copy facebook's structure: `plugin.js`, `hosts.js`, `content.js`, `background/<action>.js`, `dashboard/`, feature folders.
2. Add to `src/browser/plugins.js`.
3. Add a `content_scripts` entry + `host_permissions` to `src/browser/manifest.json` (for dev mode); the production build auto-generates these from `hosts.js`.

`build.js` auto-discovers any `src/browser/platform/<id>/plugin.js` — you do NOT need to edit it.

The platform string in MCP must already be in `schema.enum([...])` in `src/server/index.js` — `facebook | x | instagram | threads` are pre-registered.

## Build system — `build.js`

- **esbuild** (single devDependency).
- `npm run build:server` → `build/server/index.js` (ESM, `platform: 'node'`).
- `npm run build:ext` → `build/browser/`:
  - **auto-discovers** platforms by scanning `src/browser/platform/*/plugin.js`.
  - `background/index.js` — ESM bundle.
  - `<platform>/content.js` — IIFE bundle from `src/browser/platform/<id>/content.js`.
  - `dashboard/index.js` — IIFE bundle.
  - `manifest.json` — **regenerated** from `src/browser/manifest.json` + each plugin's `hosts.js` (auto-fills `content_scripts` + `host_permissions`).
  - `dashboard/index.{html,css}` + plugin CSS files (recursively copied from `src/browser/platform/**/*.css`).
- `NODE_ENV=production node build.js` enables minification (disables sourcemaps).

## Environment variables

None right now. (Previous `SOCIALMCP_PORT` / `SOCIALMCP_SECRET` belonged to a removed transport.)

## Testing

No automated tests. Manual verification:

1. **Server**: `node src/server/index.js` — starts the stdio MCP server; tool calls will throw until a transport is implemented.
2. **Extension**: load `src/browser/` (or `build/browser/` after `npm run build:ext`) as an unpacked extension → open the dashboard via the extension action → use the panel to invoke plugin actions.
3. **Tools**: `npx @modelcontextprotocol/inspector node src/server/index.js` — the schema lists every tool; calls will error until a transport is wired.
