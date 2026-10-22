# Tin Việt 24h — Bài tập lớn: Xây dựng website tin tức

Website tin tức dùng **HTML + CSS + JavaScript thuần**, lưu dữ liệu bằng **LocalStorage**, giao diện **responsive**, có **crawler** lấy bài từ dantri.com.vn.

---

## Thông tin sinh viên
- **Họ và tên:** Đỗ Hà Gia Bảo
- **Mã sinh viên:** 24104246
- **Lớp / Học phần:** Xây dựng ứng dụng web

## 1. Cách chạy

Yêu cầu: **Node.js ≥ 18** (chỉ để crawl dữ liệu và chạy proxy; bản thân website là HTML/JS thuần).

```bash
npm install          # cài linkedom (bộ đọc HTML cho Node)
npm run crawl        # crawl menu + 10 bài cho mỗi chuyên mục cấp 1  (~1–3 phút)
npm start            # mở http://localhost:3000
```

| Lệnh | Tác dụng |
|---|---|
| `npm run crawl` | 10 bài × mỗi chuyên mục cấp 1 → `data/menu.json`, `data/posts.json`, `data/seed.js` |
| `npm run crawl:all` | Crawl thêm chuyên mục con (cấp 2). Bài đã có sẵn chỉ được **gắn nhãn** mục con, không tải lại → nhanh, đỡ bị chặn |
| `node tools/crawl-dantri.js --only the-gioi,thoi-su --limit 15` | Chỉ crawl vài chuyên mục |
| `npm run fix-data` | Sửa excerpt bị lấy nhầm ngày giờ trong dữ liệu cũ, không cần crawl lại |

> **Lưu ý:** `data/posts.json` ban đầu đang **rỗng**. Bạn phải chạy `npm run crawl` trên máy mình một lần để có dữ liệu thật (môi trường lúc làm bài không truy cập được dantri.com.vn). Cây chuyên mục `data/menu.json` đã có sẵn, lấy từ menu thật của dantri.
>
> Cách khác: mở trang **Crawler** trên web → "Crawl hàng loạt theo chuyên mục" → chọn "Tất cả chuyên mục cấp 1" → dữ liệu được lưu thẳng vào LocalStorage.

Có thể mở thẳng `index.html` (không cần server) nhờ `data/seed.js`, nhưng khi đó trang Crawler phải dùng proxy công cộng (có thể chậm/lỗi). **Nên dùng `npm start`.**

---

## 2. Cấu trúc thư mục

```
web-tin-tuc/
├── index.html            Khung trang: header, navbar, <main id="app">, footer
├── css/style.css         Toàn bộ giao diện, mobile-first, 2 breakpoint 640px / 992px
├── js/
│   ├── parser.js         ★ Trích xuất dữ liệu từ HTML (dùng chung cho trình duyệt và Node)
│   ├── storage.js        Đọc/ghi LocalStorage (menu, bài viết)
│   ├── crawler.js        ★ crawlArticle(url) — hàm JS theo đề bài, chạy trên trình duyệt
│   └── app.js            Router (#hash) + hiển thị các trang + navbar + footer
├── data/
│   ├── menu.json         Cây chuyên mục (JSON)
│   ├── posts.json        Bài viết đã crawl (JSON)
│   └── seed.js           Bản sao 2 file trên dạng <script> để mở file:// vẫn chạy
└── tools/
    ├── crawl-dantri.js   Script Node: crawl menu + ≥10 bài / chuyên mục
    ├── fix-data.js       Sửa dữ liệu đã crawl (excerpt lỗi) mà không crawl lại
    └── server.js         Web server + proxy /api/fetch (vượt CORS cho trang Crawler)
```

---

## 3. Đối chiếu với yêu cầu đề bài

