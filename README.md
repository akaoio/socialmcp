# Social MCP

Social MCP là một lớp abstraction cho phép AI agents thao tác mạng xã hội thông qua một bộ tools MCP đơn giản — không cần phân tích DOM.

Bao gồm hai thành phần:
- **Chrome Extension (MV3)**: kiến trúc plugin. Background + dashboard là khung dùng chung; mỗi platform là một plugin tự chứa.
- **Node MCP Server**: expose MCP tools cho AI agents, giao tiếp với extension qua ZEN WebSocket.

## Vì sao cần Social MCP

Các giải pháp như Playwright MCP có điểm nghẽn là DOM rất lớn:
- Gây nhiễu ngữ cảnh, agents ngốn rất nhiều tokens chỉ để làm vài thao tác đơn giản.
- Agents phải tự viết selector code trong lúc làm việc, rất mất thời gian.
- Khó triển khai farm quy mô lớn.

Social MCP giúp agents không cần giải DOM — chỉ cần gọi tools như `post`, `comment`, `react`… như một nhân viên thực thụ.

## Kiến trúc

```
AI Agent (Claude, GPT…)
    │  stdio · MCP protocol
    ▼
Node MCP Server  (src/server/index.js)
    │  ZEN  ws://127.0.0.1:8420/zen
    ▼
Extension Background  (src/browser/background/index.js)
    │  reads src/browser/plugins.js → dispatch by platform id
    ▼
Content Script  (src/browser/platform/<id>/content.js)
    │  DOM API
    ▼
facebook.com / x.com / instagram.com / threads.net
```

Dashboard (`src/browser/dashboard/`) là một trang riêng của extension, dùng để chạy tay từng action — cũng đọc plugin registry và lazy-mount UI panel của từng plugin.

## Plugin Architecture

`src/browser/{background,dashboard,common}/` hoàn toàn không biết về platform nào cụ thể. Mọi code platform-specific nằm trong `src/browser/platform/<id>/`.

Cấu trúc một plugin:

```
src/browser/platform/<id>/
  plugin.js         ← default export: { id, label, hosts, css?, background?, dashboard? }
  hosts.js          ← URL substrings dùng để tìm tab
  content.js        ← content-script entry + HANDLERS map
  background/       ← (optional) override per-action cho background
  dashboard/        ← UI panel: mount.js, panel.{js,css}, state.js, các action handler
  <feature>/        ← gom code DOM theo tính năng; mỗi feature có selectors.js riêng
```

Mỗi feature folder (`post/`, `scan/`, …) tự giữ `selectors.js` riêng. Không có file selectors gom chung — tránh bloat khi nhiều tính năng được thêm.

Đăng ký plugin tại `src/browser/plugins.js`:

```js
import facebook from './platform/facebook/plugin.js';
export const plugins = [facebook];
```

## Naming Convention

Tên hàm và file luôn là một từ tiếng Anh viết thường, ký tự `[a-z]` (không camelCase, không gạch nối). File chứa hàm nào thì đặt theo tên hàm đó.

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

Tất cả đều nhận `platform`: `facebook` | `x` | `instagram` | `threads`. Hiện chỉ Facebook đã có plugin hoàn chỉnh.

## Cấu trúc thư mục

```
src/
  browser/
    manifest.json
    plugins.js                       # plugin registry
    common/                          # tiện ích chung: sleep, wait, type, press, filetourl
    background/                      # service-worker host (platform-agnostic)
      index.js, onmessage.js, opendashboard.js
      dispatch.js, findtab.js, navigate.js, sendmessage.js
    dashboard/                       # UI shell (platform-agnostic)
      index.html, index.css, index.js, init.js, dispatch.js
    platform/
      facebook/
        plugin.js, hosts.js, content.js
        background/dispatch.js
        dashboard/                   # UI panel của FB plugin
        post/                        # compose flow + selectors.js riêng
        scan/                        # quét danh sách Page + selectors.js riêng
  server/
    index.js                         # MCP server (stdio transport)
    bridge.js                        # ZEN relay server
    mcp.js                           # MCP JSON-RPC + schema builder
build/                               # output đã bundle/minify
```

## Cài đặt

### Phát triển (không cần build)

```bash
node src/server/index.js     # MCP server đọc thẳng từ src/
# Chrome → chrome://extensions → Load unpacked → chọn src/browser/
# Click icon extension để mở dashboard
```

### Build production

```bash
npm install                  # rollup + plugins + @akaoio/zen
npm run build                # build cả server lẫn extension
npm run build:server         # chỉ bundle server
npm run build:ext            # chỉ bundle extension
```

Output:
- `build/server/index.js` — Node bundle (self-contained), chạy bằng `npm start`.
- `build/browser/` — Extension đã minify; load unpacked hoặc pack `.crx` từ thư mục này.

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
| `SOCIALMCP_PORT` | `8420` | Port ZEN relay (`ws://127.0.0.1:PORT/zen`) |
| `SOCIALMCP_SECRET` | *(built-in default)* | Shared secret để derive keypair secp256k1 — đặt giá trị random mạnh ở môi trường thật |

> **Farm setup**: mỗi browser profile chạy một extension riêng; mỗi MCP server instance dùng port khác nhau.

## Thêm một platform mới

1. Tạo `src/browser/platform/<id>/` theo cấu trúc giống `facebook/`.
2. Thêm vào `src/browser/plugins.js`.
3. Thêm entry `content_scripts` vào `src/browser/manifest.json` khớp với `hosts`.
4. Thêm `<id>` vào mảng `PLATFORMS` trong `build.js`.
5. (Optional) bổ sung `host_permissions` trong manifest.

Các id `x`, `instagram`, `threads` đã được khai báo sẵn trong schema MCP — chỉ cần thêm plugin tương ứng là dùng được.
