/* PepX site-wide sale: announcement bar + the live sale for price display.
   ----------------------------------------------------------------------------
   Loaded on every page, signed-in or not. It asks the server which site-wide
   sale (Admin Console -> Site-wide Sale) is live, shows the announcement bar
   above the header, and exposes the sale as window.PepxSale so script.js can
   show sale prices in the shop, cart and checkout.

   This file only decides what is DISPLAYED. The amount a customer is charged
   is always worked out again on the server when the order is placed.
   ------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (window.PepxSale) return;

  var CACHE_KEY = 'pepxSale.v1';
  var CACHE_MS = 5 * 60 * 1000;
  var current = null;
  var listeners = [];

  function valid(sale) {
    if (!sale || typeof sale !== 'object') return null;
    var percent = Number(sale.percent);
    if (!(percent > 0) || percent > 100) return null;
    if (sale.expires_at && new Date(sale.expires_at).getTime() < Date.now()) return null;
    return sale;
  }

  function readCache() {
    try {
      var raw = window.sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || Date.now() - Number(parsed.at || 0) > CACHE_MS) return null;
      return valid(parsed.sale);
    } catch (e) { return null; }
  }

  function writeCache(sale) {
    try {
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), sale: sale }));
    } catch (e) { /* private mode: the bar still works, just without the cache */ }
  }

  function signature(sale) {
    return sale ? [sale.id, sale.percent, sale.banner_text, sale.show_banner, sale.banner_scroll, sale.expires_at].join('|') : '';
  }

  function injectStyles() {
    if (document.getElementById('pepxSaleStyles')) return;
    var style = document.createElement('style');
    style.id = 'pepxSaleStyles';
    style.textContent = [
      '.sale-bar{background:linear-gradient(90deg,#16335e,#1c4379 50%,#16335e);color:#fff;text-align:center;',
      'font-size:14px;font-weight:700;letter-spacing:.03em;line-height:1.35;max-width:100%;overflow:hidden;',
      'padding:10px max(14px,env(safe-area-inset-right)) 10px max(14px,env(safe-area-inset-left));overflow-wrap:anywhere;}',
      '.sale-bar.is-scrolling{padding-left:0;padding-right:0;white-space:nowrap;text-align:left;}',
      '.sale-bar-track{display:inline-block;animation:pepxSaleScroll 28s linear infinite;will-change:transform;}',
      '.sale-bar-track span{display:inline-block;margin:0 36px;}',
      '.sale-bar.is-scrolling:hover .sale-bar-track{animation-play-state:paused;}',
      '@keyframes pepxSaleScroll{from{transform:translateX(0);}to{transform:translateX(-50%);}}',
      '@media(max-width:640px){.sale-bar{font-size:13px;padding-top:8px;padding-bottom:8px;}}',
      '@media(prefers-reduced-motion:reduce){.sale-bar.is-scrolling{white-space:normal;text-align:center;',
      'padding-left:14px;padding-right:14px;}.sale-bar-track{animation:none;display:block;}',
      '.sale-bar-track span{margin:0;}.sale-bar-track span+span{display:none;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function renderBar() {
    if (!document.body) return;
    var existing = document.getElementById('pepxSaleBar');
    var sale = current;
    var text = sale && sale.show_banner !== false ? String(sale.banner_text || '').trim() : '';
    // The admin console announces nothing to shoppers.
    if (!text || document.querySelector('.admin-wrap')) {
      if (existing) existing.parentNode.removeChild(existing);
      return;
    }

    injectStyles();
    var bar = existing || document.createElement('div');
    bar.id = 'pepxSaleBar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Sale announcement');
    bar.className = 'sale-bar' + (sale.banner_scroll ? ' is-scrolling' : '');
    bar.textContent = '';

    if (sale.banner_scroll) {
      // Two identical halves, so sliding by half the width loops seamlessly.
      var track = document.createElement('div');
      track.className = 'sale-bar-track';
      for (var i = 0; i < 12; i += 1) {
        var span = document.createElement('span');
        span.textContent = text;
        if (i > 0) span.setAttribute('aria-hidden', 'true');
        track.appendChild(span);
      }
      bar.appendChild(track);
    } else {
      bar.textContent = text;
    }

    if (!existing) {
      var header = document.querySelector('body > header') || document.querySelector('header');
      if (header && header.parentNode) {
        header.parentNode.insertBefore(bar, header);
      } else {
        document.body.insertBefore(bar, document.body.firstChild);
      }
    }
  }

  function setSale(sale, options) {
    var next = valid(sale);
    var changed = signature(next) !== signature(current);
    current = next;
    if (!options || options.cache !== false) writeCache(next);
    if (!changed) return;
    renderBar();
    listeners.slice().forEach(function (fn) {
      try { fn(current); } catch (e) { /* one listener must not stop the rest */ }
    });
  }

  var inFlight = null;
  function refresh() {
    if (inFlight) return inFlight;
    inFlight = fetch('/api/sale', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        // A failed request leaves the last known sale in place; the server
        // still decides the real price at checkout either way.
        if (data) setSale(data.sale || null);
        return current;
      })
      .catch(function () { return current; })
      .then(function (value) { inFlight = null; return value; });
    return inFlight;
  }

  function round2(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  window.PepxSale = {
    get: function () { current = valid(current); return current; },
    percent: function () { var s = this.get(); return s ? Number(s.percent) : 0; },
    /** A single price with the sale taken off (for display). */
    apply: function (amount) {
      var p = this.percent();
      return p ? Number(amount || 0) * (1 - p / 100) : Number(amount || 0);
    },
    /** What the sale takes off a cart subtotal. Same rounding as the server. */
    discountOn: function (subtotal) {
      var p = this.percent();
      var safe = round2(subtotal);
      if (!p || !(safe > 0)) return 0;
      return Math.min(round2((safe * p) / 100), safe);
    },
    label: function () {
      var s = this.get();
      if (!s) return '';
      return String(s.name || 'Sale') + ' (' + Number(Number(s.percent).toFixed(2)) + '% off)';
    },
    refresh: refresh,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
  };

  current = readCache();

  function start() {
    renderBar();
    refresh();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
