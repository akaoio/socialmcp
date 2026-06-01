# Copilot Instructions — Social MCP

## Documentation Rules (ALWAYS follow)

- **Keep this file up to date** when architecture, plugin layout, dependencies, build system, or conventions change.
- **Keep `README.md` in sync** with actual setup/usage.
- **Write a diary entry** at `docs/diary/YYYYMMDDHHmm.md` for every session that makes meaningful changes (what changed, why, tradeoffs).

## Naming Convention (HARD RULE)

Function names, file names, and exported identifiers are **single lowercase words from `[a-z]` only**. No camelCase, no underscores, no multi-word names. Example: `post`, `scanpages`, `getaxstree`.
Filename matches the function it exports (`post.js` exports `post`).

**Each feature is a folder. Each function is a file.** A file that contains two functions is a violation.

## Project Overview

Social MCP lets AI agents drive social media via clean MCP tool calls instead of DOM scraping. Two parts:

1. **Node MCP server** (`src/server/`) — stdio MCP; communicates with the extension via an HTTP long-poll relay (`bridge/bridge.js` + `peer.js`).
2. **Chrome MV3 extension** (`src/browser/`) — plugin-based host (background + relay page) that loads platform plugins.

**Supported platforms:** `facebook` (active), `x` / `instagram` / `threads` (schema-reserved, plugin pending).

## Architecture

```
AI Agent (stdio/MCP)
    └── src/server/index.js          MCP tools
            └── src/server/bridge/bridge.js (HTTP long-poll relay on localhost:8420)
                    └── src/browser/background/peer.js  long-poll client
                            └── src/browser/background/dispatch.js  ← reads plugin registry
                                    ├── src/browser/builtin/<action>/<action>.js  platform-agnostic
                                    └── src/browser/platform/<id>/content.js  DOM actions
```

`src/browser/relay/` is a minimal extension page (`relay.html` + `relay.js`) used by automated tests to send dispatch messages into the background without any UI.

## Plugin Architecture (CRITICAL)

`src/browser/{background,builtin,common}/` are **platform-agnostic**. They must contain ZERO references to `facebook`, `x`, etc. All platform-specific code lives under `src/browser/platform/<id>/`.

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
  label: 'Facebook',         // human label (for future UI)
  hosts: ['facebook.com'],   // URL substrings used by background findtab()
  background: { post, scan },  // PUBLIC action names → (tab, params) => result
}
```

**Keys in `plugin.background` are the public action names** — they must match what `bridge.send(platform, action, params)` passes (i.e. MCP tool names). Internal action names used between background and content script (`postpage`, `switchpage`, `getpages`) are private to the plugin.

### Plugin folder layout

```
src/browser/platform/<id>/
  plugin.js                     ← THE manifest (default export)
  hosts.js                      ← export const hosts = [...]
  content.js                    ← content-script entry; HANDLERS map + chrome.runtime.onMessage
  background/
    <action>.js                 ← ONE FILE PER PUBLIC ACTION (post.js, scan.js, …)
  <feature>/                    ← grouped DOM logic (post/, scan/, …)
    selectors.js                ← selectors are LOCAL TO THE FEATURE
    <step>.js                   ← one function per file
