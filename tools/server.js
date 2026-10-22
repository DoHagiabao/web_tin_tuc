#!/usr/bin/env node
/**
 * server.js — Web server tĩnh + proxy lấy HTML (không cần cài thêm thư viện)
 * ---------------------------------------------------------------------------
 * Vì sao cần proxy? Trình duyệt chặn JavaScript đọc HTML của website khác (chính sách CORS).
 * Trang Crawler gọi  /api/fetch?url=<link bài viết>  -> server này tải hộ rồi trả HTML về.
 *
 * Chạy:  node tools/server.js   rồi mở  http://localhost:3000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

async function proxy(req, res, target) {
  let url;
  try { url = new URL(target); } catch (e) { res.writeHead(400); return res.end('URL không hợp lệ'); }
  if (!/^https?:$/.test(url.protocol)) { res.writeHead(400); return res.end('Chỉ hỗ trợ http/https'); }
  try {
    const r = await fetch(url.href, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept-Language': 'vi-VN,vi;q=0.9' },
    });
    const html = await r.text();
    res.writeHead(r.status, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(html);
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Không tải được trang: ' + e.message);
  }
}

http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  if (u.pathname === '/api/fetch') return proxy(req, res, u.searchParams.get('url'));

  let file = path.normalize(path.join(ROOT, decodeURIComponent(u.pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`▶ Website: http://localhost:${PORT}`));
