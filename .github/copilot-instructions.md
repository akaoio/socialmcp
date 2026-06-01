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

1. **Node MCP server** (`src/server/`) — stdio MCP; communicates with the extension via an HTTP long-poll relay (`bridge/bridge.js` + `peer.js`) on `localhost:8765`.
2. **Chrome MV3 extension** (`src/browser/`) — plugin-based host (background) that loads platform plugins.

**Supported platforms:** `facebook` (active), `x` / `instagram` / `threads` (schema-reserved, plugin pending).

## Architecture

```
AI Agent (stdio/MCP)
    └── src/server/index.js          MCP tools
            └── src/server/bridge/bridge.js  (HTTP long-poll relay on localhost:8765)
                    └── src/browser/background/peer.js  long-poll client
                            └── src/browser/background/dispatch.js  ← reads plugin registry
                                    ├── src/browser/builtin/<action>/<action>.js  platform-agnostic
                                    └── src/browser/platform/<id>/content.js  DOM actions
```

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
  id:    'facebook',           // platform id used in MCP `platform` param
  label: 'Facebook',           // human-readable name
  hosts: ['facebook.com'],     // URL substrings used by background findtab()
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
- `peer.js` — long-polls `GET http://localhost:8765/job`, calls `dispatch`, POSTs result to `/result/:id`. Retries on error with 3 s backoff.

> **Transport:** HTTP relay on `http://localhost:8765`. Server (`bridge/bridge.js`) queues jobs; extension (`peer.js`) long-polls `GET /job` and POSTs results to `POST /result/:id`.

### `src/browser/builtin/`
Platform-agnostic action handlers available for every platform — no plugin handler needed:
- `screenshot/screenshot.js` — captures visible tab as PNG data URL.
- `getdom/getdom.js` — returns `document.documentElement.outerHTML`.
- `getaxstree/getaxstree.js` — returns compact ARIA tree (DOM walk via `chrome.scripting.executeScript`).

### `src/browser/common/`
Reusable utilities for content scripts (bundled as IIFE — keep dependency-free vanilla JS):

`sleep.js`. Add new shared utils here only when at least one importer exists.

## Selector discipline

- No shared `selectors.js` at the platform root. Each feature folder owns its own `selectors.js`, imported as `'./selectors.js'` from sibling files.
- Prefer `aria-label`, `role`, `data-testid` over class names.

## Server — Zero External Runtime Deps

Uses only Node built-ins + `tesseract.js` (OCR only):

| File | Purpose |
|------|---------|
| `src/server/schema.js` | zod-compatible `schema` builder |
| `src/server/mcpserver.js` | MCP JSON-RPC server class `mcpserver` |
| `src/server/stdioservertransport.js` | stdio transport class `stdioservertransport` |
| `src/server/bridge/bridge.js` | HTTP relay singleton `bridge` (long-poll RPC, port 8765) |
| `src/server/bridge/todataurl.js` | `todataurl(path)` — local file → base64 data URL |
| `src/server/bridge/resolvemedia.js` | `resolvemedia(params)` — converts local media paths in params |
| `src/server/launch.js` | `launch()` — auto-launch Chromium with isolated profile + extension |
| `src/server/ocr/ocr.js` | `ocr(dataurl, lang)` — server-side OCR via `tesseract.js` |
| `src/server/index.js` | MCP server entry — declares 6 tools via `mcp.tool(...)` |

No per-folder package.json. No runtime dependencies (only devDependencies: esbuild, playwright, tesseract.js).

### Bridge — `src/server/bridge/bridge.js`
- Singleton `export const bridge = { send(...) }` — HTTP server starts at module load on port 8765.
- `GET /ready` — returns `{ connected: true }` (200) when extension peer polled within last 6 s, else 503.
- `GET /job` — long-poll (up to 25 s); returns next pending job as JSON or 204 if none arrive.
- `POST /result/:id` — extension posts `{ ok, value? }` or `{ ok: false, error }` to resolve the waiting `send()` promise.
- `send(platform, action, params, timeout?)` queues a job and awaits the result. Default timeout 30 s; `post` uses 90 s.
- **Auto-launch:** if no peer polled in last 5 s, waits 2 s then calls `launch()` to open Chromium. Disabled when `SOCIALMCP_NO_AUTOLAUNCH=1` (used by tests).

### Auto-launch — `src/server/launch.js`
- Finds the Chromium binary (`SOCIALMCP_CHROMIUM` env var, then common paths).
- Spawns Chromium with `--user-data-dir=~/.socialmcp/profile` and `--load-extension=build/browser`.
- Requires `build/browser/` to exist — run `npm run build:ext` first.

## MCP tools — `src/server/index.js`

Each tool takes a `platform` enum (`facebook | x | instagram | threads`) plus its own params, and calls `bridge.send(p, action, params)` wrapped in `reply()`.

| Tool | Action | Returns |
|------|--------|---------|
| `post` | `post` | post result |
| `scan` | `scan` | list of managed Pages |
| `screenshot` | `screenshot` (builtin) | MCP `image` content (PNG base64) |
| `getdom` | `getdom` (builtin) | `{ html: "..." }` — full outerHTML |
| `getaxstree` | `getaxstree` (builtin) | `{ tree: "..." }` — compact ARIA tree |
| `ocr` | `screenshot` (builtin) → server OCR | `{ text: "..." }` — Tesseract output |

`post` also accepts `dryrun: boolean` — opens compose dialog and verifies without clicking Post.

