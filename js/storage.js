/**
 * storage.js — Lớp làm việc với LocalStorage
 * ---------------------------------------------------------------------------
 * Dữ liệu được lưu dưới 2 khóa:
 *   tt_menu   : mảng chuyên mục (cây)
 *   tt_posts  : mảng bài viết
 * Lần đầu mở web: nạp từ data/seed.js (window.SEED_*) hoặc data/*.json.
 */
const Store = (() => {
  const KEY_MENU = 'tt_menu';
  const KEY_POSTS = 'tt_posts';
  const KEY_SEED = 'tt_seed_version';

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      // QuotaExceededError: LocalStorage thường giới hạn ~5MB
      console.error('Không ghi được LocalStorage:', e);
      alert('LocalStorage đã đầy (~5MB). Hãy xoá bớt bài viết trong trang Crawler.');
      return false;
    }
  }

  async function loadJson(path) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      return res.ok ? await res.json() : null;
    } catch (e) {
      return null; // mở bằng file:// sẽ lỗi fetch -> bỏ qua
    }
  }

  const byNewest = (a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '');

  /**
   * Sửa dữ liệu cũ: phiên bản crawler trước có thể lấy nhầm ngày giờ làm excerpt
   * ("Thứ ba, 20/10/2026 - 21:13"). Bỏ phần ngày giờ; nếu không còn gì thì lấy đoạn đầu nội dung.
   */
  const DATE_PREFIX = /^((Thứ\s+\S+|Chủ nhật),?\s*)?\d{1,2}\/\d{1,2}\/\d{4}\s*[-–]?\s*(\d{1,2}:\d{2})?\s*/i;
  function fixPost(p) {
    let ex = String(p.excerpt || '').replace(DATE_PREFIX, '').replace(/^\((Dân trí|Dantri)\)\s*[-–—:]\s*/i, '').trim();
    if (ex.length < 40) {
      const firstPara = String(p.content || '').split(/\n+/).map((s) => s.trim()).find((s) => s.length >= 40) || '';
      ex = firstPara.length > 220 ? firstPara.slice(0, firstPara.lastIndexOf(' ', 215)) + '…' : firstPara;
    }
    if (ex && ex !== p.excerpt) return { ...p, excerpt: ex };
    return p;
  }

  /** Khởi tạo: ưu tiên LocalStorage, nếu chưa có thì nạp dữ liệu gốc */
  async function init() {
    let seedMenu = window.SEED_MENU || null;
    let seedPosts = window.SEED_POSTS || null;
    if (!seedMenu) { const j = await loadJson('data/menu.json'); seedMenu = j && j.menu; }
    if (!seedPosts || !seedPosts.length) { const j = await loadJson('data/posts.json'); if (j && j.posts) seedPosts = j.posts; }

    if (!read(KEY_MENU, null) && seedMenu) write(KEY_MENU, seedMenu);

    // Nếu bộ dữ liệu gốc thay đổi (vừa chạy crawl lại) -> gộp vào, không xoá bài người dùng tự crawl
    const version = seedPosts ? String(seedPosts.length) + ':' + ((seedPosts[0] || {}).id || '') : '';
    if (seedPosts && seedPosts.length && read(KEY_SEED, '') !== version) {
      const map = new Map(getPosts().map((p) => [p.id, p]));
      seedPosts.forEach((p) => { if (!map.has(p.id)) map.set(p.id, p); });
      write(KEY_POSTS, Array.from(map.values()).sort(byNewest));
      write(KEY_SEED, version);
    }

    // Sửa các bài có excerpt lỗi (chỉ ghi lại khi thật sự có thay đổi)
    const stored = read(KEY_POSTS, []);
    let changed = false;
    const fixed = stored.map((p) => { const f = fixPost(p); if (f !== p) changed = true; return f; });
    if (changed) write(KEY_POSTS, fixed);
  }

  const getMenu = () => read(KEY_MENU, []);
  const getPosts = () => read(KEY_POSTS, []).sort(byNewest);
  const getPost = (id) => getPosts().find((p) => p.id === id) || null;

  /** Danh sách chuyên mục dạng phẳng (cấp 1 + cấp 2) */
  function flatCategories() {
    const out = [];
    getMenu().forEach((m) => {
      if (m.type !== 'category') return;
      out.push({ ...m, parent: null });
      (m.children || []).forEach((c) => out.push({ ...c, parent: m }));
    });
    return out;
  }

  function findCategory(id) {
    return flatCategories().find((c) => c.id === id) || null;
  }

  /** Bài viết thuộc chuyên mục (mới -> cũ). "latest" = tất cả bài */
  function postsByCategory(id) {
    const posts = getPosts();
    if (id === 'latest') return posts;
    return posts.filter((p) => (p.categoryIds || []).includes(id));
  }

  /** Thêm hoặc cập nhật bài viết (gộp categoryIds nếu đã tồn tại) */
  function savePost(post) {
    post = fixPost(post);
    const posts = read(KEY_POSTS, []);
    const i = posts.findIndex((p) => p.id === post.id);
    if (i >= 0) {
      const ids = new Set([...(posts[i].categoryIds || []), ...(post.categoryIds || [])]);
      posts[i] = { ...posts[i], ...post, categoryIds: Array.from(ids) };
    } else {
      posts.push(post);
    }
    return write(KEY_POSTS, posts.sort(byNewest));
  }

  function deletePost(id) {
    write(KEY_POSTS, read(KEY_POSTS, []).filter((p) => p.id !== id));
  }

  function importPosts(list) {
    let n = 0;
    list.forEach((p) => { if (p && p.id && p.title) { savePost(p); n++; } });
    return n;
  }

  /** Xoá toàn bộ, nạp lại dữ liệu gốc */
  async function reset() {
    [KEY_MENU, KEY_POSTS, KEY_SEED].forEach((k) => localStorage.removeItem(k));
    await init();
  }

  function usageKB() {
    let total = 0;
    [KEY_MENU, KEY_POSTS].forEach((k) => { total += (localStorage.getItem(k) || '').length * 2; });
    return Math.round(total / 1024);
  }

  return { init, getMenu, getPosts, getPost, flatCategories, findCategory, postsByCategory, savePost, deletePost, importPosts, reset, usageKB };
})();
