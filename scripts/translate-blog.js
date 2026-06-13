#!/usr/bin/env node
/**
 * translate-blog.js — generate static localized copies of every English blog
 * post so search engines index real translated content (not client-side swaps).
 *
 * Strategy
 *   Source : blog/<slug>.html            (English, the canonical source)
 *   Output : blog/<slug>.<lang>.html      (sibling file — same dir depth, so
 *                                           ../css ../js ../locales ../assets
 *                                           relative paths keep working)
 *   Every version (incl. English) gets a full rel="alternate" hreflang cluster.
 *
 * Idempotent: each generated file embeds a hash of the source's translatable
 * content. Re-runs skip files whose source is unchanged (override with --force).
 *
 * Usage
 *   ANTHROPIC_API_KEY=sk-... node scripts/translate-blog.js
 *   node scripts/translate-blog.js --langs vi,ja --only how-to-use-aio-rsi
 *   node scripts/translate-blog.js --dry-run         # list work, no API calls
 *   node scripts/translate-blog.js --force           # re-translate everything
 *
 * Env: ANTHROPIC_API_KEY (required unless --dry-run), TRANSLATE_MODEL
 *      (default claude-sonnet-4-6), TRANSLATE_CONCURRENCY (default 4).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'blog');
const SITE = 'https://aioindicator.com';
const ALL_LANGS = ['vi', 'ja', 'ko', 'zh', 'hi'];
const LANG_NAMES = { en: 'English', vi: 'Vietnamese', ja: 'Japanese', ko: 'Korean', zh: 'Simplified Chinese', hi: 'Hindi' };
const HTML_LANG_ATTR = { en: 'en', vi: 'vi', ja: 'ja', ko: 'ko', zh: 'zh-Hans', hi: 'hi' };
const HREFLANG = { en: 'en', vi: 'vi', ja: 'ja', ko: 'ko', zh: 'zh-Hans', hi: 'hi' };

const MODEL = process.env.TRANSLATE_MODEL || 'claude-sonnet-4-6';
const CONCURRENCY = parseInt(process.env.TRANSLATE_CONCURRENCY || '4', 10);
const API_KEY = process.env.ANTHROPIC_API_KEY;

// ---- CLI ----
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i !== -1 ? argv[i + 1] : null; };
const DRY = has('--dry-run');
const FORCE = has('--force');
const LANGS = (val('--langs') || ALL_LANGS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const ONLY = val('--only');

const LANG_RE = new RegExp('\\.(' + ALL_LANGS.join('|') + ')\\.html$');

// ---- helpers ----
function listSources() {
  return fs.readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.html') && f !== 'index.html' && !LANG_RE.test(f))
    .filter((f) => !ONLY || f === ONLY + '.html')
    .map((f) => path.join(BLOG_DIR, f));
}

function slugOf(file) { return path.basename(file).replace(/\.html$/, ''); }
function outPath(slug, lang) { return path.join(BLOG_DIR, slug + '.' + lang + '.html'); }
function urlOf(slug, lang) { return SITE + '/blog/' + slug + (lang === 'en' ? '' : '.' + lang) + '.html'; }

const RE = {
  title: /<title>([\s\S]*?)<\/title>/,
  desc: /<meta name="description" content="([^"]*)"/,
  keywords: /<meta name="keywords" content="([^"]*)"/,
  ogTitle: /<meta property="og:title" content="([^"]*)"/,
  ogDesc: /<meta property="og:description" content="([^"]*)"/,
  twTitle: /<meta name="twitter:title" content="([^"]*)"/,
  twDesc: /<meta name="twitter:description" content="([^"]*)"/,
  h1: /<h1 class="article-title">([\s\S]*?)<\/h1>/,
  body: /(<div class="article-body">)([\s\S]*?)(<\/div><\/div><\/div><\/div>\s*<\/section>)/,
};

function extract(html) {
  const g = (re) => { const m = html.match(re); return m ? m[1] : null; };
  return {
    title: g(RE.title), desc: g(RE.desc), keywords: g(RE.keywords),
    ogTitle: g(RE.ogTitle), ogDesc: g(RE.ogDesc),
    twTitle: g(RE.twTitle), twDesc: g(RE.twDesc),
    h1: g(RE.h1), body: g(RE.body) ? html.match(RE.body)[2] : null,
  };
}

function sourceHash(parts) {
  return crypto.createHash('sha256')
    .update([parts.title, parts.desc, parts.h1, parts.body].join(''))
    .digest('hex').slice(0, 16);
}

function buildHreflang(slug) {
  const lines = ['<!-- aio-hreflang-start -->'];
  for (const l of ['en', ...ALL_LANGS]) {
    lines.push('    <link rel="alternate" hreflang="' + HREFLANG[l] + '" href="' + urlOf(slug, l) + '" />');
  }
  lines.push('    <link rel="alternate" hreflang="x-default" href="' + urlOf(slug, 'en') + '" />');
  lines.push('    <!-- aio-hreflang-end -->');
  return lines.join('\n');
}

function injectHreflang(html, slug) {
  const block = buildHreflang(slug);
  if (/<!-- aio-hreflang-start -->[\s\S]*?<!-- aio-hreflang-end -->/.test(html)) {
    return html.replace(/<!-- aio-hreflang-start -->[\s\S]*?<!-- aio-hreflang-end -->/, block);
  }
  return html.replace(/<\/head>/, block + '\n  </head>');
}

// ---- Anthropic API ----
async function translateUnits(parts, lang) {
  // Offline smoke-test: skip the API, echo source back (validates assembly).
  if (process.env.TRANSLATE_MOCK) {
    return {
      meta: {
        title: parts.title, meta_description: parts.desc, meta_keywords: parts.keywords,
        og_title: parts.ogTitle, og_description: parts.ogDesc,
        twitter_title: parts.twTitle, twitter_description: parts.twDesc,
        article_title_html: parts.h1,
      },
      body: parts.body,
    };
  }
  const meta = {
    title: parts.title, meta_description: parts.desc, meta_keywords: parts.keywords,
    og_title: parts.ogTitle, og_description: parts.ogDesc,
    twitter_title: parts.twTitle, twitter_description: parts.twDesc,
    article_title_html: parts.h1,
  };
  const prompt =
    'You are a professional financial-trading translator. Translate the following website content from English into ' + LANG_NAMES[lang] + '.\n\n' +
    'RULES:\n' +
    '- Keep ALL HTML tags, attributes, classes, and href/src values EXACTLY as-is. Translate only human-readable text between tags and inside meta content values.\n' +
    '- Do NOT translate brand/product names or tickers: AIO Indicator, AIO Terminal, TradingView, Binance, PayPal, Telegram, X. Keep technical acronyms as-is (BOS, CHoCH, CVD, OI, TP, SL, PH, PL, RSI, VWAP, ICT, TPO, DOM, ATR, OBV, MFI, MACD, DR, IDR, ITC).\n' +
    '- Keep numbers, prices ($), percentages, URLs, and code/symbols unchanged.\n' +
    '- Natural, fluent, professional tone for active traders. Preserve HTML entities (&amp; &mdash; etc.).\n' +
    '- Preserve any data-i18n attributes verbatim.\n\n' +
    'Return EXACTLY this format and nothing else:\n' +
    '===META===\n' +
    '<a single-line JSON object with the SAME keys as the input META JSON, values translated>\n' +
    '===BODY===\n' +
    '<the translated BODY HTML, raw, no code fences>\n' +
    '===END===\n\n' +
    'META JSON:\n' + JSON.stringify(meta) + '\n\n' +
    'BODY HTML:\n' + parts.body + '\n';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16384,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error('API ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  if (data.stop_reason === 'max_tokens') throw new Error('response truncated (max_tokens) — article too long');
  const text = (data.content || []).map((c) => c.text || '').join('');

  const mMeta = text.match(/===META===\s*([\s\S]*?)\s*===BODY===/);
  const mBody = text.match(/===BODY===\s*([\s\S]*?)\s*===END===/);
  if (!mMeta || !mBody) throw new Error('unexpected response format');
  let metaOut;
  try { metaOut = JSON.parse(mMeta[1].trim()); }
  catch (e) { throw new Error('META JSON parse failed: ' + e.message); }
  return { meta: metaOut, body: mBody[1] };
}

function setAttr(html, re, replacement) {
  return re.test(html) ? html.replace(re, replacement) : html;
}

function buildTranslated(srcHtml, slug, lang, t, hash) {
  let h = srcHtml;
  // language attributes
  h = h.replace(/<html[^>]*>/, '<html lang="' + HTML_LANG_ATTR[lang] + '" data-page-lang="' + lang + '">');
  // embed source hash for idempotency (right after <html ...>)
  h = h.replace(/(<html[^>]*>)/, '$1\n<!-- aio-tx ' + hash + ' -->');
  // head fields
  const m = t.meta;
  h = setAttr(h, RE.title, '<title>' + m.title + '</title>');
  h = setAttr(h, RE.desc, '<meta name="description" content="' + m.meta_description + '"');
  if (m.meta_keywords) h = setAttr(h, RE.keywords, '<meta name="keywords" content="' + m.meta_keywords + '"');
  h = setAttr(h, RE.ogTitle, '<meta property="og:title" content="' + m.og_title + '"');
  h = setAttr(h, RE.ogDesc, '<meta property="og:description" content="' + m.og_description + '"');
  h = setAttr(h, RE.twTitle, '<meta name="twitter:title" content="' + m.twitter_title + '"');
  h = setAttr(h, RE.twDesc, '<meta name="twitter:description" content="' + m.twitter_description + '"');
  h = setAttr(h, RE.h1, '<h1 class="article-title">' + m.article_title_html + '</h1>');
  // canonical + og:url → localized self
  h = h.replace(/<link rel="canonical" href="[^"]*"/, '<link rel="canonical" href="' + urlOf(slug, lang) + '"');
  h = h.replace(/<meta property="og:url" content="[^"]*"/, '<meta property="og:url" content="' + urlOf(slug, lang) + '"');
  // JSON-LD headline/description (first occurrences)
  h = h.replace(/("headline":\s*")(?:[^"\\]|\\.)*(")/, '$1' + jsonEsc(t.meta.og_title || t.meta.title) + '$2');
  h = h.replace(/("description":\s*")(?:[^"\\]|\\.)*(")/, '$1' + jsonEsc(t.meta.meta_description) + '$2');
  // body
  h = h.replace(RE.body, (full, open, _body, close) => open + t.body + close);
  // hreflang cluster
  h = injectHreflang(h, slug);
  return h;
}

function jsonEsc(s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

function existingHash(file) {
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, 'utf8').match(/<!-- aio-tx ([0-9a-f]{16}) -->/);
  return m ? m[1] : null;
}

async function pool(items, n, worker) {
  const results = []; let i = 0;
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; results[idx] = await worker(items[idx], idx); }
  });
  await Promise.all(runners);
  return results;
}

(async function main() {
  const sources = listSources();
  if (!sources.length) { console.log('No source blog posts found.'); return; }

  // Always (re)inject hreflang into EN sources so they advertise alternates.
  let enUpdated = 0;
  for (const file of sources) {
    const slug = slugOf(file);
    let html = fs.readFileSync(file, 'utf8');
    const next = injectHreflang(html, slug);
    if (next !== html && !DRY) { fs.writeFileSync(file, next, 'utf8'); enUpdated++; }
  }
  console.log('EN sources hreflang updated: ' + (DRY ? '(dry-run)' : enUpdated));

  // Build work list (file × lang) needing (re)translation.
  const jobs = [];
  for (const file of sources) {
    const slug = slugOf(file);
    const src = fs.readFileSync(file, 'utf8');
    const parts = extract(src);
    if (!parts.body || !parts.title) { console.warn('SKIP (no body/title): ' + slug); continue; }
    const hash = sourceHash(parts);
    for (const lang of LANGS) {
      const out = outPath(slug, lang);
      if (!FORCE && existingHash(out) === hash) continue;
      jobs.push({ file, slug, lang, src, parts, hash, out });
    }
  }

  console.log('Pending translations: ' + jobs.length + ' (' + sources.length + ' posts × ' + LANGS.length + ' langs)');
  if (DRY) { jobs.forEach((j) => console.log('  would translate ' + j.slug + ' -> ' + j.lang)); return; }
  if (!jobs.length) { console.log('Everything up to date.'); return; }
  if (!API_KEY && !process.env.TRANSLATE_MOCK) { console.error('ERROR: ANTHROPIC_API_KEY not set. Use --dry-run to preview.'); process.exit(1); }

  let done = 0, failed = 0;
  await pool(jobs, CONCURRENCY, async (j) => {
    try {
      const t = await translateUnits(j.parts, j.lang);
      const html = buildTranslated(j.src, j.slug, j.lang, t, j.hash);
      fs.writeFileSync(j.out, html, 'utf8');
      done++;
      console.log('  [' + done + '/' + jobs.length + '] ' + j.slug + '.' + j.lang + '.html');
    } catch (e) {
      failed++;
      console.error('  FAIL ' + j.slug + '.' + j.lang + ': ' + e.message);
    }
  });
  console.log('Done. translated=' + done + ' failed=' + failed);
  if (failed) process.exit(1);
})();
