#!/usr/bin/env node
/**
 * gen-rss.js — build blog/feed.xml from the English blog index cards.
 * Good for SEO discovery and for readers who subscribe (retention).
 *
 * Usage: node scripts/gen-rss.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BLOG = path.join(ROOT, 'blog');
const SITE = 'https://aioindicator.com';
const MAX_ITEMS = 50;

const html = fs.readFileSync(path.join(BLOG, 'index.html'), 'utf8');

// Each card: link, category, title, excerpt, date.
const re = /<a href="([^"]+\.html)" class="blog-card-link">[\s\S]*?<div class="blog-card-tag"[^>]*>([^<]+)<\/div>\s*<h2 class="blog-card-title">([\s\S]*?)<\/h2>\s*<p class="blog-card-excerpt">([\s\S]*?)<\/p>[\s\S]*?<i class="bi bi-calendar3"><\/i>\s*([^<]+)<\/span>/g;

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function rfc822(dateStr) {
  // "Jun 6, 2026"
  const m = dateStr.trim().match(/([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})/);
  if (!m) return new Date(0).toUTCString();
  return new Date(Date.UTC(+m[3], MONTHS[m[1]] ?? 0, +m[2], 12)).toUTCString();
}
function esc(s) {
  return String(s).replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// Strip existing entities/tags down to plain text for description.
function plain(s) {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&mdash;/g, '—')
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&[a-z]+;/g, ' ').trim();
}

const items = [];
let m;
while ((m = re.exec(html)) && items.length < MAX_ITEMS) {
  const link = SITE + '/blog/' + m[1];
  items.push({
    link,
    category: m[2].trim(),
    title: plain(m[3]),
    desc: plain(m[4]),
    pubDate: rfc822(m[5]),
  });
}

const now = new Date().toUTCString();
const out = [];
out.push('<?xml version="1.0" encoding="UTF-8"?>');
out.push('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">');
out.push('  <channel>');
out.push('    <title>AIO Indicator Blog — Smart Money &amp; Price Action</title>');
out.push('    <link>' + SITE + '/blog/</link>');
out.push('    <description>In-depth guides on market structure, ICT concepts, liquidity, order flow, and institutional trading strategies.</description>');
out.push('    <language>en</language>');
out.push('    <lastBuildDate>' + now + '</lastBuildDate>');
out.push('    <atom:link href="' + SITE + '/blog/feed.xml" rel="self" type="application/rss+xml" />');
for (const it of items) {
  out.push('    <item>');
  out.push('      <title>' + esc(it.title) + '</title>');
  out.push('      <link>' + it.link + '</link>');
  out.push('      <guid isPermaLink="true">' + it.link + '</guid>');
  out.push('      <category>' + esc(it.category) + '</category>');
  out.push('      <description>' + esc(it.desc) + '</description>');
  out.push('      <pubDate>' + it.pubDate + '</pubDate>');
  out.push('    </item>');
}
out.push('  </channel>');
out.push('</rss>');
out.push('');

fs.writeFileSync(path.join(BLOG, 'feed.xml'), out.join('\n'), 'utf8');
console.log('blog/feed.xml generated: ' + items.length + ' items');