| Yêu cầu | Làm ở đâu |
|---|---|
| Thu thập cây chuyên mục → JSON `{ menu: [...] }` (id, title, url, type, children) | `parseMenu()` trong `js/parser.js`; kết quả `data/menu.json` |
| Mỗi chuyên mục ≥ 10 bài, đủ các trường id, title, slug, excerpt, content, author, category, publishedAt, source | `tools/crawl-dantri.js` + `parseArticle()` |
| Hàm JS nhận URL → trả object JSON chuẩn hoá | `Crawler.crawlArticle(url)` trong `js/crawler.js` |
| Navbar hiện chuyên mục, load từ LocalStorage/JSON; click → danh sách bài | `renderNav()` trong `app.js` (có dropdown chuyên mục con, nút "⋯" khi tràn, drawer trên mobile) |
| 3 bài mới nhất: 1 lớn trái + 2 nhỏ phải | `topSection()` + CSS `.top-section` |
| Bài còn lại dạng list dọc, mới → cũ | `listItem()` + `Store.getPosts()` sắp xếp theo `publishedAt` giảm dần |
| Responsive: mobile/tablet bài nổi bật trên cùng, còn lại 1 cột | CSS mobile-first, `@media (min-width: 992px)` mới chuyển sang 2 cột |
| Trang chi tiết: tiêu đề, ảnh, nội dung, tác giả, thời gian, chuyên mục | `renderPost()` |
| Footer: tên + mô tả, liên kết nhanh, chuyên mục, liên hệ, mạng xã hội, copyright; nhiều cột → xếp dọc trên mobile | `renderFooter()` + CSS `.footer-grid` |
| Trang Crawler: nhập URL → lấy → trích xuất → lưu JSON vào LocalStorage | `renderCrawler()` (tab Xem trước / JSON, crawl hàng loạt, xuất/nhập JSON, xoá bài) |

---

## 4. Giải thích các ý chính (để hiểu và trả lời vấn đáp)

### 4.1. Website một trang (SPA) bằng `location.hash`
Chỉ có 1 file `index.html`. Khi URL đổi (`#/category/the-gioi`, `#/post/dtri-...`), sự kiện `hashchange` gọi hàm `route()` → chọn hàm `renderXxx()` phù hợp và gán `innerHTML` cho `<main id="app">`. Không cần tải lại trang.

### 4.2. LocalStorage
LocalStorage chỉ lưu **chuỗi**, nên phải `JSON.stringify` khi ghi và `JSON.parse` khi đọc (`storage.js`). Có 2 khoá: `tt_menu`, `tt_posts`. Giới hạn ~5MB/website — vì thế mặc định chỉ crawl chuyên mục cấp 1.

Lần đầu mở web: chưa có gì trong LocalStorage → nạp từ `data/seed.js` hoặc `data/menu.json`, `data/posts.json` → ghi vào LocalStorage. Từ đó trở đi website đọc từ LocalStorage.

### 4.3. Crawler trích xuất dữ liệu thế nào? (`parser.js`)
HTML được biến thành cây DOM (`DOMParser`), rồi dùng `querySelector` như khi thao tác DOM bình thường. Mỗi trường có **nhiều phương án dự phòng**, để nếu dantri đổi giao diện vẫn lấy được:

| Trường | Cách lấy |
|---|---|
| `id` | Số ở cuối URL: `...-20260928122246655.htm` → `dtri-20260928122246655` |
| `slug` | Phần chữ trước mã số trong URL |
| `title` | `h1.title-page` → `h1` → JSON-LD `headline` → `<meta og:title>` |
| `excerpt` | `.singular-sapo` → `<meta og:description>`; **bỏ qua ứng viên trông giống ngày giờ** hoặc quá ngắn; bỏ tiền tố "(Dân trí) - " |
| `content` | Các thẻ `p, h2, h3` trong `.singular-content`, **bỏ** chú thích ảnh, tin liên quan… |
| `author` | `.author-name` → JSON-LD `author` → `<meta name="author">` |
| `publishedAt` | 12 chữ số đầu của mã bài là thời gian: `202609281222` → `2026-09-28 12:22` |
| `category` | Đoạn đầu đường dẫn (`bat-dong-san`) tra trong menu → "Bất động sản" |
| `source` | Tên miền: `dantri.com.vn` |

