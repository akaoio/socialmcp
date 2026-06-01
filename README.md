# Social MCP

Social MCP là một lớp abstraction cho phép AI agents thao tác mạng xã hội thông qua một bộ tools MCP đơn giản — không cần phân tích DOM.

Bao gồm hai thành phần:
- **Chrome Extension (MV3)**: kiến trúc plugin. Background là khung dùng chung; mỗi platform là một plugin tự chứa.
- **Node MCP Server**: expose MCP tools cho AI agents. Kết nối với extension qua HTTP long-poll relay (`bridge/bridge.js` ↔ `peer.js`) trên `localhost:8420`.

## Vì sao cần Social MCP

Các giải pháp như Playwright MCP có điểm nghẽn là DOM rất lớn:
- Gây nhiễu ngữ cảnh, agents ngốn rất nhiều tokens chỉ để làm vài thao tác đơn giản.
- Agents phải tự viết selector code trong lúc làm việc, rất mất thời gian.
- Khó triển khai farm quy mô lớn.

Social MCP giúp agents không cần giải DOM — chỉ cần gọi tools như `post`, `scan`… như một nhân viên thực thụ.

## Kiến trúc

```
AI Agent (Claude, GPT…)
    │  stdio · MCP protocol
    ▼
Node MCP Server  (src/server/index.js)
    │  HTTP long-poll relay  localhost:8420  (bridge/bridge.js ↔ peer.js)
    ▼
Extension Background  (src/browser/background/index.js)
    │  reads src/browser/plugins.js → dispatch by platform id
    ├─ src/browser/builtin/<action>/   platform-agnostic builtins
    ▼
Content Script  (src/browser/platform/<id>/content.js)
    │  DOM API
    ▼
facebook.com / x.com / instagram.com / threads.net
```

`src/browser/relay/` là trang extension tối giản (`relay.html` + `relay.js`) dùng bởi test automation để gửi dispatch messages vào background mà không cần UI.

## Plugin Architecture

`src/browser/{background,builtin,common}/` hoàn toàn không biết về platform nào cụ thể. Mọi code platform-specific nằm trong `src/browser/platform/<id>/`.

Để phát triển plugin hoặc thêm tính năng cho plugin, xem **[docs/plugin-dev-guide.md](docs/plugin-dev-guide.md)** — tài liệu quy định bắt buộc về kiến trúc, naming, folder layout, và drift checklist.

Cấu trúc một plugin:

```
src/browser/platform/<id>/
  plugin.js         ← default export: { id, label, hosts, background }
  hosts.js          ← URL substrings dùng để tìm tab
  content.js        ← content-script entry + HANDLERS map
  background/       ← one file per public action
  <feature>/        ← gom code DOM theo tính năng; mỗi feature có selectors.js riêng
```

Mỗi feature folder (`post/`, `scan/`, …) tự giữ `selectors.js` riêng. Không có file selectors gom chung.

Đăng ký plugin tại `src/browser/plugins.js`:

```js
import facebook from './platform/facebook/plugin.js';
export const plugins = [facebook];
```

## Naming Convention

Tên hàm và file luôn là một từ tiếng Anh viết thường, ký tự `[a-z]` (không camelCase, không gạch nối). File chứa hàm nào thì đặt theo tên hàm đó. **Mỗi feature là một folder; mỗi hàm là một file.**

## MCP Tools

| Tool | Mô tả |
|------|-------|
| `post` | Đăng bài mới lên một Page |
| `scan` | Lấy danh sách Pages đang quản lý |
| `screenshot` | Chụp màn hình tab hiện tại (PNG base64) |
| `getdom` | Lấy toàn bộ outerHTML của trang |
| `getaxstree` | Lấy cây ARIA compact (hữu ích để agent điều hướng) |
| `ocr` | Trích xuất text từ screenshot bằng Tesseract |

Tất cả đều nhận `platform`: `facebook` | `x` | `instagram` | `threads`. Hiện chỉ Facebook đã có plugin hoàn chỉnh.

## Cấu trúc thư mục

```
src/
  browser/
    manifest.json
    plugins.js                       # plugin registry
    common/                          # tiện ích chung: sleep
    background/                      # service-worker host (platform-agnostic)
      index.js, onmessage.js, dispatch.js
      findtab/                       # findtab.js + gettabs.js
      navigate.js, sendmessage.js, waitload.js, grouptab.js, peer.js
    builtin/                         # platform-agnostic action handlers
      screenshot/screenshot.js
      getdom/getdom.js
      getaxstree/getaxstree.js
    relay/                           # minimal test page
      relay.html, relay.js
    platform/
      facebook/
        plugin.js, hosts.js, content.js
        background/                  # post.js, scan.js
        post/                        # compose flow + selectors.js riêng
        scan/                        # quét danh sách Page + selectors.js riêng
  server/
    index.js                         # MCP server (stdio transport)
    bridge/                          # HTTP relay server (long-poll, localhost:8420)
      bridge.js, todataurl.js, resolvemedia.js
    schema.js, mcpserver.js, stdioservertransport.js
    launch.js, ocr.js
build/                               # output đã bundle/minify
```

## Cài đặt

### Phát triển (không cần build)

```bash
node src/server/index.js     # MCP server đọc thẳng từ src/
# Chrome → chrome://extensions → Load unpacked → chọn src/browser/
```

### Install

```bash
./install.sh           # npm install + Playwright Chromium (any Linux dev)
./install.sh --server  # above + noVNC stack + cookie tools (headless server)
```

### Build

```bash
npm run build                # build cả server lẫn extension
npm run build:server         # chỉ bundle server
npm run build:ext            # chỉ bundle extension
```

Output:
- `build/server/index.js` — Node bundle (self-contained), chạy bằng `npm start`.
- `build/browser/` — Extension đã minify; load unpacked hoặc pack `.crx` từ thư mục này.

### Test

```bash
npm test                                                       # extension smoke tests
FACEBOOK_COOKIES=$(node scripts/extractcookies.js) npm test   # + real Facebook E2E
```

`extractcookies.js` reads from the local Chromium profile — log in to Facebook via `scripts/startnovnc.sh` first (server mode only). See `--server` install above.

### Cấu hình MCP Client

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

| Biến | Mặc định | Mục đích |
|---|---|---|
| `SOCIALMCP_CHROMIUM` | tự detect | Đường dẫn Chromium binary cho auto-launch |

Auto-detect theo thứ tự: `/usr/lib/chromium/chromium` → `/usr/bin/chromium-browser` → `/usr/bin/google-chrome` → macOS Chrome.

Port relay (`8420`) được hardcode trong `bridge/bridge.js`.

> ⚠️ **Lưu ý:** MCP tool calls sẽ **timeout** nếu extension chưa được load và kết nối với relay (`localhost:8420`). MCP server tự động launch Chromium nếu không thấy extension kết nối trong 5 giây — cần có `build/browser/` (`npm run build:ext`) và Chromium được cài. Đặt `SOCIALMCP_CHROMIUM` nếu Chromium không tự detect được.
