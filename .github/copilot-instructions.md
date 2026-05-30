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

1. **Node MCP server** (`src/server/`) — stdio MCP; relays commands to the extension via ZEN WebSocket.
2. **Chrome MV3 extension** (`src/browser/`) — plugin-based host (background + dashboard) that loads platform plugins.

**Supported platforms:** `facebook` (active), `x` / `instagram` / `threads` (schema-reserved, plugin pending).

## Architecture

```
AI Agent (stdio/MCP)
    └── src/server/index.js          MCP tools
            └── src/server/bridge.js ZEN relay (ws://127.0.0.1:8420/zen)
                    └── src/browser/background/index.js  MV3 SW (ZEN peer)
                            └── src/browser/background/dispatch.js  ← reads plugin registry
                                    └── src/browser/platform/<id>/content.js  DOM actions
```

The dashboard (`src/browser/dashboard/`) is a separate extension page used for manual testing — also reads the plugin registry, knows nothing about specific platforms.

## Plugin Architecture (CRITICAL)

`src/browser/{background,dashboard,common}/` are **platform-agnostic**. They must contain ZERO references to `facebook`, `x`, etc. All platform-specific code lives under `src/browser/platform/<id>/`.

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
  background: { postpage: dispatch },  // optional per-action override for tab routing
  dashboard:  { mount },               // mount(container) — renders the plugin's UI panel
}
```

### Plugin folder layout

```
src/browser/platform/<id>/
  plugin.js                     ← THE manifest (default export)
  hosts.js                      ← export const hosts = [...]
  content.js                    ← content-script entry; HANDLERS map + chrome.runtime.onMessage
  background/
    dispatch.js                 ← optional per-action handler (tab, params) => result
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
- `index.js` — service-worker entry; opens ZEN peer; listens to `~<pub>/cmd/*`.
- `onmessage.js` — parses command, calls `dispatch`, writes JSON response to `~<pub>/res/<id>`.
- `dispatch.js` — looks up plugin in registry; if `plugin.background[action]` exists calls it with `(tab, params)`; otherwise falls back to generic `findtab → navigate? → sendmessage` flow.
- `findtab.js` — `findtab(hosts)` returns first `chrome.tabs` whose URL includes any host string.
- `navigate.js`, `sendmessage.js` — generic Chrome tab helpers.
- `opendashboard.js` — opens the dashboard page.

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

Uses only Node built-ins + `@akaoio/zen`:

| File | Purpose | Replaces |
|------|---------|----------|
| `src/server/mcp.js` | MCP JSON-RPC server + zod-compatible `schema` builder | `@modelcontextprotocol/sdk` + `zod` |
| `src/server/bridge.js` | ZEN relay (`new ZEN({ web: httpServer })`) | `ws` |
| `src/server/index.js` | Declares 9 MCP tools via `mcp.tool(name, desc, schema, handler)` | — |

All deps live in the root `package.json`. There is no per-folder package.json.

### Bridge — `src/server/bridge.js`
- Starts a ZEN relay on `SOCIALMCP_PORT` (default `8420`), path `/zen`.
- Derives a secp256k1 keypair from `SOCIALMCP_SECRET` via `ZEN.hash() → ZEN.pair(null, { seed })`.
- `send(platform, action, params, timeout = 30000)` → puts JSON to `~<pub>/cmd/<id>`, awaits `~<pub>/res/<id>`.
- Every `.put()` includes `{ authenticator: pair }`; ZEN rejects unsigned writes to `~<pub>/...`.
- Commands: `{ platform, action, params, ts }` · Responses: `{ ok }` or `{ err }`.

The extension background derives the same keypair (`chrome.storage.local.secret`, fallback to built-in default) and is the only peer permitted to sign writes.

## MCP tools — `src/server/index.js`

Each tool takes a `platform` enum (`facebook | x | instagram | threads`) plus its own params, and calls `bridge.send(p, action, params)` wrapped in `reply()`.

Current tools: `post`, `comment`, `react`, `scroll`, `search`, `follow`, `unfollow`, `message`, `profile`.

To add a tool:
1. Add `mcp.tool(...)` in `src/server/index.js`.
2. Add `async function <action>(params)` in the plugin's content script (under a feature folder, re-exported via `HANDLERS`).
3. Register it in the content script's `HANDLERS` map.

## Adding a new platform

1. `src/browser/platform/<id>/` — copy facebook's structure: `plugin.js`, `hosts.js`, `content.js`, `dashboard/`, feature folders.
2. Add to `src/browser/plugins.js`.
3. Add a `content_scripts` entry in `src/browser/manifest.json` matching `hosts`.
4. Add `<id>` to `PLATFORMS` array in `build.js`.
5. (Optional) extend `host_permissions` in `manifest.json`.

The platform string in MCP must already be in `schema.enum([...])` in `src/server/index.js` — `facebook | x | instagram | threads` are pre-registered.

## Build system — `build.js`

- **rollup** + `@rollup/plugin-node-resolve` + `@rollup/plugin-json` + `@rollup/plugin-terser`.
- `npm run build:server` → `build/server/index.js` (ESM, only `node:*` external; ZEN bundled).
- `npm run build:ext` → `build/browser/`:
  - `background/index.js` — ESM bundle.
  - `<platform>/content.js` — IIFE bundle from `src/browser/platform/<id>/content.js`.
  - `dashboard/index.js` — IIFE bundle.
  - `manifest.json`, `dashboard/index.{html,css}`, plugin CSS files (recursively copied from `src/browser/platform/**/*.css`), wasm files (`pen.wasm`, `crypto.wasm` from `@akaoio/zen`).
- `NODE_ENV=production node build.js` enables terser minification.
- `zenServiceStub` rollup plugin stubs the broken `import("./service.js")` in ZEN and sets `inlineDynamicImports: true`.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SOCIALMCP_PORT` | `8420` | ZEN relay port (`ws://127.0.0.1:PORT/zen`) |
| `SOCIALMCP_SECRET` | built-in default | Shared secret for keypair derivation — set a strong random value in production |

## Testing

No automated tests. Manual verification:

1. **Server**: `node src/server/index.js` → expect `[socialmcp] zen relay on ws://127.0.0.1:8420/zen (pub: <pubkey>)`.
2. **Extension**: load `src/browser/` (or `build/browser/` after `npm run build:ext`) as an unpacked extension → open the service-worker DevTools → confirm ZEN peer connected → open the dashboard via the extension action.
3. **Tools**: `npx @modelcontextprotocol/inspector node src/server/index.js` → call a tool with a `platform` that has an open tab.
