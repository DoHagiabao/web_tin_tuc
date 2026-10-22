/**
 * crawler.js — Crawler chạy trên trình duyệt
 * ---------------------------------------------------------------------------
 * Vấn đề: trình duyệt chặn đọc HTML của website khác (CORS).
 * Giải pháp: tải HTML qua "proxy", thử lần lượt:
 *   1. Proxy của server cục bộ  /api/fetch  (khi chạy  node tools/server.js)
 *   2. Các proxy CORS công cộng (dùng khi mở file trực tiếp)
 * Sau khi có HTML -> DOMParser -> NewsParser.parseArticle() (file parser.js).
 */
const Crawler = (() => {
  const PUBLIC_PROXIES = [
    (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
    (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
  ];

  async function fetchWithTimeout(url, ms = 15000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      if (html.length < 500) throw new Error('Nội dung trả về quá ngắn');
      return html;
    } finally {
      clearTimeout(t);
    }
  }

  /** Lấy HTML của 1 trang web bên ngoài. Trả về { html, via } */
  async function fetchHtml(url) {
    const tries = [];
    if (location.protocol.startsWith('http')) tries.push({ via: 'Proxy cục bộ', url: '/api/fetch?url=' + encodeURIComponent(url) });
    PUBLIC_PROXIES.forEach((f, i) => tries.push({ via: 'Proxy công cộng #' + (i + 1), url: f(url) }));

    const errors = [];
    for (const t of tries) {
      try {
        return { html: await fetchWithTimeout(t.url), via: t.via };
      } catch (e) {
        errors.push(`${t.via}: ${e.message}`);
      }
    }
    throw new Error('Không tải được trang.\n' + errors.join('\n'));
  }

  function validateUrl(url) {
    let u;
    try { u = new URL(url.trim()); } catch (e) { throw new Error('URL không hợp lệ'); }
    if (!/^https?:$/.test(u.protocol)) throw new Error('URL phải bắt đầu bằng http:// hoặc https://');
    return u.href;
  }

  const toDoc = (html) => new DOMParser().parseFromString(html, 'text/html');

  /**
   * ★ HÀM CHÍNH THEO ĐỀ BÀI ★
   * Nhận vào URL bài viết, trả về object JSON chuẩn hóa:
   * { id, title, slug, excerpt, content, author, category, publishedAt, source, url }
   * (kèm thêm categories, categoryIds, thumbnail để website hiển thị)
   */
  async function crawlArticle(url) {
    url = validateUrl(url);
    const { html, via } = await fetchHtml(url);
    const post = NewsParser.parseArticle(toDoc(html), url, Store.getMenu());
    if (!post.title) throw new Error('Không tìm thấy tiêu đề — có thể đây không phải trang bài viết.');
    post._via = via;
    return post;
  }

  /** Trích xuất từ HTML người dùng dán vào (phương án dự phòng khi mọi proxy đều lỗi) */
  function parseFromHtml(html, url) {
    url = validateUrl(url);
    return NewsParser.parseArticle(toDoc(html), url, Store.getMenu());
  }

  /**
   * Crawl nhiều bài của 1 chuyên mục và lưu vào LocalStorage
   * @param {object} cat  chuyên mục {id, title, url}
   * @param {number} limit số bài cần lấy
   * @param {function} onProgress (done, total, message)
   */
  async function crawlCategory(cat, limit = 10, onProgress = () => {}) {
    onProgress(0, limit, `Đang tải trang chuyên mục ${cat.title}...`);
    const urls = [];
    for (let page = 1; page <= 2 && urls.length < limit + 5; page++) {
      const pageUrl = page === 1 ? cat.url : cat.url.replace(/\.htm$/, `/trang-${page}.htm`);
      try {
        const { html } = await fetchHtml(pageUrl);
        NewsParser.parseCategoryList(toDoc(html), pageUrl).forEach((u) => { if (!urls.includes(u)) urls.push(u); });
      } catch (e) {
        if (page === 1) throw e;
      }
    }
    if (!urls.length) throw new Error('Không tìm thấy bài viết nào trong trang chuyên mục.');

    let ok = 0;
    for (const url of urls) {
      if (ok >= limit) break;
      try {
        const post = await crawlArticle(url);
        if (!NewsParser.isValidPost(post)) continue;
        delete post._via;
        post.categoryIds = Array.from(new Set([...(post.categoryIds || []), cat.id]));
        Store.savePost(post);
        ok++;
        onProgress(ok, limit, post.title);
      } catch (e) {
        onProgress(ok, limit, 'Bỏ qua 1 bài lỗi: ' + e.message.split('\n')[0]);
      }
    }
    return ok;
  }

  return { fetchHtml, crawlArticle, parseFromHtml, crawlCategory };
})();
