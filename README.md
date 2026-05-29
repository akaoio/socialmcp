# Social MCP

Social MCP là một lớp abstraction cho phép AI agents thao tác mạng xã hội thông qua một bộ tools đơn giản, không cần phân tích DOM.

Bao gồm hai thành phần:
- **Browser Extension** (Chrome MV3): chạy content scripts trên từng platform, xử lý DOM trực tiếp.
- **NodeJS MCP Server**: expose MCP tools cho AI agents, giao tiếp với extension qua WebSocket.

## Vì sao cần Social MCP

Các giải pháp như Playwright MCP có điểm nghẽn là DOM rất lớn:
- Gây nhiễu ngữ cảnh, agents ngốn rất nhiều tokens chỉ để làm vài thao tác đơn giản
- Agents phải tự viết selector code trong lúc làm việc, rất mất thời gian
- Khó triển khai farm quy mô lớn

Social MCP giúp agents không cần phải giải DOM — chỉ cần gọi tools như `post`, `comment`, `react`... như một nhân viên thực thụ.

## Kiến trúc

```
AI Agent (Claude, GPT...)
    │  stdio / MCP protocol
    ▼
NodeJS MCP Server  (src/server/index.js)
    │  WebSocket  ws://127.0.0.1:3456
    ▼
Extension Background  (src/browser/background.js)
    │  chrome.tabs.sendMessage
    ▼
Content Script  (src/browser/<platform>/content.js)
    │  DOM API
    ▼
facebook.com / x.com / instagram.com / threads.net
```

## MCP Tools

| Tool | Mô tả |
|------|-------|
| `post` | Đăng bài mới |
| `comment` | Bình luận vào một bài |
| `react` | Like / react bài viết |
| `scroll` | Cuộn feed, lấy danh sách bài |
| `search` | Tìm kiếm bài viết / người dùng |
| `follow` | Follow một tài khoản |
| `unfollow` | Unfollow một tài khoản |
| `message` | Gửi tin nhắn riêng |
| `profile` | Lấy thông tin profile |

Tất cả tools đều nhận tham số `platform`: `facebook` | `x` | `instagram` | `threads`

## Cấu trúc thư mục

```
src/
  browser/
    manifest.json          # Chrome Extension MV3 manifest
    background.js          # Service worker: WebSocket client + tab routing
    popup.html             # Human UI: platform panels + action forms
    popup.css              # Human UI style (vanilla CSS)
    popup.js               # Human UI logic (manual dispatch)
    facebook/content.js    # Facebook DOM actions
    x/content.js           # X DOM actions
    instagram/content.js   # Instagram DOM actions
    threads/content.js     # Threads DOM actions
  server/
    index.js               # MCP server (stdio transport)
    bridge.js              # WebSocket server quản lý kết nối từ extension
    mcp.js                 # MCP JSON-RPC + schema builder (thay thế @modelcontextprotocol/sdk + zod)
build/                     # Bản build minified
```

## Cài đặt

### Phát triển (không cần build)
```bash
# Chạy server thẳng từ source (không cần npm install riêng cho server)
node src/server/index.js

# Load extension từ src/browser/ (Chrome → Load unpacked)
# Mở popup của extension để chạy tool thủ công theo từng platform
```

### Build production
```bash
npm install          # cài rollup + plugins (devDeps) và @akaoio/zen (runtime)
npm run build        # build cả server lẫn extension

npm run build:server # chỉ bundle server
npm run build:ext    # chỉ bundle extension
```

Output:
- `build/server/index.js` — Node bundle (zero external deps, self-contained), chạy bằng `npm start`
- `build/browser/` — Extension đã minify, đóng gói thành `.crx` từ thư mục này

### Đóng gói Extension (.crx)
```bash
# Sau khi build
# Chrome → chrome://extensions → Pack extension → chọn build/browser/
```

### Cấu hình MCP Client (Claude Desktop)
```json
{
  "mcpServers": {
    "socialmcp": {
      "command": "node",
      "args": ["/đường/dẫn/đến/src/server/index.js"]
    }
  }
}
```

## Biến môi trường

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `SOCIALMCP_PORT` | `3456` | WebSocket port cho bridge server |

> **Farm setup**: mỗi browser profile chạy một extension riêng, mỗi MCP server instance dùng port khác nhau.