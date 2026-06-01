# Social MCP

Social MCP là một lớp abstraction cho phép AI agents thao tác mạng xã hội thông qua một bộ tools MCP đơn giản — không cần phân tích DOM.

Bao gồm hai thành phần:
- **Chrome Extension (MV3)**: kiến trúc plugin. Background + dashboard là khung dùng chung; mỗi platform là một plugin tự chứa.
- **Node MCP Server**: expose MCP tools cho AI agents. Transport giữa server và extension hiện chưa có — tạm thời chỉ dashboard điều khiển được plugin.

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
    │  ⚠️ transport chưa implement
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

Để phát triển plugin hoặc thêm tính năng cho plugin, xem **[docs/plugin-dev-guide.md](docs/plugin-dev-guide.md)** — tài liệu quy định bắt buộc về kiến trúc, naming, folder layout, và drift checklist.

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
    common/                          # tiện ích chung dùng lại nhiều nơi: sleep, filetourl
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
    bridge.js                        # placeholder — transport chưa implement
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
npm test                                                 # extension smoke tests
FACEBOOK_COOKIES=$(node scripts/extractcookies.js) npm test   # + real Facebook E2E
```

`extractcookies.js` reads from the local Chromium profile — log in to Facebook via `scripts/startnovnc.sh` first (server mode only). See `--server` install above.

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

Hiện tại không cần biến môi trường nào — transport giữa MCP server và extension chưa được implement.

> **Farm setup** (kế hoạch): mỗi browser profile chạy một extension riêng; mỗi MCP server instance dùng port khác nhau — sẽ được quy định khi transport được thêm.

## Thêm một platform mới

Xem chi tiết trong [docs/plugin-dev-guide.md](docs/plugin-dev-guide.md). Tóm tắt:

1. Tạo `src/browser/platform/<id>/` theo cấu trúc giống `facebook/`.
2. Thêm vào `src/browser/plugins.js`.
3. Thêm entry `content_scripts` + `host_permissions` vào `src/browser/manifest.json` (cho dev mode — prod build tự generate từ `hosts.js`).

`build.js` tự động scan thư mục `src/browser/platform/*/plugin.js` — không cần sửa build script.

Các id `x`, `instagram`, `threads` đã được khai báo sẵn trong schema MCP — chỉ cần thêm plugin tương ứng là dùng được.

> ⚠️ **Lưu ý:** transport giữa MCP server và extension hiện chưa được implement. Dashboard là cách duy nhất để invoke actions hiện nay.
