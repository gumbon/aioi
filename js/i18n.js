/**
 * AIO Indicator — i18n engine
 * Supports: en, vi, ja, ko
 * Uses data-i18n="key" for text, data-i18n-html="key" for HTML content
 * Language stored in localStorage and URL param ?lang=XX
 */
(function () {
  'use strict';

  var LANGS = ['en', 'vi', 'ja', 'ko'];
  var STORAGE_KEY = 'aio_lang';
  var _current = 'en';
  var _translations = {};
  var _cache = {};

  /* ---- path helper ---- */
  function getBase() {
    var path = window.location.pathname;
    // Count directory depth relative to site root
    var parts = path.replace(/\/[^/]*$/, '').split('/').filter(Boolean);
    // In GitHub Pages the site root is at domain root, so depth = parts.length
    var depth = parts.length;
    if (depth === 0) return './';
    return '../'.repeat(depth);
  }

  /* ---- language detection ---- */
  function detectLang() {
    var param = new URLSearchParams(window.location.search).get('lang');
    if (param && LANGS.indexOf(param) !== -1) return param;
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANGS.indexOf(stored) !== -1) return stored;
    var browser = (navigator.language || navigator.userLanguage || 'en').split('-')[0].toLowerCase();
    if (LANGS.indexOf(browser) !== -1) return browser;
    return 'en';
  }

  /* ---- load locale JSON ---- */
  function loadLocale(lang) {
    if (_cache[lang]) return Promise.resolve(_cache[lang]);
    var base = getBase();
    var url = base + 'locales/' + lang + '.json';
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (t) {
        _cache[lang] = t;
        return t;
      })
      .catch(function (e) {
        console.warn('[AIOi18n] Failed to load locale "' + lang + '":', e);
        return {};
      });
  }

  /* ---- nested key accessor ---- */
  function get(obj, key) {
    return key.split('.').reduce(function (o, k) {
      return o && o[k] !== undefined ? o[k] : undefined;
    }, obj);
  }

  /* ---- apply translations to DOM ---- */
  function applyTranslations(t) {
    // Ensure t is a valid object
    if (!t || typeof t !== 'object') t = {};
    
    // data-i18n-html: set innerHTML (process first to avoid selector interference)
    try {
      document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
        var keyStr = el.getAttribute('data-i18n-html');
        if (keyStr) {
          var val = get(t, keyStr);
          if (val !== undefined && val !== null) {
            el.innerHTML = val;
          }
        }
      });
    } catch (e) {
      console.warn('[AIOi18n] Error applying data-i18n-html:', e);
    }
    
    // data-i18n: set textContent
    try {
      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        var keyStr = el.getAttribute('data-i18n');
        if (keyStr) {
          var val = get(t, keyStr);
          if (val !== undefined && val !== null) {
            el.textContent = val;
          }
        }
      });
    } catch (e) {
      console.warn('[AIOi18n] Error applying data-i18n:', e);
    }
    
    // data-i18n-placeholder: set placeholder attribute
    try {
      document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
        var keyStr = el.getAttribute('data-i18n-placeholder');
        if (keyStr) {
          var val = get(t, keyStr);
          if (val !== undefined && val !== null) {
            el.placeholder = val;
          }
        }
      });
    } catch (e) {
      console.warn('[AIOi18n] Error applying data-i18n-placeholder:', e);
    }
    
    // data-i18n-title: set title attribute
    try {
      document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
        var keyStr = el.getAttribute('data-i18n-title');
        if (keyStr) {
          var val = get(t, keyStr);
          if (val !== undefined && val !== null) {
            el.title = val;
          }
        }
      });
    } catch (e) {
      console.warn('[AIOi18n] Error applying data-i18n-title:', e);
    }
  }

  /* ---- update language switcher UI ---- */
  function updateSwitcherUI(lang) {
    // Mark active button
    document.querySelectorAll('[data-lang-btn]').forEach(function (btn) {
      var isActive = btn.getAttribute('data-lang-btn') === lang;
      btn.classList.toggle('active', isActive);
      if (isActive) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
    // Update current language display
    var flags = { en: '🇬🇧', vi: '🇻🇳', ja: '🇯🇵', ko: '🇰🇷' };
    var names = { en: 'EN', vi: 'VI', ja: '日本語', ko: '한국어' };
    document.querySelectorAll('.lang-switcher-current').forEach(function (el) {
      el.textContent = (flags[lang] || '') + '\u00A0' + (names[lang] || lang.toUpperCase());
    });
  }

  /* ---- blog article language notice ---- */
  function updateBlogNotice(lang) {
    if (!document.querySelector('.article-body')) return;
    var existing = document.getElementById('aio-lang-notice');
    if (lang === 'en') {
      if (existing) existing.remove();
      return;
    }
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'aio-lang-notice';
      existing.className = 'lang-notice-banner container';
      existing.style.marginTop = '90px';
      var articleSection = document.querySelector('.article-content-section');
      if (articleSection) {
        articleSection.parentNode.insertBefore(existing, articleSection);
      } else {
        var nav = document.querySelector('nav');
        if (nav && nav.nextSibling) nav.parentNode.insertBefore(existing, nav.nextSibling);
        else document.body.prepend(existing);
      }
    }
    var msgs = {
      vi: 'Bài viết này được viết bằng tiếng Anh.',
      ja: 'この記事は英語で書かれています。',
      ko: '이 기사는 영어로 작성되었습니다.'
    };
    var linkTexts = {
      vi: 'Dịch với Google Translate',
      ja: 'Google翻訳で読む',
      ko: 'Google 번역으로 읽기'
    };
    var tl = { vi: 'vi', ja: 'ja', ko: 'ko' };
    var pageUrl = encodeURIComponent(window.location.href.split('?')[0]);
    existing.innerHTML =
      '<i class="bi bi-translate"></i>' +
      '<span>' + (msgs[lang] || 'This article is in English.') + ' ' +
      '<a href="https://translate.google.com/translate?sl=en&tl=' + (tl[lang] || lang) + '&u=' + pageUrl + '" target="_blank" rel="noopener">' +
      (linkTexts[lang] || 'Translate with Google') + ' \u2197</a></span>';
  }

  /* ---- switch language ---- */
  function switchLang(lang) {
    if (LANGS.indexOf(lang) === -1) return;
    _current = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    // Update URL without page reload
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('lang', lang);
      window.history.replaceState(null, '', url.toString());
    } catch (e) { /* ignore */ }
    document.documentElement.lang = lang;
    loadLocale(lang).then(function (t) {
      _translations = t;
      applyTranslations(t);
      updateSwitcherUI(lang);
      updateBlogNotice(lang);
    });
  }

  /* ---- init ---- */
  function init() {
    var lang = detectLang();
    _current = lang;
    document.documentElement.lang = lang;

    // Wire up click handlers via event delegation
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-lang-btn]');
      if (btn) {
        e.preventDefault();
        switchLang(btn.getAttribute('data-lang-btn'));
      }
    });

    // Always load and apply locale, even for EN
    loadLocale(lang).then(function (t) {
      if (t && typeof t === 'object' && Object.keys(t).length > 0) {
        _translations = t;
        applyTranslations(t);
      } else if (lang !== 'en') {
        console.warn('[AIOi18n] Locale for ' + lang + ' is empty, trying again...');
        // Retry if loading failed
        _cache[lang] = undefined;
        loadLocale(lang).then(function (t2) {
          _translations = t2 || {};
          applyTranslations(t2 || {});
        });
        updateSwitcherUI(lang);
        return;
      }
      updateSwitcherUI(lang);
      updateBlogNotice(lang);
    }).catch(function (err) {
      console.error('[AIOi18n] Failed to initialize language:', err);
      updateSwitcherUI(lang);
    });
  }

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API
  window.AIOi18n = {
    switch: switchLang,
    get current() { return _current; },
    get translations() { return _translations; }
  };
})();