```

## Browser core (platform-agnostic)

### `src/browser/background/`
- `index.js` — service-worker entry; wires `chrome.runtime.onMessage`; starts `peer.js` long-poll loop.
- `onmessage.js` — receives `{ type: 'ui:dispatch', platform, action, params }`, calls `dispatch`, replies via `sendResponse`.
- `dispatch.js` — looks up builtin or plugin handler; calls it with `(tab, params)`.
- `findtab/findtab.js` — `findtab(id, hosts, url)` returns the socialmcp-owned tab (tracked in `chrome.storage.session`). Creates on first call. **Never reuses user-opened tabs.**
- `findtab/gettabs.js` — reads the owned-tab map from session storage.
- `grouptab.js` — adds tab to "socialmcp" tab group.
- `navigate.js`, `sendmessage.js` — generic Chrome tab helpers.
- `waitload.js` — resolves when tab finishes loading.
- `peer.js` — long-polls `GET /job` on localhost:8420, calls `dispatch`, POSTs result.

### `src/browser/builtin/`
Platform-agnostic action handlers available for every platform — no plugin handler needed:
- `screenshot/screenshot.js` — captures visible tab as PNG data URL.
- `getdom/getdom.js` — returns `document.documentElement.outerHTML`.
- `getaxstree/getaxstree.js` — returns compact ARIA tree (DOM walk via `chrome.scripting.executeScript`).

### `src/browser/common/`
Reusable utilities for content scripts (bundled as IIFE — keep dependency-free vanilla JS):
- `sleep.js` — `sleep(ms)` promise.

### `src/browser/relay/`
- `relay.html` + `relay.js` — minimal extension page used by tests; exposes `window.dispatch(platform, action, params)`.

> **Transport:** HTTP relay on `http://localhost:8420`. Server (`bridge/bridge.js`) queues jobs; extension (`peer.js`) long-polls `GET /job` and POSTs results to `POST /result/:id`.

## Selector discipline

- No shared `selectors.js` at the platform root. Each feature folder owns its own `selectors.js`.
- Prefer `aria-label`, `role`, `data-testid` over class names.

## Server — Zero External Runtime Deps

| File | Purpose |
|------|---------|
| `src/server/schema.js` | zod-compatible `schema` builder (internal class `sch`) |
| `src/server/mcpserver.js` | MCP JSON-RPC server class `mcpserver` |
| `src/server/stdioservertransport.js` | stdio transport class `stdioservertransport` |
| `src/server/bridge/bridge.js` | HTTP relay singleton `bridge` (long-poll RPC, port 8420) |
| `src/server/bridge/todataurl.js` | `todataurl(path)` — local file → base64 data URL |
| `src/server/bridge/resolvemedia.js` | `resolvemedia(params)` — converts local media paths in params |
| `src/server/launch.js` | `launch()` — auto-launch Chromium with isolated profile + extension |
| `src/server/ocr.js` | `ocr(dataurl, lang)` — server-side OCR via `tesseract.js` npm package |
| `src/server/index.js` | MCP server entry — declares 6 tools via `mcp.tool(...)` |

No per-folder package.json. No runtime dependencies.

### Bridge — `src/server/bridge/bridge.js`
- Singleton `export const bridge = { send(...) }` — HTTP server starts at module load.
- `GET /job` long-poll (up to 25 s); `POST /result/:id` resolves the waiting promise.
- **Auto-launch:** if no peer polled in last 5 s, calls `launch()` after 2 s delay.

## MCP tools — `src/server/index.js`

| Tool | Action | Returns |
|------|--------|---------|
| `post` | `post` | post result |
| `scan` | `scan` | list of managed Pages |
| `screenshot` | `screenshot` (builtin) | MCP `image` content (PNG base64) |
| `getdom` | `getdom` (builtin) | `{ html }` — full outerHTML |
| `getaxstree` | `getaxstree` (builtin) | `{ tree }` — compact ARIA tree |
| `ocr` | `screenshot` (builtin) → server OCR | `{ text }` — Tesseract output |

**Builtin actions** are handled in `dispatch.js` before plugin lookup — work for every platform.

To add a tool:
1. Add `mcp.tool(...)` in `src/server/index.js`.
2. Add handler in `src/browser/builtin/<action>/<action>.js` (platform-agnostic) OR in the plugin's `background/<action>.js` + content script `HANDLERS`.

## Adding a new platform

Follow [docs/plugin-dev-guide.md](../docs/plugin-dev-guide.md). Summary:

1. `src/browser/platform/<id>/` — copy facebook's structure: `plugin.js`, `hosts.js`, `content.js`, `background/<action>.js`, feature folders.
2. Add to `src/browser/plugins.js`.
3. Add `content_scripts` + `host_permissions` to `src/browser/manifest.json` (dev mode only; prod build auto-generates from `hosts.js`).

`build.js` auto-discovers any `src/browser/platform/<id>/plugin.js` — you do NOT need to edit it.

