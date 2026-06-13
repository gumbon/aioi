#!/usr/bin/env node
/**
 * related-posts.js — append a "Related Articles" block to every blog post to
 * deepen internal linking (SEO) and lift pages-per-session (retention).
 *
 * - Catalog (slug → category, order) is parsed from blog/index.html cards.
 * - Relevance: same category first, then nearest neighbours, up to 4.
 * - Works on English and localized <slug>.<lang>.html files; links to the
 *   same-language version of each related post when it exists (else English),
 *   and shows that version's own title.
 * - Idempotent: replaces the marked block on re-run.
 *
 * Usage: node scripts/related-posts.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BLOG = path.join(ROOT, 'blog');
const ALL_LANGS = ['vi', 'ja', 'ko', 'zh', 'hi'];
const LANG_RE = new RegExp('\\.(' + ALL_LANGS.join('|') + ')\\.html$');
const MAX = 4;

const HEADING = {
  en: 'Related Articles', vi: 'Bài viết liên quan', ja: '関連記事',
  ko: '관련 기사', zh: '相关文章', hi: 'संबंधित लेख',
};

// ---- catalog from blog index ----
const indexHtml = fs.readFileSync(path.join(BLOG, 'index.html'), 'utf8');
const cardRe = /<a href="([^"]+\.html)" class="blog-card-link">[\s\S]*?<div class="blog-card-tag"[^>]*>([^<]+)<\/div>\s*<h2 class="blog-card-title">([\s\S]*?)<\/h2>/g;
const order = [];
const catBySlug = {};
let m;
while ((m = cardRe.exec(indexHtml))) {
  const slug = m[1].replace(/\.html$/, '');
  if (catBySlug[slug]) continue;
  catBySlug[slug] = m[2].trim();
  order.push(slug);
}

function relatedSlugs(slug) {
  const cat = catBySlug[slug];
  const picked = [];
  for (const s of order) if (s !== slug && catBySlug[s] === cat) picked.push(s);
  if (picked.length < MAX) {
    const idx = order.indexOf(slug);
    for (let d = 1; picked.length < MAX && d < order.length; d++) {
      for (const s of [order[idx - d], order[idx + d]]) {
        if (s && s !== slug && !picked.includes(s)) picked.push(s);
        if (picked.length >= MAX) break;
      }
    }
  }
  return picked.slice(0, MAX);
}

function fileFor(slug, lang) {
  const p = path.join(BLOG, slug + (lang === 'en' ? '' : '.' + lang) + '.html');
  return fs.existsSync(p) ? p : (lang === 'en' ? null : (fs.existsSync(path.join(BLOG, slug + '.html')) ? path.join(BLOG, slug + '.html') : null));
}

function titleOf(file) {
  const h = fs.readFileSync(file, 'utf8');
  const t = h.match(/<title>([\s\S]*?)<\/title>/);
  let s = t ? t[1] : '';
  s = s.replace(/\s*[|｜]\s*AIO Indicator.*$/, '').trim();
  if (!s) { const h1 = h.match(/<h1 class="article-title">([\s\S]*?)<\/h1>/); s = h1 ? h1[1].trim() : ''; }
  // Escape stray ampersands that aren't already part of an HTML entity.
  return s.replace(/&(?!amp;|lt;|gt;|quot;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
}

function hrefFor(slug, lang) {
  // relative within /blog
  const localized = slug + '.' + lang + '.html';
  if (lang !== 'en' && fs.existsSync(path.join(BLOG, localized))) return localized;
  return slug + '.html';
}

function block(slug, lang) {
  const rel = relatedSlugs(slug);
  if (!rel.length) return '';
  const cards = rel.map((rs) => {
    const f = fileFor(rs, lang);
    if (!f) return '';
    const title = titleOf(f);
    const href = hrefFor(rs, lang);
    const cat = catBySlug[rs] || '';
    return '      <a class="aio-related-card" href="' + href + '">' +
      '<span class="aio-related-cat">' + cat + '</span>' +
      '<span class="aio-related-title">' + title + '</span></a>';
  }).filter(Boolean).join('\n');
  if (!cards) return '';
  return [
    '<!-- aio-related-start -->',
    '<section class="aio-related"><div class="container"><div class="row justify-content-center"><div class="col-lg-8">',
    '    <h2 class="aio-related-heading">' + (HEADING[lang] || HEADING.en) + '</h2>',
    '    <div class="aio-related-grid">',
    cards,
    '    </div>',
    '</div></div></div></section>',
    '<!-- aio-related-end -->',
  ].join('\n');
}

function inject(html, blk) {
  if (!blk) return html;
  if (/<!-- aio-related-start -->[\s\S]*?<!-- aio-related-end -->/.test(html)) {
    return html.replace(/<!-- aio-related-start -->[\s\S]*?<!-- aio-related-end -->/, blk);
  }
  return html.replace(/(\s*)<footer class="modern-footer">/, '\n' + blk + '\n    <footer class="modern-footer">');
}

// ---- run ----
const files = fs.readdirSync(BLOG).filter((f) => f.endsWith('.html') && f !== 'index.html');
let updated = 0;
for (const f of files) {
  const lang = (f.match(LANG_RE) || [])[1] || 'en';
  const slug = f.replace(LANG_RE, '').replace(/\.html$/, '');
  if (!catBySlug[slug]) continue; // unknown post (not in index)
  const file = path.join(BLOG, f);
  const html = fs.readFileSync(file, 'utf8');
  const next = inject(html, block(slug, lang));
  if (next !== html) { fs.writeFileSync(file, next, 'utf8'); updated++; }
}
console.log('related-posts: updated ' + updated + ' / ' + files.length + ' files');