Danh sách bài của một chuyên mục (`parseCategoryList`): lấy mọi thẻ `<a>` có link kết thúc bằng `-<dãy số>.htm` và cùng chuyên mục. Nếu trang 1 không đủ, sang `/trang-2.htm`.

### 4.4. Vì sao cần proxy (CORS)?
Trình duyệt **không cho** JavaScript trên `localhost` đọc HTML của `dantri.com.vn` (chính sách cùng nguồn — Same-Origin Policy / CORS). Nên `crawler.js` gọi `/api/fetch?url=...` của `tools/server.js`; server Node không bị CORS nên tải hộ được. Nếu không có server, thử các proxy công cộng; nếu tất cả đều lỗi, người dùng có thể **dán mã nguồn HTML** (Ctrl+U) vào ô dự phòng.

### 4.5. Responsive (mobile-first)
CSS viết cho màn hình nhỏ trước (1 cột), sau đó `@media (min-width: 640px)` cho tablet và `@media (min-width: 992px)` cho desktop (layout 1–2, navbar ngang + dropdown, footer 4 cột). Dùng **CSS Grid** cho bố cục và `aspect-ratio` để ảnh không bị méo.

### 4.6. Về định dạng dữ liệu
- Đề bài có chỗ ghi `post.category` là *array*, chỗ khác là *string*. Bài làm trả về `category` là **string** (đúng mẫu JSON của hàm), đồng thời lưu thêm `categories` là **array** (đúng bảng mô tả).
- `author` để dạng string giống dữ liệu mẫu ("Văn Hưng").
- Có thêm `thumbnail` (ảnh đại diện) và `categoryIds` để website hiển thị ảnh và lọc theo chuyên mục.
- id chuyên mục con dạng `the-thao/hau-truong` (theo đường dẫn) vì dantri có chuyên mục con trùng tên ("Hậu trường" ở cả Thể thao và Giải trí).

### 4.7. Chuyên mục con
URL bài trên dantri chỉ chứa chuyên mục cấp 1 (`/the-gioi/ten-bai-123.htm`), nên bài lấy từ trang "Thế giới" không biết thuộc "Quân sự" hay "Kiều bào".
- `npm run crawl:all` đọc trang danh sách của từng chuyên mục con: bài nào đã có thì gắn thêm id mục con, bài nào chưa có thì tải về.
- Nếu một chuyên mục con chưa có bài riêng, website hiển thị bài mới nhất của chuyên mục cha **kèm thông báo rõ ràng** và nút "Crawl 10 bài" cho riêng mục đó.

### 4.8. Tránh bị chặn khi crawl
Gửi quá nhiều request trong thời gian ngắn sẽ bị dantri tạm chặn IP (trình duyệt báo `ERR_CONNECTION_TIMED_OUT`). Script vì vậy chỉ chạy 2 request song song, nghỉ 1 giây giữa các đợt, tự dừng sau 3 chuyên mục lỗi liên tiếp, và ghi file sau mỗi chuyên mục để chạy lại thì làm tiếp từ chỗ dừng.

---

## 5. Gợi ý câu hỏi vấn đáp
1. *LocalStorage khác SessionStorage và Cookie thế nào?* — LocalStorage tồn tại vĩnh viễn đến khi xoá, ~5MB, không gửi lên server; SessionStorage mất khi đóng tab; Cookie nhỏ (~4KB) và được gửi kèm mọi request.
2. *Tại sao không fetch trực tiếp dantri từ trình duyệt?* — Bị chặn bởi CORS (xem 4.4).
3. *Sắp xếp mới → cũ làm thế nào?* — `publishedAt` dạng `YYYY-MM-DD HH:mm` nên so sánh chuỗi (`localeCompare`) cũng đúng thứ tự thời gian.
4. *Chống XSS khi hiển thị dữ liệu crawl?* — Mọi chuỗi đều qua hàm `esc()` (đổi `<`, `>`, `&`, `"` thành ký tự an toàn) trước khi gán `innerHTML`.

---
Dữ liệu bài viết thuộc bản quyền Báo Dân trí, chỉ dùng cho mục đích học tập.