The platform string must already be in `schema.enum([...])` in `src/server/index.js` — `facebook | x | instagram | threads` are pre-registered.

## Build system — `build.js`

- **esbuild** (single devDependency).
- `npm run build:server` → `build/server/index.js` (ESM, `platform: 'node'`).
- `npm run build:ext` → `build/browser/`:
  - **auto-discovers** platforms by scanning `src/browser/platform/*/plugin.js`.
  - `background/index.js` — ESM bundle.
  - `<platform>/content.js` — IIFE bundle.
  - `manifest.json` — regenerated from `src/browser/manifest.json` + each plugin's `hosts.js`.
  - `relay/relay.{html,js}` — copied as-is.
- `NODE_ENV=production node build.js` enables minification.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SOCIALMCP_CHROMIUM` | auto-detected | Path to Chromium binary for auto-launch |

Auto-detected candidates: `/usr/lib/chromium/chromium`, `/usr/bin/chromium-browser`, `/usr/bin/google-chrome`, macOS Chrome.

The relay port (`8420`) is hardcoded in `bridge/bridge.js`.

## Testing

```bash
npm test                                                      # build ext + run all tests
FACEBOOK_COOKIES=$(node scripts/extractcookies.js) npm test   # include real Facebook E2E
```

Test files:
- `tests/extension.spec.js` — extension loads, service worker starts, relay page exposes `dispatch`.
- `tests/debug.spec.js` — screenshot, getdom, getaxstree, ocr tools end-to-end.
- `tests/facebook.spec.js` — full scan pipeline via relay page. Skipped unless `FACEBOOK_COOKIES` set.
- `tests/post.spec.js` — full post pipeline. Skipped unless `FACEBOOK_COOKIES` + `FACEBOOK_POST_PAGE` set.

**Design principle:** no mocks — every test exercises real production code paths end-to-end.

**Manual verification:**
1. `node src/server/index.js` — starts stdio MCP server + HTTP relay on `localhost:8420`.
2. Load `build/browser/` as unpacked extension in Chrome.
3. `npx @modelcontextprotocol/inspector node src/server/index.js` — inspect tools live.


## Documentation Rules (ALWAYS follow)

- **Keep this file up to date** when architecture, plugin layout, dependencies, build system, or conventions change.
- **Keep `README.md` in sync** with actual setup/usage.
- **Write a diary entry** at `docs/diary/YYYYMMDDHHmm.md` for every session that makes meaningful changes (what changed, why, tradeoffs).

## Naming Convention (HARD RULE)

Function names, file names, and exported identifiers are **single lowercase words from `[a-z]` only**. No camelCase, no underscores, no multi-word names. Example: `mount`, `post`, `scanpages`, `filetourl`, `setupimagepicker`.
Filename matches the function it exports (`post.js` exports `post`).

## Project Overview

Social MCP lets AI agents drive social media via clean MCP tool calls instead of DOM scraping. Two parts:

1. **Node MCP server** (`src/server/`) — stdio MCP; communicates with the extension via an HTTP long-poll relay (`bridge.js` + `peer.js`).
2. **Chrome MV3 extension** (`src/browser/`) — plugin-based host (background + dashboard) that loads platform plugins.

**Supported platforms:** `facebook` (active), `x` / `instagram` / `threads` (schema-reserved, plugin pending).

## Architecture

```
AI Agent (stdio/MCP)
    └── src/server/index.js          MCP tools
            └── src/server/bridge.js (HTTP long-poll relay on localhost:8420)
                    └── src/browser/background/peer.js  long-poll client
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
- `index.js` — service-worker entry; wires `chrome.action.onClicked` + `chrome.runtime.onMessage`; starts `peer.js` long-poll loop.
- `onmessage.js` — receives `{ type: 'ui:dispatch', platform, action, params }` from the dashboard, calls `dispatch`, replies via `sendResponse`.
- `dispatch.js` — looks up plugin in registry; if `plugin.background[action]` exists calls it with `(tab, params)`; otherwise falls back to generic `findtab → sendmessage` (no navigation, no platform-specific magic).
- `findtab.js` — `findtab(id, hosts, url)` returns the socialmcp-owned tab for this platform (tracked in `chrome.storage.session`). **Never reuses user-opened tabs.** Creates a new tab on first call or if the owned tab was closed.
- `grouptab.js` — `grouptab(tabId)` adds the tab to a "socialmcp" tab group (creates one if absent).
- `navigate.js`, `sendmessage.js` — generic Chrome tab helpers (imported by plugin background handlers as needed).
- `waitload.js` — `waitload(tabId, extraWait?)` resolves when tab finishes loading + optional extra delay.
- `opendashboard.js` — opens the dashboard page.

