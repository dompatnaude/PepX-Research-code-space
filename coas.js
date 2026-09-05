(function () {
  'use strict';

  var state = {
    coas: [],
    products: [],
    search: '',
    productFilter: '',
    loading: false,
    openCoaId: null
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(d) {
    if (!d) return '';
    try {
      var parts = String(d).split('T')[0].split('-');
      if (parts.length === 3) {
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return months[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
      }
      return String(d);
    } catch (e) { return String(d); }
  }

  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function pdfFallback(productName) {
    return '<div class="coa-pdf-load-wrap" aria-label="PDF document: ' + esc(productName || 'Certificate of Analysis') + '">'
      + '<svg width="44" height="44" viewBox="0 0 48 48" aria-hidden="true" fill="none">'
      + '<rect x="8" y="4" width="32" height="40" rx="4" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5"/>'
      + '<path d="M16 16h16M16 22h16M16 28h10" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>'
      + '<path d="M28 36h8v-6h-5l-3 6z" fill="#ef4444" opacity=".7"/>'
      + '<text x="30" y="35" font-size="6" fill="#fff" font-family="sans-serif" font-weight="700">PDF</text>'
      + '</svg>'
      + '<span style="font-size:.75rem;">PDF Report</span>'
      + '</div>';
  }

  // Kept for use in modal detail view
  function pdfPlaceholder(productName) { return pdfFallback(productName); }

  function coaCardHtml(coa) {
    var imgHtml;
    if (coa.fileType === 'image') {
      imgHtml = '<img src="/api/coas/' + coa.id + '/file" alt="COA for ' + esc(coa.productName) + '" loading="lazy">';
    } else if (coa.fileType === 'pdf') {
      // Live PDF preview container — first page is rendered into this by renderPdfPreview()
      imgHtml = '<div class="coa-pdf-preview" data-pdf-coa-id="' + coa.id + '" data-pdf-name="' + esc(coa.productName || '') + '" aria-label="PDF preview for ' + esc(coa.productName || 'COA') + '">'
        + '<div class="coa-pdf-load-wrap"><div class="coa-pdf-spinner" aria-hidden="true"></div></div>'
        + '</div>';
    } else {
      imgHtml = '<div class="coa-pdf-preview"><div class="coa-pdf-load-wrap" aria-label="No preview available"><span style="font-size:.8rem;color:#94a3b8;">No preview</span></div></div>';
    }

    var badgeHtml = coa.fileType
      ? '<div class="coa-badge-wrap"><span class="coa-badge ' + esc(coa.fileType) + '">' + esc(coa.fileType.toUpperCase()) + '</span></div>'
      : '';

    var variantHtml = coa.variantName
      ? '<div class="coa-variant">' + esc(coa.variantName) + '</div>'
      : '';

    var metaItems = [];
    if (coa.batchNumber) metaItems.push('<span><span class="label">Batch:</span> ' + esc(coa.batchNumber) + '</span>');
    if (coa.labName) metaItems.push('<span><span class="label">Lab:</span> ' + esc(coa.labName) + '</span>');
    if (coa.testDate) metaItems.push('<span><span class="label">Tested:</span> ' + esc(fmtDate(coa.testDate)) + '</span>');
    else if (coa.reportDate) metaItems.push('<span><span class="label">Report:</span> ' + esc(fmtDate(coa.reportDate)) + '</span>');

    return '<article class="coa-card" data-coa-id="' + coa.id + '">'
      + '<div class="coa-card-img">'
      + badgeHtml
      + imgHtml
      + '</div>'
      + '<div class="coa-card-body">'
      + '<h2 class="coa-product-name">' + esc(coa.productName || 'Product') + '</h2>'
      + variantHtml
      + '<div class="coa-meta">' + metaItems.join('') + '</div>'
      + '</div>'
      + '<div class="coa-card-actions">'
      + '<a href="#" class="btn primary" data-coa-open="' + coa.id + '" aria-label="View COA for ' + esc(coa.productName) + (coa.batchNumber ? ', batch ' + esc(coa.batchNumber) : '') + '">View COA</a>'
      + '</div>'
      + '</article>';
  }

  function renderGrid() {
    var grid = $('coaGrid');
    var status = $('coaStatusMsg');
    if (!grid) return;

    if (state.loading) {
      grid.innerHTML = '';
      if (status) status.textContent = 'Loading COAs\u2026';
      return;
    }

    // The COA feed is a self-contained section of the site. If it cannot be
  // reached, say so here and leave every other page working normally.
  if (state.unavailable) {
    if (status) status.textContent = '';
    grid.innerHTML = '<div class="coa-empty" style="grid-column:1/-1">'
      + '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true"><rect x="10" y="6" width="36" height="44" rx="5" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1.5"/><path d="M18 18h20M18 25h20M18 32h12" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/></svg>'
      + '<h3>COA information is temporarily unavailable</h3>'
      + '<p>Certificates of analysis could not be loaded right now. Everything else on the site is unaffected \u2014 please try again shortly.</p>'
      + '<button type="button" class="btn ghost" id="coaRetry">Try again</button>'
      + '</div>';
    var retryBtn = $('coaRetry');
    if (retryBtn) retryBtn.addEventListener('click', function () { loadCoas(); });
    return;
  }

  if (!state.coas.length) {
      if (status) status.textContent = '';
      grid.innerHTML = '<div class="coa-empty" style="grid-column:1/-1">'
        + '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true"><rect x="10" y="6" width="36" height="44" rx="5" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1.5"/><path d="M18 18h20M18 25h20M18 32h12" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/></svg>'
        + (state.search || state.productFilter
          ? '<h3>No COAs match your search</h3><p>Try adjusting your search or filters.</p>'
            + '<button type="button" class="btn ghost" id="coaClearFilters">Clear filters</button>'
          : '<h3>No certificates of analysis published yet</h3><p>Check back soon for third-party lab reports.</p>'
        )
        + '</div>';

      var clearBtn = $('coaClearFilters');
      if (clearBtn) {
        clearBtn.addEventListener('click', function () {
          state.search = '';
          state.productFilter = '';
          var searchInput = $('coaSearch');
          if (searchInput) searchInput.value = '';
          setActiveProductFilter('');
          loadCoas();
        });
      }
      return;
    }

    if (status) status.textContent = state.coas.length + ' report' + (state.coas.length !== 1 ? 's' : '') + ' found';
    grid.innerHTML = state.coas.map(coaCardHtml).join('');

    Array.prototype.forEach.call(grid.querySelectorAll('[data-coa-open]'), function (el) {
      el.addEventListener('click', function (evt) {
        evt.preventDefault();
        openCoaModal(parseInt(el.getAttribute('data-coa-open'), 10));
      });
    });

    // Render first-page previews for all PDF cards
    renderAllPdfPreviews(grid);
  }

  // Render all PDF card previews in the grid after HTML is set
  function renderAllPdfPreviews(scope) {
    var containers = (scope || document).querySelectorAll('.coa-pdf-preview[data-pdf-coa-id]');
    if (!containers.length) return;

    // If PDF.js hasn't loaded from CDN yet, retry after a short delay
    if (typeof pdfjsLib === 'undefined') {
      setTimeout(function () { renderAllPdfPreviews(scope); }, 400);
      return;
    }

    Array.prototype.forEach.call(containers, function (container) {
      var coaId = container.getAttribute('data-pdf-coa-id');
      var name = container.getAttribute('data-pdf-name') || '';
      renderPdfPreview(container, '/api/coas/' + coaId + '/file', name);
    });
  }

  // Render the first page of a PDF at /api/coas/:id/file into an img inside container
  function renderPdfPreview(container, url, productName) {
    var task = pdfjsLib.getDocument({ url: url });
    task.promise
      .then(function (pdf) { return pdf.getPage(1); })
      .then(function (page) {
        var vp1 = page.getViewport({ scale: 1 });
        // Scale the page to ~600px wide — crisp at card size (~300px) including retina
        var scale = Math.min(600 / vp1.width, 2);
        var vp = page.getViewport({ scale: scale });

        var canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        var ctx = canvas.getContext('2d');

        return page.render({ canvasContext: ctx, viewport: vp }).promise
          .then(function () {
            // Convert rendered canvas to img so object-fit CSS works normally
            var dataUrl = canvas.toDataURL('image/png');
            var img = new Image();
            img.className = 'coa-pdf-rendered';
            img.alt = '';
            img.src = dataUrl;
            container.innerHTML = '';
            container.appendChild(img);
          });
      })
      .catch(function () {
        // Render failed — swap in the static placeholder
        container.innerHTML = pdfFallback(productName);
      });
  }

  function loadCoas() {
    state.loading = true;
    renderGrid();

    var params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.productFilter) params.set('product_id', state.productFilter);

    fetch('/api/coas?' + params.toString(), { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.coas = (data && data.coas) || [];
      state.unavailable = !!(data && data.unavailable);
        state.loading = false;
        renderGrid();
      })
      .catch(function () {
      state.coas = [];
      state.unavailable = true;
        state.loading = false;
        renderGrid();
        toast('Failed to load COAs');
      });
  }

  function openCoaModal(id) {
    var modal = $('coaModal');
    var preview = $('coaModalPreview');
    var meta = $('coaModalMeta');
    var title = $('coaModalTitle');
    if (!modal || !preview || !meta) return;

    state.openCoaId = id;
    preview.innerHTML = '<div style="padding:1.5rem;color:#64748b">Loading\u2026</div>';
    meta.innerHTML = '';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    fetch('/api/coas/' + id, { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var coa = data && data.coa;
        if (!coa) { closeCoaModal(); return; }

        if (title) title.textContent = (coa.productName || 'Certificate of Analysis')
          + (coa.batchNumber ? ' \u2014 Batch ' + coa.batchNumber : '');

        // Preview area
        if (coa.fileType === 'image') {
          preview.innerHTML = '<img src="/api/coas/' + id + '/file" alt="Certificate of Analysis for ' + esc(coa.productName) + '" style="max-width:100%;max-height:400px;object-fit:contain;">';
        } else if (coa.fileType === 'pdf') {
          preview.innerHTML = '<iframe src="/api/coas/' + id + '/file#toolbar=1" title="Certificate of Analysis for ' + esc(coa.productName) + '" loading="lazy"></iframe>';
        } else {
          preview.innerHTML = pdfPlaceholder(coa.productName);
        }

        // Meta area
        var rows = [];

        function row(k, v) {
          if (!v) return '';
          return '<div class="coa-detail-row"><span class="k">' + esc(k) + '</span><span>' + esc(v) + '</span></div>';
        }

        rows.push('<h2 style="margin:0 0 .4rem;font-size:1.05rem;color:#0f172a">' + esc(coa.productName || '') + '</h2>');
        if (coa.variantName) rows.push('<div style="font-size:.87rem;color:#475069;font-weight:600;margin-bottom:.5rem">' + esc(coa.variantName) + '</div>');
        rows.push(row('Batch', coa.batchNumber));
        rows.push(row('Lab', coa.labName));
        rows.push(row('Test type', coa.testType));
        rows.push(row('Test date', fmtDate(coa.testDate)));
        rows.push(row('Report date', fmtDate(coa.reportDate)));
        rows.push(row('Published', fmtDate(coa.publishedAt)));

        var actionHtml = '<div class="coa-modal-actions">';
        actionHtml += '<a href="/api/coas/' + id + '/file" target="_blank" rel="noopener noreferrer" class="btn primary" aria-label="Open full report for ' + esc(coa.productName) + '">Open Full Report &#8599;</a>';
        actionHtml += '<a href="shop.html" class="btn ghost">Browse Products</a>';
        actionHtml += '</div>';
        rows.push(actionHtml);

        meta.innerHTML = rows.join('');
      })
      .catch(function () {
        closeCoaModal();
        toast('Failed to load COA details');
      });
  }

  function closeCoaModal() {
    var modal = $('coaModal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
    state.openCoaId = null;
  }

  function setActiveProductFilter(productId) {
    var filter = $('coaProductFilter');
    if (!filter) return;
    Array.prototype.forEach.call(filter.querySelectorAll('.pill'), function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-product') === productId);
    });
  }

  function buildProductFilter(coas) {
    // Gather unique products from loaded COAs
    var seen = {};
    var products = [];
    coas.forEach(function (c) {
      if (c.productId && !seen[c.productId]) {
        seen[c.productId] = true;
        products.push({ id: c.productId, name: c.productName });
      }
    });

    var filter = $('coaProductFilter');
    if (!filter || !products.length) return;

    // Keep the "All" button, append product buttons
    var extra = products.map(function (p) {
      return '<button type="button" class="pill" data-product="' + p.id + '">' + esc(p.name) + '</button>';
    }).join('');
    filter.innerHTML = '<button type="button" class="pill active" data-product="">All Products</button>' + extra;

    Array.prototype.forEach.call(filter.querySelectorAll('.pill'), function (btn) {
      btn.addEventListener('click', function () {
        state.productFilter = btn.getAttribute('data-product') || '';
        setActiveProductFilter(state.productFilter);
        loadCoas();
      });
    });
  }

  function init() {
    var searchInput = $('coaSearch');
    var searchTimer = null;
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          state.search = searchInput.value.trim();
          loadCoas();
        }, 300);
      });
    }

    var closeBtn = $('coaModalClose');
    if (closeBtn) closeBtn.addEventListener('click', closeCoaModal);

    var modal = $('coaModal');
    if (modal) {
      modal.addEventListener('click', function (evt) {
        if (evt.target === modal) closeCoaModal();
      });
    }

    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && state.openCoaId) closeCoaModal();
    });

    // Read URL params for deep-linking
    var urlParams = new URLSearchParams(window.location.search);
    var openId = parseInt(urlParams.get('id'), 10);

    // Mobile nav toggle (reuse same pattern as shop.html / script.js)
    var mobileToggle = $('mobileMenuToggle');
    var siteMenu = $('site-menu');
    if (mobileToggle && siteMenu) {
      mobileToggle.addEventListener('click', function () {
        var expanded = mobileToggle.getAttribute('aria-expanded') === 'true';
        mobileToggle.setAttribute('aria-expanded', String(!expanded));
        siteMenu.classList.toggle('open', !expanded);
      });
    }

    // Initial load — then build product filter from results
    state.loading = true;
    renderGrid();

    var params = new URLSearchParams();
    fetch('/api/coas?' + params.toString(), { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.coas = (data && data.coas) || [];
      state.unavailable = !!(data && data.unavailable);
        state.loading = false;
        buildProductFilter(state.coas);
        renderGrid();
        if (openId) openCoaModal(openId);
      })
      .catch(function () {
      state.coas = [];
      state.unavailable = true;
        state.loading = false;
        renderGrid();
      });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
