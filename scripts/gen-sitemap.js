#!/usr/bin/env node
/**
 * gen-sitemap.js — regenerate sitemap.xml from files actually on disk.
 *
 * - Scans main pages, /blog (incl. localized <slug>.<lang>.html), and /tools.
 * - Emits xhtml:link rel="alternate" hreflang clusters for blog posts, listing
 *   only the language versions that really exist (no 404s).
 * - Reuses existing <lastmod> per URL where present, else today.
 *
 * Usage: node scripts/gen-sitemap.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://aioindicator.com';
const ALL_LANGS = ['vi', 'ja', 'ko', 'zh', 'hi'];
const HREFLANG = { en: 'en', vi: 'vi', ja: 'ja', ko: 'ko', zh: 'zh-Hans', hi: 'hi' };
const LANG_RE = new RegExp('\\.(' + ALL_LANGS.join('|') + ')\\.html$');

const today = new Date().toISOString().slice(0, 10);

// Reuse lastmod from the current sitemap so unchanged URLs don't churn.
const prevLastmod = {};
const sitemapPath = path.join(ROOT, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  const re = /<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g;
  let m;
  while ((m = re.exec(xml))) prevLastmod[m[1]] = m[2];
}
const lastmod = (loc) => prevLastmod[loc] || today;

function url(loc, priority, changefreq, alternates) {
  let s = '  <url>\n    <loc>' + loc + '</loc>\n    <lastmod>' + lastmod(loc) + '</lastmod>\n' +
    '    <changefreq>' + changefreq + '</changefreq>\n    <priority>' + priority + '</priority>\n';
  if (alternates) {
    for (const a of alternates) s += '    <xhtml:link rel="alternate" hreflang="' + a.hreflang + '" href="' + a.href + '" />\n';
  }
  return s + '  </url>';
}

const out = [];
out.push('<?xml version="1.0" encoding="UTF-8"?>');
out.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
out.push('        xmlns:xhtml="http://www.w3.org/1999/xhtml">');
out.push('');
out.push('  <!-- ══ Main pages ══ -->');
out.push(url(SITE + '/', '1.0', 'weekly'));
if (fs.existsSync(path.join(ROOT, 'aio-terminal.html'))) out.push(url(SITE + '/aio-terminal.html', '0.95', 'weekly'));
if (fs.existsSync(path.join(ROOT, 'blog', 'index.html'))) out.push(url(SITE + '/blog/', '0.9', 'weekly'));

// Tools (interactive lead-magnet pages)
const toolsDir = path.join(ROOT, 'tools');
if (fs.existsSync(toolsDir)) {
  const tools = fs.readdirSync(toolsDir).filter((f) => f.endsWith('.html'));
  if (tools.length) {
    out.push('');
    out.push('  <!-- ══ Tools ══ -->');
    for (const f of tools.sort()) out.push(url(SITE + '/tools/' + f, '0.8', 'monthly'));
  }
}

// Blog posts (group by slug, attach hreflang for existing language versions)
const blogDir = path.join(ROOT, 'blog');
const files = fs.readdirSync(blogDir).filter((f) => f.endsWith('.html') && f !== 'index.html');
const bySlug = {};
for (const f of files) {
  const m = f.match(LANG_RE);
  const lang = m ? m[1] : 'en';
  const slug = f.replace(LANG_RE, '').replace(/\.html$/, '');
  (bySlug[slug] = bySlug[slug] || {})[lang] = f;
}

out.push('');
out.push('  <!-- ══ Blog posts ══ -->');
for (const slug of Object.keys(bySlug).sort()) {
  const langs = bySlug[slug];
  const present = ['en', ...ALL_LANGS].filter((l) => langs[l]);
  const hrefOf = (l) => SITE + '/blog/' + slug + (l === 'en' ? '' : '.' + l) + '.html';
  // Build alternate set once (shared by every version of this post).
  const alternates = present.length > 1
    ? present.map((l) => ({ hreflang: HREFLANG[l], href: hrefOf(l) }))
        .concat([{ hreflang: 'x-default', href: hrefOf('en') }])
    : null;
  for (const l of present) {
    out.push(url(hrefOf(l), l === 'en' ? '0.85' : '0.7', 'monthly', alternates));
  }
}

out.push('');
out.push('</urlset>');
out.push('');

fs.writeFileSync(sitemapPath, out.join('\n'), 'utf8');
const total = out.filter((l) => l.includes('<loc>')).length;
console.log('sitemap.xml regenerated: ' + total + ' URLs (' + Object.keys(bySlug).length + ' blog posts)');