> **Transport:** HTTP relay on `http://localhost:8420`. Server (`bridge.js`) queues jobs; extension (`peer.js`) long-polls `GET /job` and POSTs results to `POST /result/:id`.

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
| `src/server/schema.js` | zod-compatible `schema` builder | `zod` |
| `src/server/mcpserver.js` | MCP JSON-RPC server | `@modelcontextprotocol/sdk` |
| `src/server/stdioservertransport.js` | stdio transport for MCP | `@modelcontextprotocol/sdk` |
| `src/server/bridge.js` | HTTP relay server (long-poll RPC) | — |
| `src/server/launch.js` | Auto-launch Chromium with isolated profile + extension | — |
| `src/server/ocr.js` | Server-side OCR via `tesseract.js` npm package | — |
| `src/server/index.js` | Declares MCP tools via `mcp.tool(name, desc, schema, handler)` | — |

There is no per-folder package.json. The root `package.json` has no runtime dependencies.

### Bridge — `src/server/bridge.js`
- **HTTP long-poll relay** on `http://localhost:8420`. Uses only Node `http` built-in — no external deps.
- `GET /job` — long-poll (up to 25 s); returns next pending job as JSON or 204 if none arrive. Updates `lastPeerAt` on every hit.
- `POST /result/:id` — extension posts `{ ok, value? }` or `{ ok: false, error }` to resolve the waiting `send()` promise.
- `send(platform, action, params, timeout)` queues a job and awaits the result promise.
- **Auto-launch:** if no peer has polled in the last 5 s, waits 2 s then calls `launch()` from `launch.js` to open Chromium. Re-launch is suppressed for 30 s after a successful launch attempt. Set `SOCIALMCP_CHROMIUM` if the binary isn't auto-detected.

### Auto-launch — `src/server/launch.js`
- Finds the Chromium binary (checks `SOCIALMCP_CHROMIUM` env var first, then common paths).
- Spawns Chromium with a dedicated `--user-data-dir=~/.socialmcp/profile` (isolated profile, always loads the extension regardless of existing Chrome instances) and `--load-extension=build/browser`.
- Requires `build/browser/` to exist — run `npm run build:ext` first.
- Long-polls `GET http://localhost:8420/job` (26 s timeout, retries on error with 3 s backoff).
- On 200: calls `dispatch(platform, action, params)`, POSTs result to `POST /result/:id`.
- No external libraries — uses the service worker's native `fetch`.

## MCP tools — `src/server/index.js`

Each tool takes a `platform` enum (`facebook | x | instagram | threads`) plus its own params, and calls `bridge.send(p, action, params)` wrapped in `reply()`.

Current tools:

| Tool | Action | Returns |
|------|--------|---------|
| `post` | `post` | post result |
| `scan` | `scan` | list of managed Pages |
| `screenshot` | `screenshot` (builtin) | MCP `image` content (PNG base64) |
| `getdom` | `getdom` (builtin) | `{ html: "..." }` — full outerHTML |
| `getaxstree` | `getaxstree` (builtin) | `{ tree: "..." }` — compact ARIA tree |
| `ocr` | `screenshot` (builtin) → server OCR | `{ text: "..." }` — Tesseract output |

**Builtin actions** (`screenshot`, `getdom`, `getaxstree`) are handled directly in `dispatch.js` before the plugin lookup — they work for every platform without any plugin handler. `ocr` calls `screenshot` via bridge, then runs `tesseract` server-side.

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

| Variable | Default | Purpose |
|---|---|---|
| `SOCIALMCP_CHROMIUM` | auto-detected | Path to Chromium binary for auto-launch |

