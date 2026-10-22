#!/usr/bin/env node
/**
 * crawl-dantri.js — Thu thập dữ liệu chuyên mục + bài viết từ https://dantri.com.vn/
 * ---------------------------------------------------------------------------
 * Cách chạy (cần Node.js >= 18):
 *     npm install
 *     npm run crawl                 # 10 bài / chuyên mục cấp 1
 *     node tools/crawl-dantri.js --limit 15 --children
 *
 * Tuỳ chọn:
 *   --limit N        số bài tối thiểu cho mỗi chuyên mục (mặc định 10)
 *   --children       crawl thêm cả chuyên mục con (cấp 2)
 *   --only a,b       chỉ crawl các chuyên mục có id trong danh sách (vd: the-gioi,thoi-su)
 *   --concurrency N  số request song song (mặc định 4)
 *
 * Kết quả ghi vào thư mục data/:
 *   data/menu.json   cây chuyên mục
 *   data/posts.json  danh sách bài viết
 *   data/seed.js     cùng dữ liệu, dạng <script> để mở index.html trực tiếp (file://)
 */
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('linkedom');
const P = require('../js/parser.js');

const BASE = 'https://dantri.com.vn/';
const DATA_DIR = path.join(__dirname, '..', 'data');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  if (i === -1) return def;
  const v = args[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const LIMIT = parseInt(opt('limit', 10), 10);
const WITH_CHILDREN = !!opt('children', false);
const ONLY = opt('only', '') ? String(opt('only')).split(',') : null;
const CONCURRENCY = parseInt(opt('concurrency', 2), 10); // ít request song song -> đỡ bị chặn

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TIMEOUT_MS = 20000;

/** Tải 1 trang, giới hạn thời gian cho CẢ việc kết nối lẫn đọc nội dung */
async function fetchOnce(url) {
  const ctrl = new AbortController();
  let hardTimer;
  const download = (async () => {
    let res;
    try {
      res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        },
      });
    } catch (e) {
      // "fetch failed" không nói gì -> lấy lỗi thật bên trong (ECONNRESET, ENOTFOUND, ETIMEDOUT...)
      const c = e.cause || {};
      throw new Error(`${e.message}${c.code ? ' [' + c.code + ']' : ''}${c.message ? ' ' + c.message : ''}`);
    }
    if (!res.ok) throw new Error('HTTP ' + res.status + (res.status === 403 || res.status === 429 ? ' (máy chủ đang chặn — chờ 15–30 phút rồi chạy lại)' : ''));
    return await res.text();
  })();
  // Mốc thời gian cứng: quá hạn thì huỷ request và báo lỗi, không bao giờ treo
  const deadline = new Promise((_, reject) => {
    hardTimer = setTimeout(() => { ctrl.abort(); reject(new Error('Quá thời gian chờ')); }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([download, deadline]);
  } finally {
    clearTimeout(hardTimer);
    download.catch(() => { }); // tránh cảnh báo "unhandled rejection"
  }
}

/**
 * Các "đường" tải trang. Nếu IP của bạn bị dantri chặn, kết nối trực tiếp sẽ hết giờ
 * -> chuyển sang proxy công cộng (máy chủ trung gian có IP khác tải hộ).
 */
const ROUTES = [
  { name: 'Trực tiếp', make: (u) => u },
  { name: 'Proxy allorigins', make: (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u) },
  { name: 'Proxy codetabs', make: (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u) },
  { name: 'Proxy corsproxy', make: (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u) },
];
const NO_PROXY = !!opt('no-proxy', false);
let directFails = 0;     // số lần kết nối trực tiếp lỗi liên tiếp
let lastRoute = '';

async function fetchHtml(url) {
  const errors = [];
  for (const route of ROUTES) {
    if (route.name === 'Trực tiếp' && directFails >= 2) continue; // đã biết bị chặn -> bỏ qua cho nhanh
    if (route.name !== 'Trực tiếp' && NO_PROXY) continue;
    try {
      const html = await fetchOnce(route.make(url));
      if (html.length < 500) throw new Error('Nội dung trả về quá ngắn');
      if (route.name === 'Trực tiếp') directFails = 0;
      if (route.name !== lastRoute) {
        console.log(`\n   ℹ Đang tải qua: ${route.name}`);
        lastRoute = route.name;
      }
      return html;
    } catch (e) {
      if (route.name === 'Trực tiếp') {
        directFails++;
        if (directFails === 2) console.log('\n   ⚠ Kết nối trực tiếp tới dantri bị chặn/hết giờ -> chuyển sang proxy công cộng');
      }
      errors.push(`${route.name}: ${e.message}`);
    }
  }
  await sleep(2000);
  throw new Error(errors.join(' | '));
}

const toDoc = (html) => new DOMParser().parseFromString(html, 'text/html');

/** Chạy hàng đợi với số luồng giới hạn */
async function pool(items, n, worker) {
  const out = [];
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  return out;
}

async function crawlMenu() {
  try {
    const doc = toDoc(await fetchHtml(BASE));
    const menu = P.parseMenu(doc, BASE);
    const count = menu.filter((m) => m.type === 'category').length;
    if (count >= 8) {
      console.log(`✔ Menu: ${count} chuyên mục cấp 1, ${menu.reduce((s, m) => s + (m.children || []).length, 0)} chuyên mục con`);
      return menu;
    }
    console.warn('⚠ Không nhận diện đủ menu từ trang chủ, dùng data/menu.json có sẵn');
  } catch (e) {
    console.warn('⚠ Lỗi tải trang chủ:', e.message, '- dùng data/menu.json có sẵn');
  }
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'menu.json'), 'utf8')).menu;
}

