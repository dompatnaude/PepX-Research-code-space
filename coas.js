/* PepX Research — public Certificates of Analysis page.
 *
 * Reads published reports from /api/coas (routes/coas.js) and shows:
 *   - a "Check your vial" batch lookup
 *   - a report library (latest batch per product + dose, earlier batches tucked under it)
 *   - an in-page viewer for the PDF / image served by /api/coas/:id/file
 *
 * Deep links (all still work):
 *   coas.html?id=12              opens report 12
 *   coas.html?batch=MC-260915-1  looks up a batch (use this in vial QR codes)
 *   coas.html?search=bpc         pre-fills the library search
 */
(function () {
  'use strict';

  var state = { all: [], search: '', sort: 'newest', unavailable: false, loaded: false };
  var SUPPORT_EMAIL = 'pepxaminos@gmail.com';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function fmtDate(d) {
    if (!d) return '';
    var p = String(d).split('T')[0].split('-');
    if (p.length !== 3) return String(d);
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return m[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10) + ', ' + p[0];
  }
  function dateKey(c) { return String(c.testDate || c.reportDate || c.publishedAt || '').slice(0, 10); }
  function fileUrl(c) { return '/api/coas/' + c.id + '/file'; }
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  var ICON = {
    check: '<path d="m5 12 5 5 9-10"/>',
    doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
    dl: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    vial: '<path d="M9 3h6M10 3v4l-3 3v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V10l-3-3V3"/><path d="M7 14h10"/>'
  };
  function svg(n) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + '</svg>';
  }
  function thumb(c, cls) {
    return c.productImageUrl
      ? '<img class="' + cls + '" src="' + esc(c.productImageUrl) + '" alt="" loading="lazy">'
      : '<span class="' + cls + ' cx-noimg">' + svg('vial') + '</span>';
  }

  /* ---------------- data ---------------- */

  // Pull every published report (the API pages at most 100 at a time).
  function fetchAll() {
    var out = [];
    function page(n) {
      return fetch('/api/coas?page_size=100&page=' + n, { credentials: 'include' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.unavailable) throw new Error('unavailable');
          out = out.concat((data && data.coas) || []);
          var pg = (data && data.pagination) || {};
          return n < (pg.totalPages || 1) && n < 20 ? page(n + 1) : out;
        });
    }
    return page(1);
  }

  // One card per product + dose; newest batch on top, earlier batches listed under it.
  function groups(list) {
    var map = {}, order = [];
    list.forEach(function (c) {
      var k = (c.productId || c.productName) + '|' + (c.variantId || c.variantName || '');
      if (!map[k]) { map[k] = []; order.push(k); }
      map[k].push(c);
    });
    return order.map(function (k) {
      return map[k].sort(function (a, b) { return dateKey(b).localeCompare(dateKey(a)); });
    });
  }

  /* ---------------- library ---------------- */

  function card(g) {
    var c = g[0], older = g.slice(1);
    var rows = '';
    if (c.batchNumber) rows += '<dt>Batch</dt><dd class="cx-mono">' + esc(c.batchNumber) + '</dd>';
    if (c.labName) rows += '<dt>Lab</dt><dd>' + esc(c.labName) + '</dd>';
    if (c.testType) rows += '<dt>Test</dt><dd>' + esc(c.testType) + '</dd>';
    if (dateKey(c)) rows += '<dt>' + (c.testDate ? 'Tested' : 'Report') + '</dt><dd>' + fmtDate(dateKey(c)) + '</dd>';
    return '<article class="cx-card cx-coa" id="coa-' + c.id + '">'
      + '<div class="cx-top">' + thumb(c, 'cx-thumb')
      + '<div><h3>' + esc(c.productName || 'Product') + '</h3>'
      + (c.variantName ? '<div class="cx-dose">' + esc(c.variantName) + '</div>' : '')
      + '<span class="cx-verified">' + svg('check') + 'Third-party tested</span></div></div>'
      + '<dl>' + rows + '</dl>'
      + (older.length
        ? '<details class="cx-older"><summary>' + older.length + ' earlier batch' + (older.length > 1 ? 'es' : '') + '</summary><ul>'
          + older.map(function (o) {
            return '<li><span class="cx-mono">' + esc(o.batchNumber || 'Report') + (dateKey(o) ? ' · ' + fmtDate(dateKey(o)) : '') + '</span><button type="button" data-view="' + o.id + '">View</button></li>';
          }).join('') + '</ul></details>'
        : '')
      + '<div class="cx-acts"><button type="button" class="cx-btn cx-primary cx-sm" data-view="' + c.id + '" aria-label="View COA for ' + esc(c.productName) + (c.batchNumber ? ', batch ' + esc(c.batchNumber) : '') + '">' + svg('doc') + 'View COA</button>'
      + '<a class="cx-btn cx-sm" href="' + fileUrl(c) + '" download aria-label="Download ' + esc(c.productName) + ' report">' + svg('dl') + (c.fileType === 'image' ? 'Image' : 'PDF') + '</a></div>'
      + '</article>';
  }

  function render() {
    var grid = $('cxGrid'), count = $('cxCount');
    if (!state.loaded) { grid.innerHTML = '<div class="cx-skel"></div><div class="cx-skel"></div><div class="cx-skel"></div>'; count.textContent = 'Loading reports…'; return; }
    if (state.unavailable) {
      count.textContent = '';
      grid.innerHTML = '<div class="cx-card cx-empty"><b>Reports are temporarily unavailable.</b><p>Everything else on the site works normally. Please try again shortly.</p><button type="button" class="cx-btn cx-sm" id="cxRetry">Try again</button></div>';
      $('cxRetry').onclick = load;
      return;
    }
    var q = state.search.trim().toLowerCase(), nq = norm(q);
    var list = state.all.filter(function (c) {
      if (!q) return true;
      return [c.productName, c.variantName, c.batchNumber, c.labName].join(' ').toLowerCase().indexOf(q) !== -1
        || (nq.length > 2 && norm(c.batchNumber).indexOf(nq) !== -1);
    });
    var gs = groups(list);
    gs.sort(function (a, b) {
      return state.sort === 'az'
        ? String(a[0].productName).localeCompare(String(b[0].productName))
        : dateKey(b[0]).localeCompare(dateKey(a[0]));
    });
    count.textContent = list.length + ' report' + (list.length === 1 ? '' : 's');
    grid.innerHTML = gs.length ? gs.map(card).join('')
      : (state.all.length
        ? '<div class="cx-card cx-empty"><b>No reports match “' + esc(state.search) + '”.</b><p>Try a product name or the batch code on your vial.</p><button type="button" class="cx-btn cx-sm" id="cxClear">Clear search</button></div>'
        : '<div class="cx-card cx-empty"><b>No reports published yet.</b><p>Check back soon.</p></div>');
    var clr = $('cxClear'); if (clr) clr.onclick = function () { state.search = ''; $('cxSearch').value = ''; syncUrl(); render(); };
  }

  function syncUrl() {
    if (!history.replaceState) return;
    var p = new URLSearchParams(location.search);
    p.delete('search'); p.delete('product_id');
    if (state.search) p.set('search', state.search);
    var qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  function stats() {
    var products = {}, latest = '';
    state.all.forEach(function (c) { products[c.productId || c.productName] = 1; if (dateKey(c) > latest) latest = dateKey(c); });
    $('cxStatProducts').textContent = Object.keys(products).length;
    $('cxStatReports').textContent = state.all.length;
    $('cxStatLatest').textContent = latest ? fmtDate(latest) : '—';
  }

  /* ---------------- batch lookup ---------------- */

  function lookup(evt) {
    if (evt) evt.preventDefault();
    var raw = $('cxBatch').value.trim(), v = norm(raw), out = $('cxResult');
    if (!v) { out.classList.remove('on'); return null; }
    var hit = null;
    state.all.forEach(function (c) { if (!hit && norm(c.batchNumber) === v) hit = c; });
    if (!hit && v.length >= 5) state.all.forEach(function (c) { if (!hit && norm(c.batchNumber).indexOf(v) === 0) hit = c; });
    out.classList.add('on');
    if (hit) {
      out.innerHTML = '<div class="cx-match">' + thumb(hit, 'cx-mthumb')
        + '<div class="cx-grow"><b>Match found: ' + esc(hit.productName) + (hit.variantName ? ' ' + esc(hit.variantName) : '') + '</b>'
        + '<div class="cx-small">Batch <b class="cx-mono">' + esc(hit.batchNumber) + '</b>' + (hit.labName ? ' · ' + esc(hit.labName) : '') + (dateKey(hit) ? ' · ' + fmtDate(dateKey(hit)) : '') + '</div></div>'
        + '<button type="button" class="cx-btn cx-primary cx-sm" data-view="' + hit.id + '">View</button></div>';
    } else {
      out.innerHTML = '<div class="cx-nomatch"><b>No report found for “' + esc(raw) + '”.</b> Check the code on the side of your vial (it looks like <span class="cx-mono">MC-260915-1</span>), or <a href="mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent('COA for batch ' + raw) + '">email us</a> and we will send it.</div>';
    }
    return hit;
  }

  /* ---------------- viewer ---------------- */

  function findCoa(id) {
    for (var i = 0; i < state.all.length; i++) if (state.all[i].id === id) return Promise.resolve(state.all[i]);
    return fetch('/api/coas/' + id, { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (d) { return d && d.coa; });
  }

  function openViewer(id) {
    id = parseInt(id, 10); if (!id) return;
    findCoa(id).then(function (c) {
      if (!c) { toast('That report is not available'); return; }
      var d = $('cxViewer'), url = fileUrl(c);
      var body = c.fileType === 'image'
        ? '<div class="cx-imgwrap"><img src="' + url + '" alt="Certificate of analysis for ' + esc(c.productName) + '"></div>'
        : '<iframe src="' + url + '#view=FitH" title="Certificate of analysis for ' + esc(c.productName) + '"></iframe>';
      d.innerHTML = '<div class="cx-vhead">' + thumb(c, 'cx-vthumb')
        + '<div class="cx-grow"><b>' + esc(c.productName) + (c.variantName ? ' ' + esc(c.variantName) : '') + '</b>'
        + '<small>' + (c.batchNumber ? 'Batch <span class="cx-mono">' + esc(c.batchNumber) + '</span>' : '') + (c.labName ? ' · ' + esc(c.labName) : '') + (dateKey(c) ? ' · ' + fmtDate(dateKey(c)) : '') + '</small></div>'
        + '<a class="cx-btn cx-sm" href="' + url + '" target="_blank" rel="noopener">' + svg('ext') + '<span class="cx-hide-xs">Open</span></a>'
        + '<a class="cx-btn cx-sm" href="' + url + '" download aria-label="Download">' + svg('dl') + '</a>'
        + '<button type="button" class="cx-btn cx-sm" data-close aria-label="Close">' + svg('x') + '</button></div>'
        + '<div class="cx-vbody">' + body + '</div>';
      d.querySelector('[data-close]').onclick = function () { d.close(); };
      if (d.showModal) d.showModal(); else d.setAttribute('open', '');
      var p = new URLSearchParams(location.search); p.set('id', c.id);
      history.replaceState(null, '', location.pathname + '?' + p.toString());
    });
  }

  /* ---------------- boot ---------------- */

  function load() {
    state.loaded = false; state.unavailable = false; render();
    return fetchAll().then(function (list) {
      state.all = list; state.loaded = true; stats(); render();
    }).catch(function () {
      state.loaded = true; state.unavailable = true; render();
    });
  }

  // Search lives in the URL so a shared or restored page shows the same view.
  function applyStateFromUrl() {
    state.search = (new URLSearchParams(location.search).get('search') || '').trim();
    $('cxSearch').value = state.search;
  }

  function init() {
    var p = new URLSearchParams(location.search);
    applyStateFromUrl();

    var timer;
    $('cxSearch').addEventListener('input', function (e) {
      clearTimeout(timer);
      timer = setTimeout(function () { state.search = e.target.value; syncUrl(); render(); }, 120);
    });
    $('cxSort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
    $('cxLookup').addEventListener('submit', lookup);
    $('cxBatch').addEventListener('input', function () { if (!$('cxBatch').value) $('cxResult').classList.remove('on'); });
    document.addEventListener('click', function (e) {
      var v = e.target.closest && e.target.closest('[data-view]');
      if (v) { e.preventDefault(); openViewer(v.getAttribute('data-view')); }
    });
    var viewer = $('cxViewer');
    viewer.addEventListener('close', function () {
      viewer.innerHTML = '';
      var q = new URLSearchParams(location.search); q.delete('id');
      history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    });
    viewer.addEventListener('click', function (e) { if (e.target === viewer) viewer.close(); });

    load().then(function () {
      var batch = p.get('batch');
      var openId = parseInt(p.get('id'), 10);
      if (batch) {
        $('cxBatch').value = batch;
        var hit = lookup();
        if (hit && !openId) openViewer(hit.id);
        $('cxLookupCard').scrollIntoView({ block: 'center' });
      }
      if (openId) openViewer(openId);
    });

    // Back/forward cache: re-read the URL so the page never comes back stale.
    window.addEventListener('pageshow', function (evt) {
      if (!evt.persisted) return;
      applyStateFromUrl(); render();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
