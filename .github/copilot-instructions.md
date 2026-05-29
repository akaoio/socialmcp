# Copilot Instructions — Social MCP

## Documentation Rules (ALWAYS follow)

- **Keep this file up to date** whenever the codebase changes — architecture, dependencies, build system, conventions.
- **Update `README.md`** to stay in sync with actual setup and usage steps.
- **Write a diary entry** at `docs/diary/YYYYMMDDHHmm.md` for every session that makes meaningful changes. Record what was changed, why, and any tradeoffs. This preserves context across sessions.

## Project Overview

Social MCP is a two-part system that lets AI agents (Claude, GPT, etc.) automate social media interactions without parsing DOM. It abstracts all platform-specific DOM work into clean MCP tool calls.

**Supported platforms:** `facebook` | `x` | `instagram` | `threads`

## Architecture

```
AI Agent (stdio/MCP)
    └── src/server/index.js       MCP server — defines 9 tools
            └── src/server/bridge.js   ZEN relay (ws://127.0.0.1:8420/zen)
                    └── src/browser/background.js   Chrome MV3 service worker (ZEN peer)
                            └── src/browser/<platform>/content.js   DOM actions
```

## Key Conventions

### MCP Tools (`src/server/index.js`)
- All tools accept a `platform` param: `z.enum(['facebook', 'x', 'instagram', 'threads'])`
- `z` is imported from `./mcp.js` (local implementation — no zod dependency)
- Always call `bridge.send(platform, action, params)` and wrap the result in `reply()`
- New tools follow the same pattern as existing ones — define schema with `z`, call bridge, return `reply()`

### Server — Zero External Runtime Dependencies
The server uses **only Node.js built-ins** plus `@akaoio/zen` for WebSocket:

| File | Purpose | Replaces |
|------|---------|---------|
| `src/server/mcp.js` | MCP JSON-RPC server + schema builder (zod-compatible API) | `@modelcontextprotocol/sdk` + `zod` |
| `src/server/bridge.js` | ZEN relay — `new ZEN({ web: httpServer })` accepts peer connections | `ws` npm package |

There is **no** `src/server/package.json`. All deps live in the root `package.json`.

### Bridge (`src/server/bridge.js`)
- Runs a ZEN relay: `new ZEN({ web: httpServer, file: false, axe: false })`
- `send(platform, action, params, timeout)` — writes command to `socialmcp/cmd/<id>` in the ZEN graph, waits for response on `socialmcp/res/<id>`
- Commands are JSON strings: `{ platform, action, params, ts }`
- Responses are JSON strings: `{ ok: result }` or `{ err: message }`
- Default timeout is 30 000 ms

### Browser Extension

**`background.js`** — MV3 service worker:
- Connects to the ZEN relay as a peer: `new ZEN({ peers: ["ws://127.0.0.1:8420/zen"], axe: false })`
- Listens for commands via `zen.get('socialmcp').get('cmd').map().on(...)` — dispatches to content scripts
- Replies via `zen.get('socialmcp').get('res').get(id).put(JSON.stringify({ ok/err }))`
- `findtab(platform)` — finds first matching open tab by hostname
- `dispatch(platform, action, params)` — navigates tab if `post_url` or `user` is a full URL, then forwards to content script via `chrome.tabs.sendMessage`
- Keep-alive via `chrome.alarms` every 0.5 minutes (MV3 limitation workaround)

**`<platform>/content.js`** — one file per platform:
- All CSS selectors are in a single `const S = { ... }` object at the top of the file — **update selectors here only**
- Utility functions `wait(selector, timeout)`, `sleep(ms)`, `type(el, text)`, `press(el, key)` are duplicated across platform files intentionally (content scripts are isolated)
- `type()` uses `execCommand('insertText')` for `contenteditable` elements (React-compatible) and native value setter + dispatched events for regular inputs
- Each handler is `async function <action>(params) { ... }` returning a plain object
- Bottom of file: `const HANDLERS = { post, comment, ... }` + `chrome.runtime.onMessage.addListener(...)` router — **always register new handlers here**

## Adding a New Platform

1. Create `src/browser/<platform>/content.js` — copy structure from an existing platform, update selectors and handlers
2. Add the hostname to `PLATFORM_HOSTS` in `background.js`
3. Add a new `content_scripts` entry in `manifest.json`
4. Add the platform to `z.enum([...])` in `src/server/index.js`
5. Add the platform to `PLATFORMS` array in `build.js`

## Adding a New Tool

1. Add a handler `async function <action>(params)` in each platform's `content.js`
2. Register it in the `HANDLERS` object in each content script
3. Add the tool in `src/server/index.js` using `mcp.tool(name, description, schema, handler)`

## Build System (`build.js`)

- Uses **rollup** + **@rollup/plugin-terser** (replaces esbuild)
- `npm run build:server` → `build/server/index.js` (Node ESM bundle — only `node:*` built-ins are external; `@akaoio/zen` is bundled in)
- `npm run build:ext` → `build/browser/` (extension — background bundled as ESM, content scripts bundled as IIFE)
- `NODE_ENV=production node build.js` enables minification via terser
- **`zenServiceStub` plugin**: stubs out zen.js's dynamic `import("./service.js")` (broken relative path in the zen package) and sets `inlineDynamicImports: true`

### Dependencies (root `package.json`)
- **Runtime**: `@akaoio/zen` (WebSocket server implementation)
- **Dev**: `rollup`, `@rollup/plugin-node-resolve`, `@rollup/plugin-json`, `@rollup/plugin-terser`

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SOCIALMCP_PORT` | `8420` | ZEN relay port (ws://127.0.0.1:PORT/zen) |

## Selector Maintenance

Platform UI changes frequently. When a selector breaks:
1. Open the platform in Chrome DevTools
2. Find the new selector (prefer `aria-label`, `data-testid`, `role` over class names)
3. Update only the `S` object at the top of the relevant `content.js`
4. Test by running the server: `node src/server/index.js`

## Testing

No automated test suite. Manual verification order:

1. **Bridge**: `node src/server/index.js` — expect `[socialmcp] zen relay on ws://127.0.0.1:8420/zen`
2. **Extension**: Load `src/browser/` as unpacked extension → open Service Worker DevTools → confirm ZEN peer connected
3. **Tools**: `npx @modelcontextprotocol/inspector node src/server/index.js` → call `scroll` with a platform that has an open tab