/** Lấy danh sách URL bài của 1 chuyên mục (trang 1, nếu thiếu thì sang trang 2, 3) */
async function collectUrls(cat, need) {
  const urls = [];
  for (let page = 1; page <= 3 && urls.length < need; page++) {
    const pageUrl = page === 1 ? cat.url : cat.url.replace(/\.htm$/, `/trang-${page}.htm`);
    try {
      const list = P.parseCategoryList(toDoc(await fetchHtml(pageUrl)), pageUrl);
      list.forEach((u) => { if (!urls.includes(u)) urls.push(u); });
    } catch (e) {
      console.warn(`   ⚠ ${pageUrl}: ${e.message}`);
      break;
    }
  }
  return urls;
}

async function main() {
  console.log('== Crawl dantri.com.vn ==');
  const menu = await crawlMenu();

  let targets = [];
  menu.forEach((m) => {
    if (m.type !== 'category' || m.id === 'latest') return; // "Mới nhất" = tất cả bài, không cần crawl riêng
    targets.push(m);
    if (WITH_CHILDREN) (m.children || []).forEach((c) => targets.push(c));
  });
  if (ONLY) targets = targets.filter((t) => ONLY.includes(t.id));

  // Giữ lại bài cũ (nếu có) để chạy nhiều lần không mất dữ liệu
  const postsFile = path.join(DATA_DIR, 'posts.json');
  const posts = new Map();
  if (fs.existsSync(postsFile)) {
    try { JSON.parse(fs.readFileSync(postsFile, 'utf8')).posts.forEach((p) => posts.set(p.id, p)); } catch (e) { }
  }

  /** Ghi dữ liệu ra file — gọi sau MỖI chuyên mục để lỡ dừng giữa chừng không mất dữ liệu */
  function saveAll() {
    const list = Array.from(posts.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const now = new Date().toISOString();
    fs.writeFileSync(path.join(DATA_DIR, 'menu.json'), JSON.stringify({ source: 'dantri.com.vn', crawledAt: now, menu }, null, 2));
    fs.writeFileSync(postsFile, JSON.stringify({ source: 'dantri.com.vn', crawledAt: now, total: list.length, posts: list }, null, 2));
    fs.writeFileSync(
      path.join(DATA_DIR, 'seed.js'),
      `// File tự sinh bởi tools/crawl-dantri.js — cho phép mở index.html trực tiếp không cần server\n` +
      `window.SEED_MENU = ${JSON.stringify(menu)};\nwindow.SEED_POSTS = ${JSON.stringify(list)};\n`
    );
    return list.length;
  }

  const FORCE = !!opt('force', false);
  let failStreak = 0;
  for (const cat of targets) {
    // Chạy lại: chuyên mục nào đã đủ bài thì bỏ qua (dùng --force để crawl lại)
    const have = Array.from(posts.values()).filter((p) => (p.categoryIds || []).includes(cat.id)).length;
    if (have >= LIMIT && !FORCE) {
      console.log(`✓ ${cat.title} (${cat.id}) — đã có ${have} bài, bỏ qua`);
      continue;
    }
    process.stdout.write(`→ ${cat.title} (${cat.id}) ... `);
    const urls = await collectUrls(cat, LIMIT + 5);
    if (!urls.length) {
      failStreak++;
      console.log(' không lấy được danh sách bài');
      if (failStreak >= 3) {
        console.log('\n✗ 3 chuyên mục liên tiếp không tải được -> dừng lại.');
        console.log('  Kiểm tra: mở https://dantri.com.vn trên trình duyệt xem có vào được không.');
        console.log('  Nếu vào được: có thể dantri đang tạm chặn do crawl nhiều -> chờ 15–30 phút rồi chạy lại.');
        break;
      }
      continue;
    }
    failStreak = 0;
    let ok = 0;
    // Bài đã crawl trước đó (vd. từ chuyên mục cha) -> chỉ gắn thêm id chuyên mục, KHÔNG tải lại
    const byUrl = new Map(Array.from(posts.values()).map((p) => [p.url, p]));
    const todo = [];
    for (const url of urls) {
      const existing = byUrl.get(url);
      if (existing && ok < LIMIT) {
        if (!existing.categoryIds.includes(cat.id)) existing.categoryIds.push(cat.id);
        process.stdout.write('+'); // + = bài có sẵn, đã gắn nhãn chuyên mục
        ok++;
      } else if (!existing) {
        todo.push(url);
      }
    }
    // crawl theo từng đợt cho tới khi đủ LIMIT bài hợp lệ
    let i = 0;
    while (i < todo.length && ok < LIMIT) {
      const batch = todo.slice(i, i + Math.min(CONCURRENCY, LIMIT - ok));
      i += batch.length;
      const results = await pool(batch, CONCURRENCY, async (url) => {
        try {
          const post = P.parseArticle(toDoc(await fetchHtml(url)), url, menu);
          const valid = P.isValidPost(post);
          process.stdout.write(valid ? '.' : 'x'); // . = bài hợp lệ, x = bỏ qua
          return valid ? post : null;
        } catch (e) { process.stdout.write('x'); return null; }
      });
      results.filter(Boolean).forEach((post) => {
        const old = posts.get(post.id);
        // Gắn thêm chuyên mục đang crawl (quan trọng với chuyên mục con)
        const ids = new Set([...(old ? old.categoryIds : []), ...post.categoryIds, cat.id]);
        post.categoryIds = Array.from(ids);
        posts.set(post.id, post);
        ok++;
      });
      await sleep(1000); // nghỉ 1 giây giữa các đợt -> lịch sự với máy chủ, tránh bị chặn
    }
    console.log(` ${ok}/${LIMIT} bài (tìm thấy ${urls.length} link)`);
    saveAll();
  }

  console.log(`\n✔ Đã lưu ${saveAll()} bài viết vào data/posts.json và data/seed.js`);
}

main().catch((e) => { console.error(e); process.exit(1); });
