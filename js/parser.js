/**
 * parser.js — Bộ trích xuất dữ liệu tin tức (dùng chung cho trình duyệt và Node.js)
 * ---------------------------------------------------------------------------
 * Không gọi mạng ở đây. Mọi hàm nhận vào một đối tượng `Document` (DOM) đã có sẵn:
 *   - Trên trình duyệt: new DOMParser().parseFromString(html, 'text/html')
 *   - Trên Node.js   : dùng thư viện linkedom (xem tools/crawl-dantri.js)
 *
 * Các hàm chính:
 *   parseMenu(doc, baseUrl)                 -> mảng chuyên mục dạng cây
 *   parseCategoryList(doc, categoryUrl)     -> mảng URL bài viết trong trang chuyên mục
 *   parseArticle(doc, url, menu)            -> object bài viết đã chuẩn hóa
 *
 * Chiến lược trích xuất "nhiều lớp dự phòng" (fallback) để chịu được việc
 * website đổi giao diện:  CSS selector  ->  JSON-LD  ->  thẻ <meta>  ->  suy ra từ URL.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NewsParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Bài viết dantri luôn kết thúc bằng "-<17+ chữ số>.htm", 17 số đầu là thời gian đăng:
  // 20260928122246655 = 2026-09-28 12:22:46.655
  const ARTICLE_ID_RE = /-(\d{14,20})\.html?$/;

  /* ------------------------------ Tiện ích ------------------------------ */

  const clean = (s) => (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const text = (el) => (el ? clean(el.textContent) : '');

  function first(doc, selectors) {
    for (const sel of selectors) {
      try {
        const el = doc.querySelector(sel);
        if (el && text(el)) return el;
      } catch (e) { /* selector không hợp lệ ở môi trường cũ -> bỏ qua */ }
    }
    return null;
  }

  function meta(doc, names) {
    for (const n of names) {
      const el = doc.querySelector(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`);
      const v = el && el.getAttribute('content');
      if (v && v.trim()) return v.trim();
    }
    return '';
  }

  function absUrl(href, base) {
    try { return new URL(href, base).href; } catch (e) { return ''; }
  }

  /** Đọc toàn bộ JSON-LD trong trang, trả về object kiểu NewsArticle/Article (nếu có) */
  function readJsonLd(doc) {
    const out = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        const data = JSON.parse(s.textContent);
        const items = Array.isArray(data) ? data : data['@graph'] || [data];
        items.forEach((it) => out.push(it));
      } catch (e) { /* JSON lỗi -> bỏ qua */ }
    });
    return out.find((it) => /Article/i.test([].concat(it['@type'] || '').join(' '))) || {};
  }

  const pad = (n) => String(n).padStart(2, '0');

  /** Chuẩn hóa thời gian về dạng "YYYY-MM-DD HH:mm" */
  function formatDate(input) {
    if (!input) return '';
    // "28/09/2026 - 12:27" hoặc "Thứ hai, 28/09/2026 - 12:27"
    const vn = String(input).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\D+(\d{1,2}):(\d{2})/);
    if (vn) return `${vn[3]}-${pad(vn[2])}-${pad(vn[1])} ${pad(vn[4])}:${vn[5]}`;
    // "2026-09-28 12:22" / ISO "2026-09-28T12:22:00+07:00"
    const iso = String(input).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]} ${iso[4]}:${iso[5]}`;
    const d = new Date(input);
    if (!isNaN(d)) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return '';
  }

  /** Suy ra thời gian đăng từ mã số bài viết (20260928122246655 -> 2026-09-28 12:22) */
  function dateFromId(digits) {
    const m = digits && digits.match(/^(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (!m) return '';
    const [, y, mo, d, h, mi] = m;
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59) return '';
    return `${y}-${mo}-${d} ${h}:${mi}`;
  }

  /** Hash đơn giản để tạo id khi URL không có số (dùng cho website khác) */
  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function sourcePrefix(host) {
    if (/dantri/.test(host)) return 'dtri';
    return host.replace(/^www\./, '').split('.')[0].slice(0, 6);
  }

  /** Tìm chuyên mục trong menu theo id (đệ quy vào children) */
  function findCategory(menu, id) {
    for (const c of menu || []) {
      if (c.id === id) return c;
      const child = findCategory(c.children, id);
      if (child) return child;
    }
    return null;
  }

  /* ------------------------- 1. Cây chuyên mục ------------------------- */

  /**
   * Thu thập menu chuyên mục từ trang chủ.
   * Ý tưởng: chuyên mục cấp 1 có URL dạng "/ten-chuyen-muc.htm",
   * chuyên mục cấp 2 có URL dạng "/cha/con.htm". Gom con vào cha theo đường dẫn.
   */
  function parseMenu(doc, baseUrl) {
    baseUrl = baseUrl || 'https://dantri.com.vn/';
    const host = new URL(baseUrl).host;

    // Tìm vùng chứa menu: tổ tiên của link "/the-gioi.htm" có nhiều link chuyên mục nhất.
    const isCatLink = (a) => {
      const u = absUrl(a.getAttribute('href'), baseUrl);
      if (!u) return false;
      const url = new URL(u);
      return url.host === host && /^\/[a-z0-9-]+(\/[a-z0-9-]+)?\.htm$/.test(url.pathname) && !ARTICLE_ID_RE.test(url.pathname);
    };
    let scope = doc;
    const anchor = Array.from(doc.querySelectorAll('header a, nav a, a')).find((a) => /\/the-gioi\.htm$/.test(a.getAttribute('href') || ''));
    if (anchor) {
      let el = anchor.parentElement;
      while (el && el.parentElement) {
        const n = Array.from(el.querySelectorAll('a')).filter(isCatLink).length;
        if (n >= 30) { scope = el; break; }
        el = el.parentElement;
      }
    }

    const menu = [
      { id: 'home', title: 'Home', url: baseUrl, type: 'home' },
    ];
    const byId = {};
    const children = [];

    scope.querySelectorAll('a').forEach((a) => {
      if (!isCatLink(a)) return;
      const url = absUrl(a.getAttribute('href'), baseUrl);
      const path = new URL(url).pathname.replace(/^\//, '').replace(/\.htm$/, '');
      const title = clean(a.getAttribute('title') || a.textContent);
      if (!title || byId[path]) return;
      if (path.includes('/')) {
        children.push({ id: path, title, url, parent: path.split('/')[0] });
        byId[path] = true;
        return;
      }
      let type = 'category';
      if (path === 'dt360') type = 'external';
      const id = path === 'tin-moi-nhat' ? 'latest' : path;
      const item = { id, title, url, type };
      byId[path] = item;
      menu.push(item);
    });

    children.forEach((c) => {
      const parent = byId[c.parent];
      if (parent && typeof parent === 'object') {
        (parent.children = parent.children || []).push({ id: c.id, title: c.title, url: c.url, type: 'category' });
      }
    });
    return menu;
  }

  /* ---------------------- 2. Danh sách bài trong chuyên mục ---------------------- */

  /**
   * Lấy URL các bài viết trong trang chuyên mục, giữ nguyên thứ tự xuất hiện.
   * Chỉ giữ bài có cùng chuyên mục cấp 1 với trang (trừ trang "tin-moi-nhat").
   */
  function parseCategoryList(doc, categoryUrl) {
    const base = new URL(categoryUrl);
    const topSeg = base.pathname.replace(/^\//, '').split('/')[0].replace(/\.htm$/, '');
    const anySection = topSeg === 'tin-moi-nhat' || topSeg === '';
    const seen = new Set();
    const urls = [];
    doc.querySelectorAll('a[href]').forEach((a) => {
      const u = absUrl(a.getAttribute('href'), categoryUrl);
      if (!u) return;
      const url = new URL(u);
      if (url.host !== base.host || !ARTICLE_ID_RE.test(url.pathname)) return;
      const seg = url.pathname.replace(/^\//, '').split('/')[0];
      if (!anySection && seg !== topSeg) return;
      const clean = url.origin + url.pathname;
      if (!seen.has(clean)) { seen.add(clean); urls.push(clean); }
    });
    return urls;
  }

  /* -------------------------- 3. Chi tiết bài viết -------------------------- */

  const SEL = {
    title: ['h1.title-page', 'h1.e-magazine__title', 'h1.dt-news__title', 'article h1', 'h1'],
    sapo: ['.singular-sapo', 'h2.singular-sapo', '.dt-news__sapo', '.e-magazine__sapo', 'h2.sapo', '.sapo', 'p.description', '[class*="sapo"]'],
    content: ['.singular-content', '.dt-news__content', '.e-magazine__body', '.fck_detail', 'article .content', '[class*="singular-content"]', '[itemprop="articleBody"]', 'article'],
    author: ['.author-name', '.dt-news__author', '.e-magazine__meta .author', '.author-wrap b', 'p.author', '[class*="author-name"]', '[rel="author"]', '.author'],
    time: ['time.author-time', '.author-time', '.dt-news__time', 'time[datetime]', 'span.date', '[class*="time"]'],
    breadcrumb: ['.breadcrumbs a', '.breadcrumb a', '.dt-breadcrumb a', 'ul.breadcrumb li a'],
  };

  // Chuỗi trông giống ngày giờ: "Thứ ba, 20/10/2026 - 21:13", "20/10/2026 21:13", "2026-10-20 21:13"
  const DATE_LIKE = /^((Thứ\s+\S+|Chủ nhật),?\s*)?\d{1,2}\/\d{1,2}\/\d{4}|^\d{4}-\d{2}-\d{2}/i;

  const stripSapo = (s) => clean(s)
    .replace(/^((Thứ\s+\S+|Chủ nhật),?\s*)?\d{1,2}\/\d{1,2}\/\d{4}\s*[-–]?\s*\d{1,2}:\d{2}\s*/i, '') // ngày giờ dính ở đầu
    .replace(/^\((Dân trí|Dantri)\)\s*[-–—:]\s*/i, '');

  /** Một chuỗi có phải sapo hợp lệ không: đủ dài và không phải ngày giờ / tên tác giả */
  const isGoodSapo = (s) => s.length >= 40 && !DATE_LIKE.test(s);

  /**
   * Chọn tóm tắt: thử lần lượt các selector, BỎ QUA ứng viên trông giống ngày giờ hoặc quá ngắn
   * (dantri có khối thời gian mang class chứa chữ "sapo" -> từng bị lấy nhầm), rồi mới dùng thẻ meta.
   */
  function pickExcerpt(doc, ld) {
    for (const sel of SEL.sapo) {
      let els = [];
      try { els = Array.from(doc.querySelectorAll(sel)); } catch (e) { continue; }
      for (const el of els) {
        const raw = text(el);
        const s = stripSapo(raw);
        if (isGoodSapo(raw) || (isGoodSapo(s) && s !== raw)) return s;
      }
    }
    const candidates = [clean(ld.description), meta(doc, ['og:description', 'description', 'twitter:description'])];
    for (const c of candidates) { const s = stripSapo(c); if (isGoodSapo(s)) return s; }
    return stripSapo(candidates.find(Boolean) || '');
  }

  // Các vùng KHÔNG phải nội dung chính (tin liên quan, quảng cáo, chú thích ảnh...)
  const NOISE = 'figure, figcaption, aside, script, style, noscript, iframe, .article-related, .dt-news__related, .related, .ads, .advertisement, .author-wrap, .singular-sapo, .table-of-content, [class*="related"], [class*="banner"]';

  // Dòng rác thường gặp trong thân bài: tin liên quan, quảng cáo, nguồn ảnh, kêu gọi chia sẻ...
  const JUNK = /^(>>|Xem thêm|Tin liên quan|Đọc thêm|Bài liên quan|Video:?$|Ảnh:\s|Nguồn ảnh|Quảng cáo|Chia sẻ|Bình luận|Theo dõi Dân trí|Advertisement)/i;

  function extractContent(doc) {
    const box = first(doc, SEL.content);
    if (!box) return { text: '', image: '' };
    const blocks = [];
    let image = '';
    box.querySelectorAll('p, h2, h3, h4, li, img').forEach((el) => {
      if (el.closest && el.closest(NOISE) && el.tagName !== 'IMG') return;
      if (el.tagName === 'IMG') {
        if (!image) image = el.getAttribute('data-src') || el.getAttribute('data-original') || el.getAttribute('src') || '';
        return;
      }
      if (el.tagName === 'LI' && el.querySelector('p')) return; // tránh lặp chữ
      const t = text(el);
      if (!t || t.length <= 1 || JUNK.test(t)) return;
      if (blocks[blocks.length - 1] !== t) blocks.push(t);
    });
    return { text: blocks.join('\n\n'), image };
  }

  /**
   * Hàm trích xuất chính: trả về object JSON chuẩn hóa của một bài viết.
   * @param {Document} doc  DOM của trang bài viết
   * @param {string}   url  URL bài viết
   * @param {Array}    menu (tuỳ chọn) cây chuyên mục để tra tên chuyên mục
   */
  function parseArticle(doc, url, menu) {
    const u = new URL(url);
    const host = u.host.replace(/^www\./, '');
    const ld = readJsonLd(doc);
    const segs = u.pathname.replace(/^\//, '').split('/');
    const file = segs[segs.length - 1];
    const idMatch = file.match(ARTICLE_ID_RE) || u.pathname.match(/(\d{6,})/);
    const digits = idMatch ? idMatch[1] : '';

    // --- id & slug
    const id = `${sourcePrefix(host)}-${digits || hash(u.pathname)}`;
    const slug = file.replace(ARTICLE_ID_RE, '').replace(/\.html?$/, '').replace(/-\d+$/, '');

    // --- tiêu đề
    let title = text(first(doc, SEL.title)) || clean(ld.headline) || meta(doc, ['og:title', 'twitter:title']);
    title = title.replace(/\s*[|–-]\s*(Báo )?(Dân ?trí|Báo điện tử.*)$/i, '');

    // --- tóm tắt (sapo): bỏ tiền tố "(Dân trí) - "
    const excerpt = pickExcerpt(doc, ld);

    // --- nội dung
    const body = extractContent(doc);
    const content = body.text || clean(ld.articleBody) || excerpt;

    // --- tác giả
    let author = text(first(doc, SEL.author));
    if (!author && ld.author) author = clean([].concat(ld.author)[0].name || [].concat(ld.author)[0]);
    if (!author) author = meta(doc, ['author', 'article:author', 'dable:author']);
    author = author.replace(/^(Tác giả|Bài|Theo)\s*[:\-]?\s*/i, '');

    // --- thời gian đăng: ưu tiên mã bài (chính xác đến phút), sau đó tới trang
    let publishedAt = dateFromId(digits);
    if (!publishedAt) {
      const t = first(doc, SEL.time);
      publishedAt = formatDate(
        (t && (t.getAttribute('datetime') || text(t))) ||
        ld.datePublished ||
        meta(doc, ['article:published_time', 'pubdate', 'publishdate', 'datePublished'])
      );
    }

    // --- chuyên mục
    const categoryPath = [];
    const categoryIds = [];
    if (segs.length > 1) {
      // /the-gioi/quan-su/xxx-123.htm -> ["the-gioi", "the-gioi/quan-su"]
      for (let i = 0; i < segs.length - 1; i++) {
        const cid = segs.slice(0, i + 1).join('/');
        const cat = findCategory(menu, cid);
        categoryIds.push(cid);
        categoryPath.push(cat ? cat.title : '');
      }
    }
    const crumbs = Array.from(doc.querySelectorAll(SEL.breadcrumb.join(','))).map(text).filter((t) => t && !/^(trang chủ|home)$/i.test(t));
    crumbs.forEach((c, i) => { if (!categoryPath[i]) categoryPath[i] = c; });
    if (!categoryPath.length) {
      const sec = meta(doc, ['article:section']) || clean(ld.articleSection);
      if (sec) categoryPath.push(sec);
    }
    // nếu không có tên thì dùng slug viết hoa chữ cái đầu
    categoryPath.forEach((c, i) => {
      if (!c && categoryIds[i]) categoryPath[i] = categoryIds[i].split('/').pop().replace(/-/g, ' ').replace(/^\w/, (m) => m.toUpperCase());
    });

    // --- ảnh đại diện
    let thumbnail = meta(doc, ['og:image', 'twitter:image']) || [].concat(ld.image || [])[0] || body.image || '';
    if (thumbnail && typeof thumbnail === 'object') thumbnail = thumbnail.url || '';
    thumbnail = absUrl(thumbnail, url);

    return {
      id,
      title,
      slug,
      excerpt,
      content,
      author,
      category: categoryPath[0] || '',
      publishedAt,
      source: host,
      url: u.origin + u.pathname,
      // --- các trường bổ sung phục vụ website ---
      categories: categoryPath,     // mảng tên chuyên mục (bảng mô tả: post.category là array)
      categoryIds,                  // mảng id chuyên mục để lọc theo menu
      thumbnail,
      crawledAt: new Date().toISOString(),
    };
  }

  /** Kiểm tra dữ liệu tối thiểu của bài viết */
  function isValidPost(p) {
    return !!(p && p.title && p.content && p.content.length > 50);
  }

  return {
    ARTICLE_ID_RE,
    parseMenu,
    parseCategoryList,
    parseArticle,
    isValidPost,
    formatDate,
    dateFromId,
    findCategory,
  };
});
