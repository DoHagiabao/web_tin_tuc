#!/usr/bin/env node
/**
 * fix-data.js — Sửa dữ liệu đã crawl mà KHÔNG cần crawl lại
 * ---------------------------------------------------------------------------
 * Bản crawler cũ có thể lấy nhầm ngày giờ làm excerpt ("Thứ ba, 20/10/2026 - 21:13").
 * Script này bỏ phần ngày giờ; nếu không còn gì thì lấy đoạn đầu nội dung làm tóm tắt.
 *
 * Chạy:  node tools/fix-data.js
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const postsFile = path.join(DATA_DIR, 'posts.json');
const DATE_PREFIX = /^((Thứ\s+\S+|Chủ nhật),?\s*)?\d{1,2}\/\d{1,2}\/\d{4}\s*[-–]?\s*(\d{1,2}:\d{2})?\s*/i;

function fixExcerpt(p) {
  let ex = String(p.excerpt || '').replace(DATE_PREFIX, '').replace(/^\((Dân trí|Dantri)\)\s*[-–—:]\s*/i, '').trim();
  if (ex.length < 40) {
    const firstPara = String(p.content || '').split(/\n+/).map((s) => s.trim()).find((s) => s.length >= 40) || '';
    ex = firstPara.length > 220 ? firstPara.slice(0, firstPara.lastIndexOf(' ', 215)) + '…' : firstPara;
  }
  return ex || p.excerpt;
}

const data = JSON.parse(fs.readFileSync(postsFile, 'utf8'));
let n = 0;
data.posts.forEach((p) => {
  const ex = fixExcerpt(p);
  if (ex !== p.excerpt) { p.excerpt = ex; n++; }
});
fs.writeFileSync(postsFile, JSON.stringify(data, null, 2));

const menu = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'menu.json'), 'utf8')).menu;
fs.writeFileSync(
  path.join(DATA_DIR, 'seed.js'),
  `// File tự sinh bởi tools/crawl-dantri.js — cho phép mở index.html trực tiếp không cần server\n` +
    `window.SEED_MENU = ${JSON.stringify(menu)};\nwindow.SEED_POSTS = ${JSON.stringify(data.posts)};\n`
);
console.log(`✔ Đã sửa excerpt cho ${n}/${data.posts.length} bài (data/posts.json + data/seed.js)`);
