# Copilot Instructions — Social MCP

## Project Overview

Social MCP is a two-part system that lets AI agents (Claude, GPT, etc.) automate social media interactions without parsing DOM. It abstracts all platform-specific DOM work into clean MCP tool calls.

**Supported platforms:** `facebook` | `x` | `instagram` | `threads`

## Architecture

```
AI Agent (stdio/MCP)
    └── src/server/index.js       MCP server — defines 9 tools
            └── src/server/bridge.js   WebSocket server (ws://127.0.0.1:3456)
                    └── src/browser/background.js   Chrome MV3 service worker
                            └── src/browser/<platform>/content.js   DOM actions
```

## Key Conventions

### MCP Tools (`src/server/index.js`)
- All tools accept a `platform` param: `z.enum(['facebook', 'x', 'instagram', 'threads'])`
- Always call `bridge.send(platform, action, params)` and wrap the result in `reply()`
- New tools follow the same pattern as existing ones — define schema with zod, call bridge, return `reply()`

### Bridge (`src/server/bridge.js`)
- Manages WebSocket connections from browser extensions
- `send(platform, action, params, timeout)` — finds a connected extension that registered the platform, sends the command, waits for response
- Extensions register via `{ type: 'register', platforms: [...] }` on connect
- Default timeout is 30 000 ms

### Browser Extension

**`background.js`** — MV3 service worker:
- Maintains WebSocket connection to bridge with exponential backoff (1 s → 30 s max)
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

- Uses **esbuild**
- `npm run build:server` → `build/server/index.js` (Node ESM bundle)
- `npm run build:ext` → `build/browser/` (extension, content scripts bundled as **IIFE**)
- `NODE_ENV=production node build.js` enables minification and disables sourcemaps

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SOCIALMCP_PORT` | `3456` | WebSocket port for the bridge server |

## Selector Maintenance

Platform UI changes frequently. When a selector breaks:
1. Open the platform in Chrome DevTools
2. Find the new selector (prefer `aria-label`, `data-testid`, `role` over class names)
3. Update only the `S` object at the top of the relevant `content.js`
4. Test by calling the affected tool via MCP Inspector: `npx @modelcontextprotocol/inspector node src/server/index.js`

## Testing

No automated test suite. Manual verification order:

1. **Bridge**: `cd src/server && node index.js` — expect `[socialmcp] bridge on ws://127.0.0.1:3456`
2. **Extension**: Load `src/browser/` as unpacked extension → open Service Worker DevTools → confirm WebSocket connected; server terminal prints `ext#1 platforms: ...`
3. **Tools**: `npx @modelcontextprotocol/inspector node src/server/index.js` → call `scroll` with a platform that has an open tab