**Builtin actions** (`screenshot`, `getdom`, `getaxstree`) are handled directly in `dispatch.js` before the plugin lookup — they work for every platform automatically.

To add a tool:
1. Add `mcp.tool(...)` in `src/server/index.js`.
2. Add handler in `src/browser/builtin/<action>/<action>.js` (platform-agnostic) OR in the plugin's `background/<action>.js` + content script `HANDLERS`.

## Adding a new platform

Follow [docs/plugin-dev-guide.md](../docs/plugin-dev-guide.md). Summary:

1. `src/browser/platform/<id>/` — copy facebook's structure: `plugin.js`, `hosts.js`, `content.js`, `background/<action>.js`, feature folders.
2. Add to `src/browser/plugins.js`.
3. Add a `content_scripts` entry + `host_permissions` to `src/browser/manifest.json` (dev mode only; prod build auto-generates from `hosts.js`).

`build.js` auto-discovers any `src/browser/platform/<id>/plugin.js` — you do NOT need to edit it.

The platform string must already be in `schema.enum([...])` in `src/server/index.js` — `facebook | x | instagram | threads` are pre-registered.

## Build system — `build.js`

- **esbuild** (single devDependency).
- `npm run build:server` → `build/server/index.js` (ESM, `platform: 'node'`).
- `npm run build:ext` → `build/browser/`:
  - **auto-discovers** platforms by scanning `src/browser/platform/*/plugin.js`.
  - `background/index.js` — ESM bundle.
  - `<platform>/content.js` — IIFE bundle from `src/browser/platform/<id>/content.js`.
  - `manifest.json` — **regenerated** from `src/browser/manifest.json` + each plugin's `hosts.js` (auto-fills `content_scripts` + `host_permissions`).
- `NODE_ENV=production node build.js` enables minification.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SOCIALMCP_CHROMIUM` | auto-detected | Path to Chromium binary for auto-launch |
| `SOCIALMCP_NO_AUTOLAUNCH` | — | Set to `1` to disable auto-launch (used by tests) |

Auto-detected Chromium candidates: `/usr/lib/chromium/chromium`, `/usr/bin/chromium-browser`, `/usr/bin/google-chrome`, macOS Chrome.

The relay port (`8765`) is hardcoded in `bridge/bridge.js` and `peer.js`.

## Install — `install.sh`

```bash
./install.sh           # npm install + Playwright Chromium (any Linux dev)
./install.sh --server  # above + noVNC stack + system Chromium + pycryptodome
```

**Server mode** (`--server`): additionally installs `xvfb`, `openbox`, `x11vnc`, `websockify`, `novnc`, `chromium`, `python3-pycryptodome`, `tigervnc-tools`.

## Scripts — `scripts/`

| File | Purpose |
|------|---------|
| `scripts/startnovnc.sh` | Start the full noVNC stack; `--stop` tears it all down |
| `scripts/extractcookies.js` | Decrypt Facebook cookies from Chromium profile → JSON |

### `scripts/startnovnc.sh`

Access: `http://<host>:6080/vnc.html` (VNC password required).

**noVNC stack on ARM (Orange Pi 5 / Armbian):**
- Use system `/usr/lib/chromium/chromium`, not Playwright's bundled Chromium (crashes on ARM).
- Required Chromium flags: `--no-sandbox --no-zygote --single-process --disable-dev-shm-usage --disable-gpu --disable-gpu-rasterization`.
- Use `x11vnc -noxdamage`.

### `scripts/extractcookies.js`

Reads `~/.config/chromium/Default/Cookies` (SQLite), decrypts AES-128-CBC cookies, outputs JSON array of `{ name, value, domain, path, httpOnly, secure }`.

Cookies expire in weeks — re-run after re-logging in via noVNC.

## Testing

Automated integration tests using Playwright. Every test exercises the **full MCP pipeline**: `test stdin (JSON-RPC) → MCP server → bridge.send() → HTTP relay :8765 → peer.js GET /job → dispatch → DOM → POST /result/:id → stdout`.

```bash
npm test
```

Tests auto-detect Facebook cookies from the local Chromium profile via `tests/cookies.js` (runs `scripts/extractcookies.js`). Log in to Facebook via noVNC first (server mode) to enable cookie-dependent tests.

**Test files:**
- `tests/mcpclient.js` — shared helper: spawns MCP server subprocess, handles JSON-RPC, `waitforpeer()` polls `/ready` endpoint.
- `tests/mcp.spec.js` — MCP protocol layer: `initialize`, `tools/list`, schema validation (no browser needed).
- `tests/extension.spec.js` — service worker starts correctly, extension peer connects to bridge relay.
- `tests/debug.spec.js` — `screenshot`, `getdom`, `getaxstree`, `ocr` tools end-to-end via MCP.
- `tests/facebook.spec.js` — `scan` tool: full MCP pipeline → real Facebook content script → pages list. Runs automatically if cookies available.
- `tests/post.spec.js` — `post` tool dry-run on AKAO page with 3 fixture images (`tests/fixtures/`). Skips if no cookies.
- `tests/cookies.js` — shared cookie auto-detection helper.

**Design principle:** no mocks — every test exercises real production code end-to-end, same mechanics as an AI agent.

**Manual verification:**
1. **Server**: `node src/server/index.js` — starts stdio MCP server + HTTP relay on `localhost:8765`.
2. **Inspector**: `npx @modelcontextprotocol/inspector node src/server/index.js` — lists all tools; calls require the extension running and connected.
3. **Extension**: load `src/browser/` (or `build/browser/`) as unpacked extension in Chrome.