Auto-detected candidates (in order): `/usr/lib/chromium/chromium`, `/usr/bin/chromium-browser`, `/usr/bin/google-chrome`, macOS Chrome.

The relay port (`8420`) is hardcoded in `bridge.js`.

## Install — `install.sh`

```bash
./install.sh           # npm install + Playwright Chromium (any Linux dev)
./install.sh --server  # above + noVNC stack + system Chromium + pycryptodome
```

**Base mode** (any Linux dev): installs npm packages and runs `playwright install chromium` + system deps so `npm test` works immediately.

**Server mode** (`--server`): additionally installs via `apt`:
- `xvfb`, `openbox`, `x11vnc`, `websockify`, `novnc` — headless display + VNC stack
- `chromium` — system Chromium (Playwright's bundled Chromium crashes on ARM)
- `python3-pycryptodome` — AES decryption for `scripts/extractcookies.js`
- `tigervnc-tools` (`vncpasswd`)

Also prompts to set a VNC password at `~/.vncpasswd` (first run only).

## Scripts — `scripts/`

| File | Purpose |
|------|---------|
| `scripts/startnovnc.sh` | Start the full noVNC stack; `--stop` tears it all down |
| `scripts/extractcookies.js` | Decrypt Facebook cookies from Chromium profile → JSON |

### `scripts/startnovnc.sh`

```bash
scripts/startnovnc.sh          # start: Xvfb → openbox → x11vnc → websockify/noVNC
scripts/startnovnc.sh --stop   # stop all services
```

Access: `http://<host>:6080/vnc.html` (VNC password required).

**noVNC stack on ARM (Orange Pi 5 / Armbian):**
- Use system `/usr/lib/chromium/chromium`, not Playwright's bundled Chromium (crashes on ARM)
- Required Chromium flags: `--no-sandbox --no-zygote --single-process --disable-dev-shm-usage --disable-gpu --disable-gpu-rasterization`
- Use `x11vnc -noxdamage` — avoids `destroyed xdamage object` crash
- Chromium may still crash periodically on ARM; restart it manually or re-run startnovnc.sh

### `scripts/extractcookies.js`

Reads `~/.config/chromium/Default/Cookies` (SQLite), decrypts AES-128-CBC cookies (key = PBKDF2("peanuts", "saltysalt", 1, 16), IV = 16 spaces), strips 32-byte prefix from plaintext, outputs JSON array of `{ name, value, domain, path, httpOnly, secure }`.

```bash
node scripts/extractcookies.js > /tmp/fb_cookies.json
```

Cookies expire in weeks — re-run after re-logging in via noVNC.

## Testing

Automated integration tests using Playwright (no mocks, all tests run against real systems):

```bash
npm test                                                      # build ext + run all tests
FACEBOOK_COOKIES=$(node scripts/extractcookies.js) npm test   # include real Facebook E2E
```

**Test files:**
- `tests/extension.spec.js` — extension loads, service worker starts, dashboard renders.
- `tests/facebook.spec.js` — full production pipeline: dashboard "Scan pages" button → background dispatch → `scan.js` navigates real FB tab → manifest-injected content script → DOM parse → storage update. Skipped unless `FACEBOOK_COOKIES` is set.

**Getting `FACEBOOK_COOKIES`:** log in to Facebook via the noVNC browser session, then run `node scripts/extractcookies.js`.

**Design principles:** no mocks, no fakes — every test exercises real production code paths end-to-end. `facebook.spec.js` proves the entire chain works on live Facebook.

**Manual verification:**
1. **Server**: `node src/server/index.js` — starts the stdio MCP server + HTTP relay on `localhost:8420`. Tool calls will **timeout** if the extension is not loaded and connected.
2. **Extension**: load `src/browser/` (or `build/browser/` after `npm run build:ext`) as an unpacked extension → open the dashboard via the extension action → use the panel to invoke plugin actions.
3. **Tools**: `npx @modelcontextprotocol/inspector node src/server/index.js` — the schema lists every tool; calls require the extension to be running and connected via the relay.

