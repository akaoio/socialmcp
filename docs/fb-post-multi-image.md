# Facebook — Post nhiều ảnh + chữ vào form soạn bài

## Tổng quan flow

```
1. Mở dialog soạn bài
2. Click "Photo/video" trong dialog  → file input xuất hiện
3. setfiles()  → gán tất cả ảnh vào file input cùng lúc
4. Chờ FB xử lý ảnh (~4s)
5. Re-fetch dialog (FB render lại dialog sau khi chuyển sang album mode)
6. Gõ nội dung text
7. Click Post / Next → Post
```

**Tại sao phải ảnh trước, chữ sau?**  
Khi Facebook nhận nhiều ảnh, nó chuyển dialog sang "album mode" và re-render toàn bộ DOM bên trong, bao gồm cả `contenteditable`. Nếu gõ chữ trước rồi mới attach ảnh, text bị mất.

---

## Hàm cốt lõi: `setfiles(fileinput, urls)`

```js
async function setfiles(fileinput, urls) {
  // 1. Tạo một DataTransfer duy nhất chứa tất cả file
  const dt = new DataTransfer();
  for (const url of urls) {
    const res  = await fetch(url);           // url là data URL (base64) hoặc http URL
    const blob = await res.blob();
    const ext  = blob.type.split('/')[1] ?? 'jpg';
    dt.items.add(new File([blob], `upload.${ext}`, { type: blob.type }));
  }

  // 2. Bắt buộc phải set multiple = true
  //    Không có dòng này, browser chỉ nhận 1 file dù DataTransfer có nhiều file
  fileinput.multiple = true;

  // 3. Dùng native setter của HTMLInputElement.prototype thay vì gán trực tiếp
  //    React quản lý .files bằng Object.defineProperty — gán trực tiếp bị bỏ qua
  //    Native setter bypass được React và trigger synthetic event đúng cách
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
  if (setter) setter.call(fileinput, dt.files);
  else fileinput.files = dt.files;           // fallback cho trình duyệt không dùng React

  // 4. Dispatch cả 'change' lẫn 'input' với bubbles: true
  //    Facebook lắng nghe cả hai
  fileinput.dispatchEvent(new Event('change',     { bubbles: true }));
  fileinput.dispatchEvent(new InputEvent('input', { bubbles: true }));
}
```

### Tại sao DataTransfer thay vì gán từng file?

| Cách cũ (sequential) | Cách đúng (bulk DataTransfer) |
|---|---|
| Lặp qua từng file, mỗi file dispatch `change` riêng | Tạo 1 DataTransfer với tất cả file, dispatch 1 lần |
| Facebook chỉ nhận file cuối cùng | Facebook nhận tất cả file → album |
| Race condition: file sau ghi đè file trước | Atomic: tất cả hoặc không |

---

## Selector: file input

```js
// selectors.js
fileinput: 'input[type="file"][accept*="video/mp4"]'
```

Facebook dùng một `<input type="file" accept="...video/mp4...">` duy nhất cho cả ảnh lẫn video.  
Dùng `accept*="video/mp4"` (contains) thay vì `accept=` (exact) vì chuỗi accept có thể thay đổi thứ tự.

**Cách tìm file input trong code:**

```js
const fileinput = (
  [...dlg.querySelectorAll(S.fileinput)].pop() ??   // ưu tiên trong dialog
  [...document.querySelectorAll(S.fileinput)].pop()  // fallback toàn trang
);
```

Dùng `.pop()` (lấy phần tử cuối) vì Facebook đôi khi render nhiều input ẩn — cái cuối cùng là cái active.

---

## Mở dialog soạn bài

### Personal feed (`post.js`)

```js
// Tìm "What's on your mind?" trigger bằng cách dùng Photo/video làm anchor
async function findtrigger(timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const main = document.querySelector('[role="main"]');
    if (main) {
      // 1. Tìm button Photo/video — selector ổn định hơn text "What's on your mind?"
      const photobtn = [...main.querySelectorAll('[role="button"]')]
        .find(b => b.getAttribute('aria-label') === 'Photo/video');
      if (photobtn) {
        // 2. Walk up DOM để tìm composer box (không có aria-label, không có aria-haspopup)
        let el = photobtn.parentElement;
        for (let d = 1; d <= 10; d++) {
          if (!el) break;
          const btn = [...el.querySelectorAll('[role="button"]')].find(
            b => !b.getAttribute('aria-label') && !b.getAttribute('aria-haspopup') &&
                 b.textContent.trim().length > 0 && !b.querySelector('[role="button"]')
          );
          if (btn) return btn;
          el = el.parentElement;
        }
      }
    }
    await sleep(400);
  }
  throw new Error('Compose trigger not found');
}
```

### Pages (`postpage.js`)

Tương tự nhưng trước đó phải **switch identity** (xem mục dưới).  
Sau khi switch, trang page có `[role="main"]` với cùng Photo/video anchor → cùng `findtrigger()`.

---

## Dialog

```js
// Tìm dialog soạn bài: [role="dialog"] chứa contenteditable
function finddialog() {
  return [...document.querySelectorAll('[role="dialog"]')]
    .find(d => d.querySelector('[contenteditable="true"]')) ?? null;
}
```

Phải re-fetch dialog sau khi attach ảnh vì Facebook destroy và recreate DOM bên trong:

