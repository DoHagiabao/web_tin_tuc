/**
 * app.js — Điều hướng (router) và hiển thị giao diện
 * ---------------------------------------------------------------------------
 * Website một trang (SPA) dùng URL dạng hash:
 *   #/                       Trang chủ
 *   #/category/<id>          Danh sách bài theo chuyên mục (id có thể là "the-gioi/quan-su")
 *   #/post/<id>              Chi tiết bài viết
 *   #/crawler                Trang Crawler
 *   #/contact                Liên hệ
 */
(() => {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const app = $('#app');

  /* ============================ Tiện ích ============================ */

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  const pad = (n) => String(n).padStart(2, '0');

  function toDate(s) {
    const m = (s || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : null;
  }
  /** "Thứ hai, 28/09/2026 - 12:22" */
  function fullDate(s) {
    const d = toDate(s);
    if (!d) return s || '';
    return `${WEEKDAYS[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  /** "5 phút trước", "3 giờ trước", hoặc ngày tháng */
  function timeAgo(s) {
    const d = toDate(s);
    if (!d) return s || '';
    const diff = (Date.now() - d.getTime()) / 60000;
    if (diff < 0) return fullDate(s);
    if (diff < 60) return `${Math.max(1, Math.round(diff))} phút trước`;
    if (diff < 60 * 24) return `${Math.round(diff / 60)} giờ trước`;
    if (diff < 60 * 24 * 7) return `${Math.round(diff / 1440)} ngày trước`;
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  const catLink = (id) => `#/category/${id}`;
  const postLink = (p) => `#/post/${encodeURIComponent(p.id)}`;

  /** Chuyên mục chính của bài (để hiện nhãn) */
  function mainCat(p) {
    const id = (p.categoryIds || [])[0];
    const c = id && Store.findCategory(id);
    return { id, title: (c && c.title) || p.category || (p.categories || [])[0] || '' };
  }

  /** Ảnh bài viết, nếu lỗi/thiếu ảnh -> khối màu có chữ */
  function thumb(p, cls = '') {
    const ph = `<div class="thumb-ph"><span>${esc(mainCat(p).title || 'Tin tức')}</span></div>`;
    if (!p.thumbnail) return `<div class="thumb ${cls}">${ph}</div>`;
    return `<div class="thumb ${cls}"><img src="${esc(p.thumbnail)}" alt="${esc(p.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'thumb-ph',innerHTML:'<span>Tin tức</span>'}))"></div>`;
  }

  /* ============================ Thành phần bài viết ============================ */

  const cardFeatured = (p) => `
    <article class="card-featured">
      <a href="${postLink(p)}">${thumb(p, 'ratio-16-10')}</a>
      <div class="card-body">
        <a class="cat-label" href="${catLink(mainCat(p).id)}">${esc(mainCat(p).title)}</a>
        <h2 class="title-lg"><a href="${postLink(p)}">${esc(p.title)}</a></h2>
        <p class="excerpt">${esc(p.excerpt)}</p>
        <p class="meta">${esc(timeAgo(p.publishedAt))}${p.author ? ' · ' + esc(p.author) : ''}</p>
      </div>
    </article>`;

  const cardSmall = (p) => `
    <article class="card-small">
      <a href="${postLink(p)}">${thumb(p, 'ratio-16-10')}</a>
      <h3 class="title-sm"><a href="${postLink(p)}">${esc(p.title)}</a></h3>
      <p class="meta">${esc(timeAgo(p.publishedAt))}</p>
    </article>`;

  const listItem = (p) => `
    <article class="list-item">
      <a href="${postLink(p)}" class="list-thumb">${thumb(p, 'ratio-3-2')}</a>
      <div class="list-body">
        <h3 class="title-md"><a href="${postLink(p)}">${esc(p.title)}</a></h3>
        <p class="excerpt">${esc(p.excerpt)}</p>
        <p class="meta"><a href="${catLink(mainCat(p).id)}">${esc(mainCat(p).title)}</a> · ${esc(timeAgo(p.publishedAt))}</p>
      </div>
    </article>`;

  /** Khối 3 bài mới nhất: 1 lớn bên trái + 2 nhỏ bên phải */
  const topSection = (posts) => {
    if (!posts.length) return '';
    return `
    <section class="top-section">
      <div class="top-main">${cardFeatured(posts[0])}</div>
      <div class="top-side">${posts.slice(1, 3).map(cardSmall).join('')}</div>
    </section>`;
  };

  const emptyState = (title, body, action = '') => `
    <div class="empty">
      <div class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="40" height="40"><path fill="currentColor" d="M4 4h12a2 2 0 0 1 2 2v1h2a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2Zm14 5v9a1 1 0 0 0 2 0V9Zm-2-3H4v12a1 1 0 0 0 1 1h11.2a3 3 0 0 1-.2-1Zm-10 2h8v3H6Zm0 5h8v1.5H6Zm0 3h5v1.5H6Z"/></svg>
      </div>
      <h3>${title}</h3>
      <p>${body}</p>
      ${action}
    </div>`;

  /* ============================ NAVBAR ============================ */

  function renderNav() {
    const menu = Store.getMenu();
    const list = $('#navList');
    const current = location.hash;
    list.innerHTML = menu.map((m) => {
      if (m.type === 'home') {
        return `<li class="nav-item nav-home"><a href="#/" aria-label="Trang chủ" class="nav-link">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 3 2 11.5l1.3 1.5L5 11.6V20a1 1 0 0 0 1 1h5v-6h2v6h5a1 1 0 0 0 1-1v-8.4l1.7 1.4 1.3-1.5Z"/></svg>
          <span class="only-mobile">Trang chủ</span></a></li>`;
      }
      if (m.type === 'external') {
        return `<li class="nav-item"><a class="nav-link nav-ext" href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a></li>`;
      }
      const kids = m.children || [];
      const active = current.startsWith('#/category/' + m.id) ? ' active' : '';
      return `<li class="nav-item${kids.length ? ' has-children' : ''}">
        <a class="nav-link${active}" href="${catLink(m.id)}">${esc(m.title)}</a>
        ${kids.length ? `<button class="sub-toggle" aria-label="Mở chuyên mục con của ${esc(m.title)}">▾</button>
        <ul class="submenu">${kids.map((c) => `<li><a href="${catLink(c.id)}">${esc(c.title)}</a></li>`).join('')}</ul>` : ''}
      </li>`;
    }).join('') + `<li class="nav-item nav-more" id="navMore" hidden>
        <button class="nav-link more-btn" aria-label="Xem thêm chuyên mục">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M5 5h3v3H5Zm5.5 0h3v3h-3ZM16 5h3v3h-3ZM5 10.5h3v3H5Zm5.5 0h3v3h-3Zm5.5 0h3v3h-3ZM5 16h3v3H5Zm5.5 0h3v3h-3Zm5.5 0h3v3h-3Z"/></svg>
        </button>
        <ul class="submenu more-menu" id="moreMenu"></ul>
      </li>`;
    fitNav();
  }

  /** Desktop: các mục tràn khỏi thanh menu được dồn vào nút "Thêm" */
  function fitNav() {
    const list = $('#navList');
    const more = $('#navMore');
    const moreMenu = $('#moreMenu');
    if (!list || !more) return;
    const items = $$('.nav-item:not(.nav-more)', list);
    items.forEach((li) => li.classList.remove('overflowed'));
    moreMenu.innerHTML = '';
    more.hidden = true;
    if (window.innerWidth < 992) return; // mobile dùng drawer
    const maxRight = list.getBoundingClientRect().right - 56;
    const hidden = [];
    items.forEach((li) => {
      if (li.getBoundingClientRect().right > maxRight || hidden.length) {
        hidden.push(li);
      }
    });
    if (!hidden.length) return;
    hidden.forEach((li) => {
      li.classList.add('overflowed');
      const a = $('.nav-link', li);
      moreMenu.insertAdjacentHTML('beforeend', `<li><a href="${a.getAttribute('href')}" ${a.target ? 'target="_blank" rel="noopener"' : ''}>${a.textContent.trim()}</a></li>`);
    });
    more.hidden = false;
  }

  function setupNavEvents() {
    const toggle = $('#menuToggle');
    const close = () => {
      document.body.classList.remove('drawer-open');
      toggle.setAttribute('aria-expanded', 'false');
    };
    toggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('drawer-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    $('#drawerBackdrop').addEventListener('click', close);
    $('#navList').addEventListener('click', (e) => {
      const btn = e.target.closest('.sub-toggle, .more-btn');
      if (btn) {
        e.preventDefault();
        btn.parentElement.classList.toggle('open');
        return;
      }
      if (e.target.closest('a')) close();
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav-more')) { const m = $('#navMore'); if (m) m.classList.remove('open'); }
    });
    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(fitNav, 120); });
  }

  function highlightNav() {
    const h = location.hash;
    $$('#navList .nav-link').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const id = href.replace('#/category/', '');
      a.classList.toggle('active', href.startsWith('#/category/') && (h === href || h.startsWith(href + '/')));
      if (href === '#/') a.classList.toggle('active', h === '' || h === '#/' );
      void id;
    });
  }

  /* ============================ TRANG CHỦ ============================ */

  function renderHome() {
    const posts = Store.getPosts();
    document.title = 'Tin Việt 24h — Tin tức mới nhất';
    if (!posts.length) {
      app.innerHTML = emptyState(
        'Chưa có bài viết nào',
        'Dữ liệu bài viết được lưu trong LocalStorage. Hãy vào trang <b>Crawler</b> để lấy bài từ dantri.com.vn, hoặc chạy <code>npm run crawl</code> để tạo bộ dữ liệu 10 bài/chuyên mục.',
        '<a class="btn btn-primary" href="#/crawler">Đi tới trang Crawler</a>'
      );
      return;
    }
    const top = posts.slice(0, 3);
    const latest = posts.slice(3, 11);
    const sections = Store.getMenu()
      .filter((m) => m.type === 'category' && m.id !== 'latest')
      .map((m) => ({ cat: m, list: Store.postsByCategory(m.id).filter((p) => !top.includes(p)).slice(0, 4) }))
      .filter((s) => s.list.length);

    app.innerHTML = `
      ${topSection(top)}
      <div class="home-grid">
        <section>
          <div class="section-head"><h2>Tin mới nhất</h2><a href="#/category/latest">Xem tất cả →</a></div>
          <div class="post-list">${latest.map(listItem).join('')}</div>
        </section>
        <aside class="sidebar">
          <div class="section-head"><h2>Chuyên mục</h2></div>
          <ul class="cat-cloud">${sections.map((s) => `<li><a href="${catLink(s.cat.id)}">${esc(s.cat.title)} <span>${Store.postsByCategory(s.cat.id).length}</span></a></li>`).join('')}</ul>
        </aside>
      </div>
      ${sections.map((s) => `
        <section class="cat-block">
          <div class="section-head"><h2><a href="${catLink(s.cat.id)}">${esc(s.cat.title)}</a></h2>
            <ul class="sub-links">${(s.cat.children || []).slice(0, 4).map((c) => `<li><a href="${catLink(c.id)}">${esc(c.title)}</a></li>`).join('')}</ul>
          </div>
          <div class="cat-block-grid">
            ${cardFeatured(s.list[0])}
            <div class="cat-block-side">${s.list.slice(1).map(cardSmall).join('')}</div>
          </div>
        </section>`).join('')}
    `;
  }

  /* ============================ TRANG CHUYÊN MỤC ============================ */

  const PAGE_SIZE = 10;

  function renderCategory(id) {
    const cat = Store.findCategory(id);
    if (!cat) {
      app.innerHTML = emptyState('Không tìm thấy chuyên mục', `Chuyên mục "${esc(id)}" không có trong menu.`, '<a class="btn" href="#/">Về trang chủ</a>');
      return;
    }
    document.title = `${cat.title} — Tin Việt 24h`;
    let posts = Store.postsByCategory(id);
    const parent = cat.parent;
    // Chuyên mục con chưa có bài riêng -> hiển thị bài của chuyên mục cha (có ghi chú rõ ràng)
    let fallbackNote = '';
    if (!posts.length && parent && Store.postsByCategory(parent.id).length) {
      posts = Store.postsByCategory(parent.id);
      fallbackNote = `<div class="notice">
          <span>Chuyên mục <b>${esc(cat.title)}</b> chưa có bài riêng — đang hiển thị bài mới nhất của <b>${esc(parent.title)}</b>.</span>
          <button class="btn btn-sm btn-primary" id="quickCrawl">Crawl 10 bài cho “${esc(cat.title)}”</button>
        </div>
        <div class="progress-wrap" hidden><div class="progress"><div class="progress-bar"></div></div><p class="progress-text"></p></div>`;
    }
    const subs = parent ? parent.children || [] : cat.children || [];

    const header = `
      <div class="cat-header">
        <div class="breadcrumb"><a href="#/">Trang chủ</a>${parent ? ` <span>›</span> <a href="${catLink(parent.id)}">${esc(parent.title)}</a>` : ''}</div>
        <h1 class="cat-title">${esc(cat.title)}</h1>
        ${subs.length ? `<ul class="sub-nav">${subs.map((c) => `<li><a class="${c.id === id ? 'active' : ''}" href="${catLink(c.id)}">${esc(c.title)}</a></li>`).join('')}</ul>` : ''}
      </div>`;

    const bindQuickCrawl = () => {
      const btn = $('#quickCrawl');
      if (!btn) return;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const wrap = $('.progress-wrap');
        wrap.hidden = false;
        try {
          const n = await Crawler.crawlCategory(cat, 10, (done, total, msg) => {
            $('.progress-bar').style.width = (done / total) * 100 + '%';
            $('.progress-text').textContent = `${done}/${total} — ${msg}`;
          });
          toast(`Đã lưu ${n} bài vào LocalStorage`);
          route();
        } catch (e) {
          $('.progress-text').textContent = e.message.split('\n')[0];
          btn.disabled = false;
        }
      });
    };

    if (!posts.length) {
      app.innerHTML = header + emptyState(
        'Chuyên mục này chưa có bài viết',
        'Bạn có thể crawl nhanh 10 bài mới nhất của chuyên mục này từ dantri.com.vn.',
        `<button class="btn btn-primary" id="quickCrawl">Crawl 10 bài cho “${esc(cat.title)}”</button>
         <div class="progress-wrap" hidden><div class="progress"><div class="progress-bar"></div></div><p class="progress-text"></p></div>`
      );
      bindQuickCrawl();
      return;
    }

    const rest = posts.slice(3);
    app.innerHTML = `
      ${header}
      ${fallbackNote}
      ${topSection(posts.slice(0, 3))}
      <div class="home-grid">
        <section>
          <div class="post-list" id="postList">${rest.slice(0, PAGE_SIZE).map(listItem).join('')}</div>
          ${rest.length > PAGE_SIZE ? '<div class="load-more"><button class="btn" id="loadMore">Xem thêm</button></div>' : ''}
        </section>
        ${sidebarLatest(id)}
      </div>`;

    bindQuickCrawl();
    let shown = PAGE_SIZE;
    const more = $('#loadMore');
    if (more) {
      more.addEventListener('click', () => {
        $('#postList').insertAdjacentHTML('beforeend', rest.slice(shown, shown + PAGE_SIZE).map(listItem).join(''));
        shown += PAGE_SIZE;
        if (shown >= rest.length) more.parentElement.remove();
      });
    }
  }

  function sidebarLatest(excludeCat) {
    const list = Store.getPosts().filter((p) => !(p.categoryIds || []).includes(excludeCat)).slice(0, 6);
    if (!list.length) return '<aside class="sidebar"></aside>';
    return `<aside class="sidebar">
      <div class="section-head"><h2>Tin khác</h2></div>
      <ol class="rank-list">${list.map((p) => `<li><a href="${postLink(p)}">${esc(p.title)}</a><span class="meta">${esc(timeAgo(p.publishedAt))}</span></li>`).join('')}</ol>
    </aside>`;
  }

  /* ============================ CHI TIẾT BÀI VIẾT ============================ */

  /** Chuyển nội dung (các đoạn cách nhau bởi dòng trống) thành HTML */
  function contentHtml(content) {
    return String(content || '')
      .split(/\n{2,}|\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((para) => {
        // Câu ngắn, không có dấu kết thúc câu -> coi là tiêu đề phụ
        const isHeading = para.length < 90 && !/[.!?:;”"…)]$/.test(para);
        return isHeading ? `<h2>${esc(para)}</h2>` : `<p>${esc(para)}</p>`;
      })
      .join('');
  }

  function renderPost(id) {
    const p = Store.getPost(decodeURIComponent(id));
    if (!p) {
      app.innerHTML = emptyState('Không tìm thấy bài viết', 'Bài viết có thể đã bị xoá khỏi LocalStorage.', '<a class="btn" href="#/">Về trang chủ</a>');
      return;
    }
    document.title = `${p.title} — Tin Việt 24h`;
    const cat = mainCat(p);
    const catObj = cat.id && Store.findCategory(cat.id);
    const related = Store.postsByCategory(cat.id).filter((x) => x.id !== p.id).slice(0, 4);

    app.innerHTML = `
      <div class="detail-grid">
        <article class="post-detail">
          <div class="breadcrumb">
            <a href="#/">Trang chủ</a>
            ${catObj && catObj.parent ? `<span>›</span><a href="${catLink(catObj.parent.id)}">${esc(catObj.parent.title)}</a>` : ''}
            ${cat.id ? `<span>›</span><a href="${catLink(cat.id)}">${esc(cat.title)}</a>` : esc(cat.title)}
          </div>
          <h1 class="post-title">${esc(p.title)}</h1>
          <div class="post-meta">
            <span class="author">${esc(p.author || 'Không rõ tác giả')}</span>
            <time datetime="${esc(p.publishedAt)}">${esc(fullDate(p.publishedAt))}</time>
            ${cat.title ? `<a class="cat-label" href="${cat.id ? catLink(cat.id) : '#/'}">${esc(cat.title)}</a>` : ''}
          </div>
          ${p.excerpt ? `<p class="post-sapo">${esc(p.excerpt)}</p>` : ''}
          ${p.thumbnail ? `<figure class="post-figure"><img src="${esc(p.thumbnail)}" alt="${esc(p.title)}" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></figure>` : ''}
          <div class="post-content">${contentHtml(p.content)}</div>
          <div class="post-source">
            <span>Nguồn: <b>${esc(p.source)}</b></span>
            <a href="${esc(p.url)}" target="_blank" rel="noopener">Xem bài gốc ↗</a>
          </div>
        </article>
        ${sidebarLatest(cat.id)}
      </div>
      ${related.length ? `
        <section class="related">
          <div class="section-head"><h2>Cùng chuyên mục</h2></div>
          <div class="related-grid">${related.map(cardSmall).join('')}</div>
        </section>` : ''}
    `;
  }

  /* ============================ TRANG CRAWLER ============================ */

  const SAMPLE_URL = 'https://dantri.com.vn/bat-dong-san/ha-noi-tinh-co-che-boi-thuong-dat-dac-biet-cho-7-du-an-duong-sat-20260928122246655.htm';

  /** Chỉ lấy đúng các trường theo định dạng đề bài để hiển thị JSON */
  const specShape = (p) => ({
    id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt, content: p.content,
    author: p.author, category: p.category, publishedAt: p.publishedAt, source: p.source, url: p.url,
  });

  function renderCrawler() {
    document.title = 'Crawler — Tin Việt 24h';
    const cats = Store.flatCategories().filter((c) => c.id !== 'latest');
    app.innerHTML = `
      <div class="page-head">
        <h1>Crawler tin tức</h1>
        <p>Nhập URL một bài viết (ví dụ trên dantri.com.vn). Hệ thống tải trang, trích xuất dữ liệu theo cấu trúc chuẩn và lưu vào LocalStorage.</p>
      </div>

      <section class="panel">
        <form id="crawlForm" class="crawl-form">
          <label for="crawlUrl">URL bài viết</label>
          <div class="input-row">
            <input id="crawlUrl" type="url" required placeholder="https://dantri.com.vn/...-20260928122246655.htm">
            <button class="btn btn-primary" type="submit" id="crawlBtn">Lấy bài viết</button>
          </div>
          <button type="button" class="link-btn" id="useSample">Dùng URL mẫu trong đề bài</button>
        </form>
        <div id="crawlStatus" class="status" hidden></div>
        <details class="manual" id="manualBox">
          <summary>Không tải được? Dán mã nguồn HTML thủ công</summary>
          <p class="hint">Mở bài viết trên trình duyệt → nhấn <kbd>Ctrl</kbd>+<kbd>U</kbd> → chọn tất cả và dán vào đây (nhớ nhập URL ở ô phía trên).</p>
          <textarea id="manualHtml" rows="5" placeholder="<!DOCTYPE html>..."></textarea>
          <button class="btn" id="manualBtn" type="button">Trích xuất từ HTML</button>
        </details>
      </section>

      <section class="panel" id="resultPanel" hidden>
        <div class="panel-head">
          <h2>Kết quả</h2>
          <div class="tabs" role="tablist">
            <button class="tab active" data-tab="preview" role="tab">Xem trước</button>
            <button class="tab" data-tab="json" role="tab">JSON</button>
          </div>
        </div>
        <div id="tab-preview" class="tab-pane"></div>
        <div id="tab-json" class="tab-pane" hidden>
          <pre class="json" id="jsonOut"></pre>
          <button class="btn" id="copyJson">Sao chép JSON</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Crawl hàng loạt theo chuyên mục</h2></div>
        <p class="hint">Lấy danh sách bài từ trang chuyên mục rồi crawl từng bài (mặc định 10 bài).</p>
        <div class="bulk-row">
          <select id="bulkCat">
            <option value="__all">— Tất cả chuyên mục cấp 1 —</option>
            ${cats.map((c) => `<option value="${esc(c.id)}">${c.parent ? '— ' : ''}${esc(c.title)}</option>`).join('')}
          </select>
          <input id="bulkLimit" type="number" min="1" max="30" value="10" aria-label="Số bài">
          <button class="btn btn-primary" id="bulkBtn">Bắt đầu crawl</button>
        </div>
        <div class="progress-wrap" id="bulkProgress" hidden>
          <div class="progress"><div class="progress-bar" id="bulkBar"></div></div>
          <p class="progress-text" id="bulkText"></p>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Dữ liệu trong LocalStorage</h2>
          <div class="panel-actions">
            <button class="btn btn-sm" id="exportBtn">Xuất JSON</button>
            <label class="btn btn-sm">Nhập JSON<input type="file" id="importFile" accept=".json,application/json" hidden></label>
            <button class="btn btn-sm btn-danger" id="resetBtn">Khôi phục dữ liệu gốc</button>
          </div>
        </div>
        <div id="storeStats" class="stats"></div>
        <div class="table-wrap"><table class="data-table" id="postTable"></table></div>
      </section>
    `;

    const status = (msg, type = 'info') => {
      const el = $('#crawlStatus');
      el.hidden = false;
      el.className = 'status status-' + type;
      el.innerHTML = msg;
    };

    function showResult(post) {
      Store.savePost(post); // ★ Lưu bài viết vào LocalStorage
      $('#resultPanel').hidden = false;
      $('#tab-preview').innerHTML = `
        <div class="preview">
          ${thumb(post, 'ratio-16-10')}
          <div>
            <span class="cat-label">${esc(post.category)}</span>
            <h3 class="title-md">${esc(post.title)}</h3>
            <p class="meta">${esc(post.author)} · ${esc(fullDate(post.publishedAt))}</p>
            <p class="excerpt">${esc(post.excerpt)}</p>
            <p class="meta">${post.content.split(/\n+/).length} đoạn · ${post.content.length.toLocaleString('vi-VN')} ký tự</p>
            <a class="btn btn-primary btn-sm" href="${postLink(post)}">Xem trên website →</a>
          </div>
        </div>`;
      $('#jsonOut').textContent = JSON.stringify(specShape(post), null, 2);
      renderStoreTable();
    }

    $('#useSample').addEventListener('click', () => { $('#crawlUrl').value = SAMPLE_URL; });

    $('#crawlForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = $('#crawlUrl').value;
      const btn = $('#crawlBtn');
      btn.disabled = true;
      btn.textContent = 'Đang lấy...';
      status('<span class="spinner"></span> Đang tải trang và trích xuất dữ liệu...');
      try {
        const post = await Crawler.crawlArticle(url);
        const via = post._via;
        delete post._via;
        showResult(post);
        status(`✓ Đã lấy bài viết (qua ${esc(via)}) và <b>lưu vào LocalStorage</b>.`, 'ok');
      } catch (err) {
        status(`✗ ${esc(err.message).replace(/\n/g, '<br>')}<br><small>Gợi ý: chạy <code>npm start</code> để dùng proxy cục bộ, hoặc dán HTML thủ công bên dưới.</small>`, 'error');
        $('#manualBox').open = true;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Lấy bài viết';
      }
    });

    $('#manualBtn').addEventListener('click', () => {
      try {
        const post = Crawler.parseFromHtml($('#manualHtml').value, $('#crawlUrl').value);
        if (!post.title) throw new Error('Không tìm thấy tiêu đề trong HTML');
        showResult(post);
        status('✓ Đã trích xuất từ HTML và lưu vào LocalStorage.', 'ok');
      } catch (err) {
        status('✗ ' + esc(err.message), 'error');
      }
    });

    $$('.tab').forEach((t) => t.addEventListener('click', () => {
      $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
      $('#tab-preview').hidden = t.dataset.tab !== 'preview';
      $('#tab-json').hidden = t.dataset.tab !== 'json';
    }));

    $('#copyJson').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('#jsonOut').textContent); toast('Đã sao chép JSON'); }
      catch (e) { toast('Không sao chép được'); }
    });

    $('#bulkBtn').addEventListener('click', async () => {
      const val = $('#bulkCat').value;
      const limit = Math.max(1, Math.min(30, parseInt($('#bulkLimit').value, 10) || 10));
      const targets = val === '__all' ? Store.getMenu().filter((m) => m.type === 'category' && m.id !== 'latest') : [Store.findCategory(val)];
      const btn = $('#bulkBtn');
      btn.disabled = true;
      $('#bulkProgress').hidden = false;
      let total = 0;
      for (let i = 0; i < targets.length; i++) {
        const cat = targets[i];
        try {
          total += await Crawler.crawlCategory(cat, limit, (done, lim, msg) => {
            const overall = (i + done / lim) / targets.length;
            $('#bulkBar').style.width = overall * 100 + '%';
            $('#bulkText').textContent = `[${i + 1}/${targets.length}] ${cat.title}: ${done}/${lim} — ${msg}`;
          });
        } catch (e) {
          $('#bulkText').textContent = `${cat.title}: ${e.message.split('\n')[0]}`;
        }
        renderStoreTable();
      }
      $('#bulkBar').style.width = '100%';
      $('#bulkText').textContent = `Hoàn tất: đã lưu ${total} bài vào LocalStorage.`;
      btn.disabled = false;
      renderNav();
    });

    $('#exportBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ menu: Store.getMenu(), posts: Store.getPosts() }, null, 2)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'tin-tuc-data.json' });
      a.click();
      URL.revokeObjectURL(a.href);
    });

    $('#importFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const list = Array.isArray(data) ? data : data.posts || [];
        toast(`Đã nhập ${Store.importPosts(list)} bài viết`);
        renderStoreTable();
      } catch (err) {
        toast('File JSON không hợp lệ');
      }
    });

    $('#resetBtn').addEventListener('click', async () => {
      if (!confirm('Xoá toàn bộ dữ liệu trong LocalStorage và nạp lại dữ liệu gốc?')) return;
      await Store.reset();
      renderNav();
      renderStoreTable();
      toast('Đã khôi phục dữ liệu gốc');
    });

    $('#postTable').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      Store.deletePost(del.dataset.del);
      renderStoreTable();
      toast('Đã xoá bài viết');
    });

    renderStoreTable();
  }

  function renderStoreTable() {
    const posts = Store.getPosts();
    const cats = new Set(posts.flatMap((p) => p.categoryIds || []));
    $('#storeStats').innerHTML = `
      <div><b>${posts.length}</b><span>bài viết</span></div>
      <div><b>${cats.size}</b><span>chuyên mục có bài</span></div>
      <div><b>${Store.usageKB()} KB</b><span>dung lượng (~5MB tối đa)</span></div>`;
    $('#postTable').innerHTML = posts.length ? `
      <thead><tr><th>Tiêu đề</th><th>Chuyên mục</th><th>Thời gian</th><th></th></tr></thead>
      <tbody>${posts.slice(0, 200).map((p) => `
        <tr>
          <td><a href="${postLink(p)}">${esc(p.title)}</a></td>
          <td>${esc(mainCat(p).title)}</td>
          <td class="nowrap">${esc(p.publishedAt)}</td>
          <td><button class="icon-btn" data-del="${esc(p.id)}" aria-label="Xoá bài">✕</button></td>
        </tr>`).join('')}</tbody>` : '<tbody><tr><td class="muted">Chưa có bài viết nào.</td></tr></tbody>';
  }

  /* ============================ LIÊN HỆ ============================ */

  function renderContact() {
    document.title = 'Liên hệ — Tin Việt 24h';
    app.innerHTML = `
      <div class="page-head"><h1>Liên hệ</h1><p>Gửi góp ý, phản ánh hoặc cung cấp thông tin cho toà soạn.</p></div>
      <div class="contact-grid">
        <form class="panel contact-form" id="contactForm">
          <label>Họ và tên<input name="name" required></label>
          <label>Email<input name="email" type="email" required></label>
          <label>Nội dung<textarea name="message" rows="5" required></textarea></label>
          <button class="btn btn-primary" type="submit">Gửi liên hệ</button>
        </form>
        <div class="panel contact-info">
          <h3>Thông tin toà soạn</h3>
          <p><b>Địa chỉ:</b> Đường Nguyễn Trác, Yên Nghĩa, Hà Đông, Hà Nội</p>
          <p><b>Email:</b> <a href="mailto:lienhe@tinviet24h.vn">lienhe@tinviet24h.vn</a></p>
          <p><b>Điện thoại:</b> 024 1234 5678</p>
        </div>
      </div>`;
    $('#contactForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      try {
        const list = JSON.parse(localStorage.getItem('tt_contacts') || '[]');
        list.push({ ...data, sentAt: new Date().toISOString() });
        localStorage.setItem('tt_contacts', JSON.stringify(list));
      } catch (err) { /* bỏ qua */ }
      e.target.reset();
      toast('Cảm ơn bạn! Liên hệ đã được ghi nhận.');
    });
  }

  /* ============================ FOOTER ============================ */

  function renderFooter() {
    const cats = Store.getMenu().filter((m) => m.type === 'category' && m.id !== 'latest').slice(0, 10);
    $('#footer').innerHTML = `
      <div class="container footer-grid">
        <div class="footer-col footer-about">
          <a href="#/" class="logo logo-light"><span class="logo-mark">TV</span><span class="logo-text">Tin Việt <b>24h</b></span></a>
          <p>Trang tin tức tổng hợp cập nhật nhanh các sự kiện thời sự, kinh tế, xã hội trong nước và quốc tế. Sản phẩm bài tập lớn môn Lập trình Web.</p>
          <div class="socials">
            <a href="https://facebook.com" target="_blank" rel="noopener" aria-label="Facebook"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4a21 21 0 0 0-2.3-.1c-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.6V21Z"/></svg></a>
            <a href="https://youtube.com" target="_blank" rel="noopener" aria-label="YouTube"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8A26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3Z"/></svg></a>
            <a href="https://tiktok.com" target="_blank" rel="noopener" aria-label="TikTok"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6 2.7 2.7 0 0 1 .8.1V9.7a5.8 5.8 0 0 0-.8-.1 5.8 5.8 0 1 0 5.8 5.8V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.3-1.6Z"/></svg></a>
          </div>
        </div>
        <div class="footer-col">
          <h4>Liên kết nhanh</h4>
          <ul>
            <li><a href="#/">Trang chủ</a></li>
            <li><a href="#/category/latest">Tin mới</a></li>
            <li><a href="#/crawler">Crawler</a></li>
            <li><a href="#/contact">Liên hệ</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Chuyên mục</h4>
          <ul class="two-cols">${cats.map((c) => `<li><a href="${catLink(c.id)}">${esc(c.title)}</a></li>`).join('')}</ul>
        </div>
        <div class="footer-col">
          <h4>Liên hệ</h4>
          <ul class="contact-list">
            <li><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v.5l8 5 8-5V7Zm16 2.8-8 5-8-5V17h16Z"/></svg><a href="mailto:lienhe@tinviet24h.vn">lienhe@tinviet24h.vn</a></li>
            <li><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5Z"/></svg><span>Đường Nguyễn Trác, Yên Nghĩa, Hà Đông, Hà Nội</span></li>
            <li><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.2 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .6 3.6 1 1 0 0 1-.3 1Z"/></svg><span>024 1234 5678</span></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <div class="container">
          <span>© ${new Date().getFullYear()} Tin Việt 24h. Bảo lưu mọi quyền.</span>
          <span>Dữ liệu tham khảo từ dantri.com.vn — chỉ phục vụ mục đích học tập.</span>
        </div>
      </div>`;
  }

  /* ============================ ROUTER ============================ */

  function route() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [page, ...rest] = hash.split('/');
    const param = rest.join('/');
    window.scrollTo(0, 0);
    switch (page) {
      case '': renderHome(); break;
      case 'category': renderCategory(param); break;
      case 'post': renderPost(param); break;
      case 'crawler': renderCrawler(); break;
      case 'contact': renderContact(); break;
      default: app.innerHTML = emptyState('404 — Không tìm thấy trang', '', '<a class="btn" href="#/">Về trang chủ</a>');
    }
    highlightNav();
  }

  /* ============================ KHỞI ĐỘNG ============================ */

  async function start() {
    const d = new Date();
    $('#today').textContent = `${WEEKDAYS[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    await Store.init();
    renderNav();
    setupNavEvents();
    renderFooter();
    window.addEventListener('hashchange', route);
    route();
    if (document.fonts) document.fonts.ready.then(fitNav);
  }

  start();
})();
