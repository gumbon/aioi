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
    if (lang === 'en' && Object.keys(_translations).length > 0 && _current === 'en') {
      return Promise.resolve({});
    }
    var base = getBase();
    var url = base + 'locales/' + lang + '.json';
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
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
    // data-i18n: set textContent
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var val = get(t, el.getAttribute('data-i18n'));
      if (val !== undefined) el.textContent = val;
    });
    // data-i18n-html: set innerHTML
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var val = get(t, el.getAttribute('data-i18n-html'));
      if (val !== undefined) el.innerHTML = val;
    });
    // data-i18n-placeholder: set placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var val = get(t, el.getAttribute('data-i18n-placeholder'));
      if (val !== undefined) el.placeholder = val;
    });
    // data-i18n-title: set title attribute
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var val = get(t, el.getAttribute('data-i18n-title'));
      if (val !== undefined) el.title = val;
    });
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

    if (lang === 'en') {
      updateSwitcherUI(lang);
      return;
    }

    loadLocale(lang).then(function (t) {
      _translations = t;
      applyTranslations(t);
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