```js
// Sau setfiles() + sleep(4000):
dlg = null;
for (let i = 0; i < 15; i++) {
  dlg = finddialog();
  if (dlg) break;
  await sleep(400);
}
```

---

## Gõ text (contenteditable)

Facebook dùng `contenteditable` với React — không thể gán `.textContent` trực tiếp.

```js
// utils.js — type() cho contenteditable
if (el.isContentEditable) {
  document.execCommand('selectAll', false);
  document.execCommand('delete',     false);
  document.execCommand('insertText', false, text);
}
```

`postpage.js` dùng cách thay thế (di chuyển caret về cuối trước):

```js
box.focus();
const sel   = window.getSelection();
const range = document.createRange();
range.selectNodeContents(box);
range.collapse(false);          // collapse về cuối
sel?.removeAllRanges();
sel?.addRange(range);
document.execCommand('insertText', false, content);
```

---

## Flow đầy đủ — Personal feed

```
trigger.click()
  └─ sleep(1000)
  └─ dismisswa()                     // đóng popup WhatsApp nếu có
  └─ poll finddialog() x20
     └─ dlg found
        ├── [nếu có media]
        │     └─ click Photo/video trong dlg
        │     └─ sleep(1000)
        │     └─ tìm fileinput (trong dlg, fallback toàn trang)
        │     └─ setfiles(fileinput, media)
        │     └─ sleep(4000)          ← chờ FB upload preview
        │     └─ re-poll finddialog() x15
        │     └─ dismisswa()
        │
        └─ type(box, content)
        └─ sleep(400)
        └─ poll Post button x20 (aria-label="Post", aria-disabled≠"true")
        └─ postbtn.click()
        └─ sleep(2000)
```

## Flow đầy đủ — Facebook Page

```
[background.js đã navigate đến /pages/ → switchpage() → navigate đến page URL]

postpage()
  └─ sleep(2000)
  └─ dismisswa()
  └─ findtrigger(12000)
  └─ trigger.click()
  └─ sleep(1500)
  └─ poll finddialog() x20
     └─ dlg found
        ├── [nếu có media]
        │     └─ click Photo/video
        │     └─ sleep(1500)
        │     └─ tìm fileinput
        │     └─ setfiles(fileinput, files)
        │     └─ sleep(4000)
        │     └─ re-poll finddialog() x15
        │     └─ dismisswa()
        │
        └─ focus + insertText(content)
        └─ sleep(600)
        └─ dismisswa()
        └─ poll Next button x40 (aria-label="Next", không disabled)
        └─ Next.click()
        └─ sleep(2000)
        └─ poll Post button x25 (trên tất cả dialogs)
        └─ Post.click()
        └─ sleep(4000)
```

**Tại sao Pages có thêm bước Next?**  
Pages composer có 2 bước: bước 1 soạn nội dung → Next → bước 2 chọn audience/scheduling → Post.

---

## Switch identity (Pages)

Trước khi postpage, background.js làm 3 bước:

```js
// background.js
await navigate(tab.id, 'https://www.facebook.com/pages/?category=your_pages', 3500);
await sendmessage(tab.id, { action: 'switchpage', params: { page_url } });
await navigate(tab.id, params.page_url, 2500);
```

`switchpage()` tìm link của page trên trang `/pages/`, walk up DOM để tìm button **Switch Now** kế bên, click nó. Sau đó background navigate đến URL của page — lúc này FB đã ở identity của page, composer hoạt động đúng.

```js
export async function switchpage({ page_url } = {}) {
  await sleep(2000);
  const norm = new URL(page_url).pathname.replace(/\/$/, '').toLowerCase();
  const link = [...document.querySelectorAll('a[href]')].find(a => {
    try { return new URL(a.href).pathname.replace(/\/$/, '').toLowerCase() === norm; }
    catch { return false; }
  });
  if (!link) return { switched: false, reason: 'page link not found' };

  let el = link.parentElement;
  for (let d = 1; d <= 12; d++) {
    if (!el) break;
    const btns = [...el.querySelectorAll('[role="button"]')].filter(b => !b.contains(link));
    if (btns.length === 1) { btns[0].click(); return { switched: true }; }
    el = el.parentElement;
  }
  return { switched: false, reason: 'already active' };
}
```

---

## Troubleshooting

| Triệu chứng | Nguyên nhân | Fix |
|---|---|---|
| Chỉ 1 ảnh được upload dù truyền nhiều | Thiếu `fileinput.multiple = true` | Đã fix — dòng này phải đứng trước khi gán `.files` |
| Text biến mất sau khi attach ảnh | Gõ text trước khi attach | Luôn attach ảnh trước, gõ text sau |
| `fileinput` null | Selector sai hoặc chưa click Photo/video | Click `aria-label="Photo/video"` rồi sleep(1000-1500) trước khi query |
| Dialog không tìm thấy sau attach | FB re-render dialog | Re-poll `finddialog()` sau `sleep(4000)` |
| Post button không bật | Nội dung chưa được nhận | Dùng `execCommand('insertText')`, không dùng `.textContent =` |
| "Switch Now" không tìm thấy | Đang ở identity của page rồi | `switchpage()` trả `{ switched: false, reason: 'already active' }` — không phải lỗi |
