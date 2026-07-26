(function () {
  'use strict';

  var state = {
    tab: 'orders',
    filter: '',
    search: '',
    orders: [],
    statuses: [],
    currentId: null,
    products: [],
    productSearch: '',
    editingProductId: null,
    productVariants: [],
    promos: [],
    promoSearch: '',
    promoFilter: '',
    promoSummary: null,
    editingPromoId: null
  };

  function $(id) { return document.getElementById(id); }
  function money(n) {
    n = Number(n) || 0;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(d) { if (!d) return ''; try { return new Date(d).toLocaleString(); } catch (e) { return String(d); } }
  function slugify(v) {
    return String(v || '').toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
  }

  function toast(msg) {
    var t = $('toast'); if (!t) { return; }
    t.textContent = msg; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function syncModalBodyLock() {
    var productWrap = $('productModalWrap');
    var promoWrap = $('promoModalWrap');
    var productOpen = !!(productWrap && !productWrap.classList.contains('hidden'));
    var promoOpen = !!(promoWrap && !promoWrap.classList.contains('hidden'));
    document.body.classList.toggle('modal-open', productOpen || promoOpen);
  }

  // Thin API wrapper. Sends cookies; throws Error with .status on non-2xx.
  function api(path, options) {
    options = options || {};
    options.credentials = 'include';
    options.headers = options.headers || {};
    if (options.body && !(options.body instanceof FormData)) {
      options.headers['Content-Type'] = 'application/json';
    }
    return fetch(path, options).then(function (res) {
      return res.text().then(function (raw) {
        var data = {};
        if (raw) {
          try {
            data = JSON.parse(raw);
          } catch (e) {
            data = { error: raw };
          }
        }
        if (!res.ok) {
          var err = new Error(data.error || ('Request failed (' + res.status + ')'));
          err.status = res.status; throw err;
        }
        return data;
      });
    });
  }

  // Map a UI filter chip to a server status query.
  function filterToStatus(filter) {
    if (filter === 'new') return 'pending_payment';
    if (filter === 'processing') return 'processing';
    if (filter === 'shipped') return 'shipped';
    if (filter === 'completed') return 'completed';
    return '';
  }

  function statusBadge(status) {
    var cls = 'gray';
    if (status === 'processing' || status === 'paid') cls = 'blue';
    else if (status === 'shipped') cls = 'amber';
    else if (status === 'completed') cls = 'green';
    else if (status === 'cancelled') cls = 'red';
    return '<span class="badge ' + cls + '">' + esc(status || '') + '</span>';
  }
  function fulfillmentBadge(f) {
    var cls = 'gray', label = f || 'unfulfilled';
    if (f === 'shipped') { cls = 'green'; }
    else if (f === 'label_created') { cls = 'blue'; label = 'label created'; }
    return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
  }

  function loadOrders() {
    var qs = [];
    var status = filterToStatus(state.filter);
    if (status) qs.push('status=' + encodeURIComponent(status));
    if (state.search) qs.push('search=' + encodeURIComponent(state.search));
    var url = '/api/admin/orders' + (qs.length ? ('?' + qs.join('&')) : '');
    return api(url).then(function (data) {
      state.orders = data.orders || [];
      state.statuses = data.statuses || [];
      $('adminDenied').classList.add('hidden');
      $('adminApp').classList.remove('hidden');
      renderTable();
    }).catch(function (err) {
      if (err.status === 401 || err.status === 403) { showDenied(err.status); }
      else { toast(err.message || 'Failed to load orders'); }
    });
  }

  function showDenied(status) {
    $('adminApp').classList.add('hidden');
    var d = $('adminDenied'); d.classList.remove('hidden');
    d.querySelector('p').textContent = status === 401
      ? 'You must be signed in as an administrator to use this console.'
      : 'Your account does not have admin access.';
  }

  function renderProductTable() {
    var body = $('productsBody');
    if (!body) return;
    var q = state.productSearch.toLowerCase();
    var rows = state.products.filter(function (p) {
      if (!q) return true;
      var hay = [p.name, p.slug, p.sku, p.category].filter(Boolean).join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="muted">No products found.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (p) {
      var image = p.image_url ? '<img class="product-thumb" src="' + esc(p.image_url) + '" alt="' + esc(p.name || 'Product') + '">' : '<span class="muted">No image</span>';
      var status = p.active ? '<span class="badge green">active</span>' : '<span class="badge gray">inactive</span>';
      var toggleText = p.active ? 'Disable' : 'Enable';
      var stockTotal = p.variant_stock_total != null ? Number(p.variant_stock_total) : null;
      var stockCell = stockTotal != null
        ? esc(String(stockTotal)) + ' <span class="muted" style="font-size:.8em">(variants)</span>'
        : esc(String(p.stock_quantity == null ? '' : p.stock_quantity));
      return '<tr>'
        + '<td>' + image + '</td>'
        + '<td><strong>' + esc(p.name || '') + '</strong><br><span class="muted">' + esc(p.slug || '') + '</span></td>'
        + '<td>' + esc(p.category || '\u2014') + '</td>'
        + '<td>' + money(p.price) + '</td>'
        + '<td>' + stockCell + '</td>'
        + '<td>' + status + '</td>'
        + '<td>'
        + '<button class="btn-sm secondary" data-product-edit="' + p.id + '">Edit</button> '
        + '<button class="btn-sm secondary" data-product-toggle="' + p.id + '">' + toggleText + '</button> '
        + '<button class="btn-sm danger" data-product-delete="' + p.id + '">Delete</button>'
        + '</td>'
        + '</tr>';
    }).join('');

    Array.prototype.forEach.call(body.querySelectorAll('[data-product-edit]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-product-edit'), 10);
        var p = state.products.find(function (x) { return Number(x.id) === id; });
        if (p) openProductModal(p);
      });
    });

    Array.prototype.forEach.call(body.querySelectorAll('[data-product-toggle]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-product-toggle'), 10);
        var p = state.products.find(function (x) { return Number(x.id) === id; });
        if (!p) return;
        updateProductStatus(id, !p.active);
      });
    });

    Array.prototype.forEach.call(body.querySelectorAll('[data-product-delete]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-product-delete'), 10);
        removeProduct(id);
      });
    });
  }

  function loadProducts() {
    return api('/api/admin/products').then(function (data) {
      state.products = data.products || [];
      $('adminDenied').classList.add('hidden');
      $('adminApp').classList.remove('hidden');
      renderProductTable();
    }).catch(function (err) {
      if (err.status === 401 || err.status === 403) { showDenied(err.status); }
      else { toast(err.message || 'Failed to load products'); }
    });
  }

  function normalizePromoCode(value) {
    return String(value || '').trim().toUpperCase();
  }

  function dateInputFromIso(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function loadPromos() {
    var qs = [];
    if (state.promoSearch) qs.push('search=' + encodeURIComponent(state.promoSearch));
    if (state.promoFilter) qs.push('status=' + encodeURIComponent(state.promoFilter));
    var url = '/api/admin/promos' + (qs.length ? ('?' + qs.join('&')) : '');

    return Promise.all([
      api(url),
      api('/api/admin/promos/summary')
    ]).then(function (results) {
      var data = results[0] || {};
      var summaryData = results[1] || {};
      state.promos = data.promos || [];
      state.promoSummary = summaryData.summary || null;
      $('adminDenied').classList.add('hidden');
      $('adminApp').classList.remove('hidden');
      renderPromoSummary();
      renderPromoTable();
    }).catch(function (err) {
      if (err.status === 401 || err.status === 403) { showDenied(err.status); }
      else { toast(err.message || 'Failed to load discount codes'); }
    });
  }

  function renderPromoSummary() {
    var s = state.promoSummary || {};
    if ($('promoMetricActiveCodes')) $('promoMetricActiveCodes').innerHTML = '<strong>' + Number(s.active_codes || 0) + '</strong>';
    if ($('promoMetricDiscounts')) $('promoMetricDiscounts').innerHTML = '<strong>' + money(s.total_discounts_given || 0) + '</strong>';
    if ($('promoMetricRevenue')) $('promoMetricRevenue').innerHTML = '<strong>' + money(s.total_revenue_generated || 0) + '</strong>';
    if ($('promoMetricToday')) $('promoMetricToday').innerHTML = '<strong>' + Number(s.codes_used_today || 0) + '</strong>';
    if ($('promoMetricWeek')) $('promoMetricWeek').innerHTML = '<strong>' + Number(s.codes_used_this_week || 0) + '</strong>';
    if ($('promoMetricMonth')) $('promoMetricMonth').innerHTML = '<strong>' + Number(s.codes_used_this_month || 0) + '</strong>';
  }

  function promoStatusBadge(status) {
    var s = String(status || '').toLowerCase();
    if (s === 'active') return '<span class="badge green">Active</span>';
    if (s === 'disabled') return '<span class="badge gray">Disabled</span>';
    if (s === 'scheduled') return '<span class="badge blue">Scheduled</span>';
    if (s === 'expired') return '<span class="badge red">Expired</span>';
    if (s === 'usage_limit_reached') return '<span class="badge amber">Usage Limit Reached</span>';
    if (s === 'archived') return '<span class="badge gray">Archived</span>';
    return '<span class="badge gray">' + esc(status || 'Unknown') + '</span>';
  }

  function formatPromoDiscount(promo) {
    var type = String(promo.discount_type || 'percentage');
    var val = Number(promo.discount_value || 0);
    if (type === 'fixed') return money(val) + ' off';
    return val.toFixed(2).replace(/\.00$/, '') + '% off';
  }

  function renderPromoTable() {
    var body = $('promosBody');
    if (!body) return;

    var q = String(state.promoSearch || '').toLowerCase();
    var rows = (state.promos || []).filter(function (promo) {
      if (!q) return true;
      return String(promo.code || '').toLowerCase().indexOf(q) !== -1;
    });

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="14" class="muted">No discount codes found.</td></tr>';
      return;
    }

    body.innerHTML = rows.map(function (promo) {
      var usageLimit = promo.usage_limit == null ? 'Unlimited' : String(promo.usage_limit);
      var remaining = promo.remaining_uses == null ? 'Unlimited' : String(promo.remaining_uses);
      var usesPerCustomer = promo.uses_per_customer == null ? 'Unlimited' : String(promo.uses_per_customer);
      return '<tr>'
        + '<td><strong>' + esc(promo.code || '') + '</strong><br><span class="muted">' + esc(String(promo.discount_type || 'percentage')) + '</span></td>'
        + '<td>' + esc(formatPromoDiscount(promo)) + '</td>'
        + '<td>' + promoStatusBadge(promo.status) + '</td>'
        + '<td>' + esc(String(promo.total_used || 0)) + '</td>'
        + '<td>' + esc(usageLimit) + '</td>'
        + '<td>' + esc(remaining) + '</td>'
        + '<td>' + esc(usesPerCustomer) + '</td>'
        + '<td>' + money(promo.total_discount_given || 0) + '</td>'
        + '<td>' + money(promo.total_revenue_generated || 0) + '</td>'
        + '<td>' + (promo.minimum_order == null ? '<span class="muted">&mdash;</span>' : money(promo.minimum_order)) + '</td>'
        + '<td>' + esc(fmtDate(promo.starts_at) || '\u2014') + '</td>'
        + '<td>' + esc(fmtDate(promo.expires_at) || '\u2014') + '</td>'
        + '<td>' + esc(fmtDate(promo.created_at) || '\u2014') + '</td>'
        + '<td>'
        + '<button type="button" class="btn-sm secondary" data-promo-action="edit" data-promo-id="' + promo.id + '">Edit</button> '
        + '<button type="button" class="btn-sm secondary" data-promo-action="copy" data-promo-id="' + promo.id + '">Copy</button> '
        + '<button type="button" class="btn-sm secondary" data-promo-action="analytics" data-promo-id="' + promo.id + '">Analytics</button> '
        + '<button type="button" class="btn-sm secondary" data-promo-action="toggle" data-promo-id="' + promo.id + '">' + (promo.active ? 'Disable' : 'Enable') + '</button> '
        + '<button type="button" class="btn-sm secondary" data-promo-action="archive" data-promo-id="' + promo.id + '">Archive</button> '
        + '<button type="button" class="btn-sm danger" data-promo-action="delete" data-promo-id="' + promo.id + '">Delete</button>'
        + '</td>'
        + '</tr>';
    }).join('');

    if (!body.dataset.promoActionsBound) {
      body.dataset.promoActionsBound = '1';
      body.addEventListener('click', function (event) {
        var btn = event.target && event.target.closest ? event.target.closest('button[data-promo-action]') : null;
        if (!btn || !body.contains(btn)) return;

        var action = btn.getAttribute('data-promo-action');
        var id = parseInt(btn.getAttribute('data-promo-id'), 10);
        if (!action || !Number.isInteger(id)) {
          toast('Missing promo action information.');
          return;
        }

        var promo = (state.promos || []).find(function (p) { return Number(p.id) === id; });
        var pending = null;
        if (action === 'edit') {
          if (promo) openPromoModal(promo);
          return;
        }
        if (action === 'copy') {
          if (promo) copyTextToClipboard(String(promo.code || ''));
          return;
        }
        if (action === 'analytics') {
          pending = openPromoAnalytics(id);
        } else if (action === 'toggle') {
          if (!promo) return;
          pending = updatePromo(id, { active: !promo.active }, !promo.active ? 'Discount code enabled' : 'Discount code disabled');
        } else if (action === 'archive') {
          pending = updatePromo(id, { archived: true }, 'Discount code archived');
        } else if (action === 'delete') {
          pending = deletePromo(id);
        }

        if (!pending || !pending.then) return;
        btn.disabled = true;
        Promise.resolve(pending).finally(function () {
          btn.disabled = false;
        });
      });
    }
  }

  function openPromoModal(promo) {
    var wrap = $('promoModalWrap');
    var form = $('promoForm');
    if (!wrap || !form) return;
    form.reset();

    state.editingPromoId = promo && promo.id ? Number(promo.id) : null;
    form.elements.promo_id.value = state.editingPromoId != null ? String(state.editingPromoId) : '';
    form.elements.code.value = promo && promo.code ? promo.code : '';
    form.elements.discount_type.value = promo && promo.discount_type ? promo.discount_type : 'percentage';
    form.elements.discount_value.value = promo && promo.discount_value != null ? Number(promo.discount_value).toFixed(2) : '';
    form.elements.minimum_order.value = promo && promo.minimum_order != null ? Number(promo.minimum_order).toFixed(2) : '';
    form.elements.usage_limit.value = promo && promo.usage_limit != null ? String(promo.usage_limit) : '';
    form.elements.uses_per_customer.value = promo && promo.uses_per_customer != null ? String(promo.uses_per_customer) : '';
    form.elements.starts_at.value = promo ? dateInputFromIso(promo.starts_at) : '';
    form.elements.expires_at.value = promo ? dateInputFromIso(promo.expires_at) : '';
    form.elements.active.value = promo && promo.active === false ? 'false' : 'true';
    form.elements.notes.value = promo && promo.notes ? promo.notes : '';

    var currentStatus = $('promo-current-status');
    if (currentStatus) {
      if (promo && promo.status) {
        currentStatus.innerHTML = promoStatusBadge(promo.status);
      } else {
        currentStatus.innerHTML = '<span class="muted">Not yet created</span>';
      }
    }

    $('promoModalTitle').textContent = promo ? 'Edit Discount Code' : 'Add Discount Code';
    var statsWrap = $('promoStatsWrap');
    var statsText = $('promoStatsText');
    if (promo && statsWrap && statsText) {
      statsWrap.style.display = 'block';
      var rem = promo.remaining_uses == null ? 'Unlimited' : String(promo.remaining_uses);
      statsText.textContent = 'Uses: ' + String(promo.total_used || 0)
        + ' | Remaining: ' + rem
        + ' | Customer savings: ' + money(promo.total_discount_given || 0)
        + ' | Revenue generated: ' + money(promo.total_revenue_generated || 0)
        + ' | Created: ' + fmtDate(promo.created_at)
        + ' | Updated: ' + fmtDate(promo.updated_at);
    } else if (statsWrap) {
      statsWrap.style.display = 'none';
    }

    wrap.classList.remove('hidden');
    syncModalBodyLock();
  }

  function closePromoModal() {
    var wrap = $('promoModalWrap');
    if (wrap) wrap.classList.add('hidden');
    state.editingPromoId = null;
    syncModalBodyLock();
  }

  function collectPromoPayload(form) {
    var payload = {
      code: normalizePromoCode(form.elements.code.value),
      discount_type: String(form.elements.discount_type.value || 'percentage'),
      discount_value: Number(form.elements.discount_value.value),
      minimum_order: form.elements.minimum_order.value === '' ? null : Number(form.elements.minimum_order.value),
      usage_limit: form.elements.usage_limit.value === '' ? null : parseInt(form.elements.usage_limit.value, 10),
      uses_per_customer: form.elements.uses_per_customer.value === '' ? null : parseInt(form.elements.uses_per_customer.value, 10),
      starts_at: form.elements.starts_at.value || null,
      expires_at: form.elements.expires_at.value || null,
      active: form.elements.active.value === 'true',
      notes: String(form.elements.notes.value || '').trim() || null
    };
    return payload;
  }

  function updatePromo(id, body, successMessage) {
    return api('/api/admin/promos/' + id, { method: 'PUT', body: JSON.stringify(body) })
      .then(function () {
        toast(successMessage || 'Discount code updated');
        return loadPromos();
      })
      .catch(function (err) { toast(err.message || 'Failed to update discount code'); });
  }

  function savePromo(evt) {
    evt.preventDefault();
    var form = evt.target;
    var promoId = parseInt(form.elements.promo_id.value, 10);
    var payload = collectPromoPayload(form);

    var method = Number.isInteger(promoId) ? 'PUT' : 'POST';
    var path = Number.isInteger(promoId) ? '/api/admin/promos/' + promoId : '/api/admin/promos';

    api(path, { method: method, body: JSON.stringify(payload) })
      .then(function () {
        toast(Number.isInteger(promoId) ? 'Discount code updated' : 'Discount code created');
        closePromoModal();
        return loadPromos();
      })
      .catch(function (err) { toast(err.message || 'Failed to save discount code'); });
  }

  function deletePromo(id) {
    if (!window.confirm('Delete this discount code? If it has been used, it will be archived instead.')) {
      return Promise.resolve(false);
    }
    return api('/api/admin/promos/' + id, { method: 'DELETE' })
      .then(function (result) {
        toast(result && result.mode === 'archived' ? 'Code archived (already used)' : 'Discount code deleted');
        return loadPromos();
      })
      .catch(function (err) { toast(err.message || 'Failed to delete discount code'); });
  }

  function generatePromoCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = 'SAVE';
    for (var i = 0; i < 6; i += 1) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  function copyTextToClipboard(text) {
    var safe = String(text || '');
    if (!safe) {
      toast('No code to copy');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(safe).then(function () {
        toast('Code copied');
      }).catch(function () {
        toast('Could not copy code');
      });
      return;
    }
    var tmp = document.createElement('input');
    tmp.value = safe;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);
    toast('Code copied');
  }

  function openPromoAnalytics(id) {
    api('/api/admin/promos/' + id + '/analytics', { method: 'GET' })
      .then(function (data) {
        var panel = $('promoAnalytics');
        if (!panel) return;
        var a = data.analytics || {};
        var promo = data.promo || {};
        var usesRows = (a.uses_over_time || []).map(function (r) {
          return '<tr><td>' + esc(fmtDate(r.day)) + '</td><td>' + esc(String(r.uses || 0)) + '</td><td>' + money(r.discount_given || 0) + '</td><td>' + money(r.revenue_generated || 0) + '</td></tr>';
        }).join('') || '<tr><td colspan="4" class="muted">No usage yet.</td></tr>';

        var recentRows = (a.recent_redemptions || []).map(function (r) {
          return '<tr><td>' + esc(r.order_number || ('#' + r.order_id)) + '</td><td>' + money(r.discount_amount || 0) + '</td><td>' + money(r.final_total || 0) + '</td><td>' + esc(fmtDate(r.redeemed_at)) + '</td></tr>';
        }).join('') || '<tr><td colspan="4" class="muted">No recent redemptions.</td></tr>';

        var topProducts = (a.top_products || []).map(function (p) {
          return '<li>' + esc(p.name || 'Unknown') + ' - ' + esc(String(p.units || 0)) + ' units</li>';
        }).join('') || '<li class="muted">No product data yet.</li>';

        panel.innerHTML = ''
          + '<div style="display:flex;justify-content:space-between;align-items:center;">'
          + '<h3 style="margin:0;">Analytics: ' + esc(promo.code || '') + '</h3>'
          + '<button class="link-btn" id="closePromoAnalytics">Close</button>'
          + '</div>'
          + '<p class="muted">Average Order Value: ' + money(a.average_order_value || 0) + '</p>'
          + '<h4>Uses Over Time</h4>'
          + '<table class="admin-table"><thead><tr><th>Date</th><th>Uses</th><th>Discount Given</th><th>Revenue</th></tr></thead><tbody>' + usesRows + '</tbody></table>'
          + '<h4>Recent Redemptions</h4>'
          + '<table class="admin-table"><thead><tr><th>Order</th><th>Discount</th><th>Final Total</th><th>Redeemed At</th></tr></thead><tbody>' + recentRows + '</tbody></table>'
          + '<h4>Top Products Purchased</h4>'
          + '<ul>' + topProducts + '</ul>';
        panel.classList.remove('hidden');
        var closeBtn = $('closePromoAnalytics');
        if (closeBtn) {
          closeBtn.addEventListener('click', function () {
            panel.classList.add('hidden');
          });
        }
      })
      .catch(function (err) {
        toast(err.message || 'Failed to load promo analytics');
      });
  }

  function setVariantEditorMode(enabled) {
    $('variantCreateRow').classList.toggle('hidden', !enabled);
    $('btnAddVariant').classList.toggle('hidden', !enabled);
    $('variantListTable').classList.toggle('hidden', !enabled);
    $('variantHint').textContent = enabled
      ? 'Add dosage-specific pricing and inventory.'
      : 'Save product first to add variants.';
    $('variantEmpty').classList.toggle('hidden', !enabled);
  }

  function normalizeVariantName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function hasDuplicateVariantName(name, ignoreVariantId) {
    var key = normalizeVariantName(name);
    if (!key) return false;
    return (state.productVariants || []).some(function (v) {
      if (v.active === false) return false;
      if (ignoreVariantId != null && Number(v.id) === Number(ignoreVariantId)) return false;
      return normalizeVariantName(v.name) === key;
    });
  }

  function removeDuplicateVariants(productId, variants) {
    var activeVariants = (variants || []).filter(function (v) { return v.active !== false; });
    var seen = Object.create(null);
    var duplicateIds = [];
    activeVariants.forEach(function (v) {
      var key = normalizeVariantName(v.name);
      if (!key) return;
      if (seen[key]) {
        duplicateIds.push(v.id);
        return;
      }
      seen[key] = v.id;
    });

    if (!duplicateIds.length) return Promise.resolve(false);

    return Promise.all(duplicateIds.map(function (variantId) {
      return api('/api/admin/variants/' + variantId, { method: 'DELETE' }).catch(function () { return null; });
    })).then(function () {
      toast('Removed ' + duplicateIds.length + ' duplicate dosage option(s).');
      return true;
    });
  }

  function renderVariantRows() {
    var tbody = $('variantRows');
    if (!tbody) return;
    var variants = (state.productVariants || []).filter(function (v) { return v.active !== false; });
    if (!variants.length) {
      tbody.innerHTML = '';
      $('variantEmpty').textContent = 'No variants yet.';
      $('variantEmpty').classList.remove('hidden');
      // Remove stale tfoot and restore editable stock field
      var table = $('variantListTable');
      var tf = table && table.querySelector('tfoot');
      if (tf) tf.remove();
      var stockField = document.querySelector('#productForm [name="stock_quantity"]');
      if (stockField) { stockField.readOnly = false; stockField.title = ''; stockField.style.background = ''; }
      return;
    }
    $('variantEmpty').classList.add('hidden');
    tbody.innerHTML = variants.map(function (v) {
      return '<tr data-variant-id="' + v.id + '">'
        + '<td><input data-field="name" type="text" value="' + esc(v.name || '') + '" maxlength="100"></td>'
        + '<td><input data-field="price" type="number" min="0" step="0.01" value="' + Number(v.price || 0).toFixed(2) + '"></td>'
        + '<td><span class="stock-stepper">'
        + '<button class="btn-sm secondary" type="button" data-variant-dec="' + v.id + '">&#8722;</button>'
        + '<input data-field="stock_quantity" type="number" min="0" step="1" value="' + (Number(v.stock_quantity || 0)) + '">'
        + '<button class="btn-sm secondary" type="button" data-variant-inc="' + v.id + '">+</button>'
        + '</span></td>'
        + '<td>' + (v.active ? '<span class="badge green">active</span>' : '<span class="badge gray">inactive</span>') + '</td>'
        + '<td class="variant-actions">'
        + '<button class="btn-sm secondary" type="button" data-variant-save="' + v.id + '">Save</button>'
        + '<button class="btn-sm secondary" type="button" data-variant-toggle="' + v.id + '">' + (v.active ? 'Disable' : 'Enable') + '</button>'
        + '<button class="btn-sm danger" type="button" data-variant-delete="' + v.id + '">Delete</button>'
        + '</td>'
        + '</tr>';
    }).join('');

    // Total stock footer
    var totalQty = variants.reduce(function (sum, v) { return sum + Number(v.stock_quantity || 0); }, 0);
    var table = $('variantListTable');
    var tf = table.querySelector('tfoot');
    if (!tf) { tf = document.createElement('tfoot'); table.appendChild(tf); }
    tf.innerHTML = '<tr>'
      + '<td colspan="2" style="text-align:right;padding-right:.6rem;font-weight:600;border-top:2px solid #d1d9e6;">Total Available Stock:</td>'
      + '<td style="font-weight:700;border-top:2px solid #d1d9e6;" id="variantStockTotal">' + totalQty + '</td>'
      + '<td colspan="2" style="border-top:2px solid #d1d9e6;"></td>'
      + '</tr>';

    // Update product-form stock field to reflect variant total
    var stockField = document.querySelector('#productForm [name="stock_quantity"]');
    if (stockField && Number.isInteger(state.editingProductId)) {
      stockField.value = String(totalQty);
      stockField.readOnly = true;
      stockField.title = 'Auto-calculated from variant quantities';
      stockField.style.background = '#f4f6fa';
    }

    Array.prototype.forEach.call(tbody.querySelectorAll('[data-variant-save]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-variant-save'), 10);
        saveVariant(id);
      });
    });
    Array.prototype.forEach.call(tbody.querySelectorAll('[data-variant-toggle]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-variant-toggle'), 10);
        toggleVariant(id);
      });
    });
    Array.prototype.forEach.call(tbody.querySelectorAll('[data-variant-delete]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-variant-delete'), 10);
        disableVariant(id);
      });
    });
    Array.prototype.forEach.call(tbody.querySelectorAll('[data-variant-dec]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-variant-dec'), 10);
        adjustVariantStock(id, -1);
      });
    });
    Array.prototype.forEach.call(tbody.querySelectorAll('[data-variant-inc]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-variant-inc'), 10);
        adjustVariantStock(id, 1);
      });
    });
  }

  function loadVariants(productId) {
    if (!Number.isInteger(productId)) return Promise.resolve();
    return api('/api/admin/products/' + productId + '/variants')
      .then(function (data) {
        var variants = data.variants || [];
        return removeDuplicateVariants(productId, variants).then(function (removed) {
          if (!removed) {
            state.productVariants = variants;
            renderVariantRows();
            return;
          }
          return api('/api/admin/products/' + productId + '/variants').then(function (fresh) {
            state.productVariants = fresh.variants || [];
            renderVariantRows();
          });
        });
      })
      .catch(function (err) {
        state.productVariants = [];
        renderVariantRows();
        toast(err.message || 'Failed to load variants');
      });
  }

  function getVariantRowPayload(variantId) {
    var row = $('variantRows').querySelector('tr[data-variant-id="' + variantId + '"]');
    if (!row) return null;
    var name = row.querySelector('input[data-field="name"]');
    var price = row.querySelector('input[data-field="price"]');
    var stock = row.querySelector('input[data-field="stock_quantity"]');
    var current = state.productVariants.find(function (v) { return Number(v.id) === Number(variantId); });
    return {
      name: String(name && name.value || '').trim(),
      price: Number(price && price.value),
      stock_quantity: parseInt(stock && stock.value, 10),
      active: current ? !!current.active : true
    };
  }

  function adjustVariantStock(variantId, delta) {
    api('/api/admin/variants/' + variantId + '/stock', {
      method: 'PATCH',
      body: JSON.stringify({ adjustment: delta })
    }).then(function (data) {
      var updated = data.variant;
      if (updated) {
        var v = state.productVariants.find(function (x) { return Number(x.id) === Number(variantId); });
        if (v) v.stock_quantity = Number(updated.stock_quantity);
      }
      renderVariantRows();
      loadProducts();
    }).catch(function (err) { toast(err.message || 'Failed to adjust stock'); });
  }

  function saveVariant(variantId) {
    var payload = getVariantRowPayload(variantId);
    if (!payload) return;
    if (hasDuplicateVariantName(payload.name, variantId)) {
      toast('Duplicate dosage for this product is not allowed.');
      return;
    }
    api('/api/admin/variants/' + variantId, { method: 'PUT', body: JSON.stringify(payload) })
      .then(function () {
        toast('Variant updated');
        return loadVariants(state.editingProductId);
      })
      .then(function () { return loadProducts(); })
      .catch(function (err) { toast(err.message || 'Failed to update variant'); });
  }

  function toggleVariant(variantId) {
    var payload = getVariantRowPayload(variantId);
    var current = state.productVariants.find(function (v) { return Number(v.id) === Number(variantId); });
    if (!current) return;
    payload.active = !current.active;
    if (payload.active && hasDuplicateVariantName(payload.name, variantId)) {
      toast('Enable blocked: duplicate dosage already exists for this product.');
      return;
    }
    api('/api/admin/variants/' + variantId, { method: 'PUT', body: JSON.stringify(payload) })
      .then(function () {
        toast(payload.active ? 'Variant enabled' : 'Variant disabled');
        return loadVariants(state.editingProductId);
      })
      .then(function () { return loadProducts(); })
      .catch(function (err) { toast(err.message || 'Failed to update variant'); });
  }

  function disableVariant(variantId) {
    api('/api/admin/variants/' + variantId, { method: 'DELETE' })
      .then(function (data) {
        toast(data && data.mode === 'hard_delete' ? 'Variant deleted' : 'Variant archived');
        return loadVariants(state.editingProductId);
      })
      .then(function () { return loadProducts(); })
      .catch(function (err) { toast(err.message || 'Failed to delete variant'); });
  }

  function addVariant() {
    if (!Number.isInteger(state.editingProductId)) {
      toast('Save product before adding variants');
      return;
    }
    var payload = {
      name: String($('variantName').value || '').trim(),
      price: Number($('variantPrice').value),
      stock_quantity: parseInt($('variantStock').value, 10),
      active: true
    };
    if (hasDuplicateVariantName(payload.name, null)) {
      toast('Duplicate dosage for this product is not allowed.');
      return;
    }
    api('/api/admin/products/' + state.editingProductId + '/variants', {
      method: 'POST', body: JSON.stringify(payload)
    }).then(function () {
      $('variantName').value = '';
      $('variantPrice').value = '';
      $('variantStock').value = '';
      toast('Variant created');
      return loadVariants(state.editingProductId);
    }).then(function () { return loadProducts(); })
    .catch(function (err) { toast(err.message || 'Failed to create variant'); });
  }

  function openProductModal(product) {
    var wrap = $('productModalWrap');
    var form = $('productForm');
    if (!wrap || !form) return;
    form.reset();
    form.elements.product_id.value = product && product.id ? String(product.id) : '';
    form.elements.name.value = product && product.name || '';
    form.elements.slug.value = product && product.slug || '';
    form.elements.description.value = product && product.description || '';
    form.elements.price.value = product && product.price != null ? Number(product.price).toFixed(2) : '';
    form.elements.category.value = product && product.category || '';
    form.elements.image_url.value = product && product.image_url || '';
    form.elements.sku.value = product && product.sku || '';
    form.elements.stock_quantity.value = product && product.stock_quantity != null ? String(product.stock_quantity) : '0';
    form.elements.active.value = product && product.active === false ? 'false' : 'true';
    state.editingProductId = product && product.id ? Number(product.id) : null;
    state.productVariants = [];
    renderVariantRows();
    if (Number.isInteger(state.editingProductId)) {
      setVariantEditorMode(true);
      loadVariants(state.editingProductId);
    } else {
      setVariantEditorMode(false);
    }
    $('productModalTitle').textContent = product && product.id ? 'Edit Product' : 'Add Product';
    wrap.classList.remove('hidden');
    syncModalBodyLock();
  }

  function closeProductModal() {
    var wrap = $('productModalWrap');
    if (wrap) wrap.classList.add('hidden');
    state.editingProductId = null;
    state.productVariants = [];
    syncModalBodyLock();
  }

  function collectProductPayload(form) {
    var price = Number(form.elements.price.value);
    var stock = parseInt(form.elements.stock_quantity.value, 10);
    return {
      name: String(form.elements.name.value || '').trim(),
      slug: slugify(form.elements.slug.value),
      description: String(form.elements.description.value || '').trim(),
      price: Number.isFinite(price) ? price : null,
      category: String(form.elements.category.value || '').trim(),
      image_url: String(form.elements.image_url.value || '').trim(),
      sku: String(form.elements.sku.value || '').trim(),
      stock_quantity: Number.isInteger(stock) ? stock : null,
      active: form.elements.active.value === 'true'
    };
  }

  function saveProduct(evt) {
    evt.preventDefault();
    var form = evt.target;
    var id = parseInt(form.elements.product_id.value, 10);
    var body = collectProductPayload(form);
    var method = Number.isInteger(id) ? 'PUT' : 'POST';
    var path = Number.isInteger(id) ? '/api/admin/products/' + id : '/api/admin/products';

    api(path, { method: method, body: JSON.stringify(body) })
      .then(function () {
        toast(Number.isInteger(id) ? 'Product updated' : 'Product created');
        closeProductModal();
        return loadProducts();
      })
      .catch(function (err) { toast(err.message || 'Failed to save product'); });
  }

  function updateProductStatus(id, active) {
    api('/api/admin/products/' + id + '/status', {
      method: 'PUT', body: JSON.stringify({ active: active })
    }).then(function () {
      toast(active ? 'Product enabled' : 'Product disabled');
      return loadProducts();
    }).catch(function (err) { toast(err.message || 'Failed to update product status'); });
  }

  function removeProduct(id) {
    api('/api/admin/products/' + id, { method: 'DELETE' })
      .then(function () {
        toast('Product disabled');
        return loadProducts();
      })
      .catch(function (err) { toast(err.message || 'Failed to delete product'); });
  }

  function switchTab(tab) {
    if (tab === 'products' || tab === 'orders' || tab === 'promos') {
      state.tab = tab;
    } else {
      state.tab = 'orders';
    }
    Array.prototype.forEach.call($('adminTabs').querySelectorAll('button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === state.tab);
    });
    $('ordersSection').classList.toggle('hidden', state.tab !== 'orders');
    $('productsSection').classList.toggle('hidden', state.tab !== 'products');
    $('promosSection').classList.toggle('hidden', state.tab !== 'promos');
    if (state.tab === 'products') {
      loadProducts();
    } else if (state.tab === 'promos') {
      loadPromos();
    } else {
      loadOrders();
    }
  }

  function renderTable() {
    var body = $('ordersBody');
    if (!state.orders.length) {
      body.innerHTML = '<tr><td colspan="8" class="muted">No orders found.</td></tr>';
      return;
    }
    body.innerHTML = state.orders.map(function (o) {
      var tracking = o.tracking_number
        ? (esc(o.carrier ? o.carrier + ' ' : '') + esc(o.tracking_number))
        : '<span class="muted">\u2014</span>';
      return '<tr>'
        + '<td>' + esc(o.order_number) + '</td>'
        + '<td>' + esc(o.shipping_name || '') + '<br><span class="muted">' + esc(o.shipping_email || '') + '</span></td>'
        + '<td>' + esc(fmtDate(o.created_at)) + '</td>'
        + '<td>' + money(o.total) + '</td>'
        + '<td>' + statusBadge(o.status) + '</td>'
        + '<td>' + fulfillmentBadge(o.fulfillment_status) + '</td>'
        + '<td>' + tracking + '</td>'
        + '<td><button class="link-btn" data-open="' + o.id + '">Open</button></td>'
        + '</tr>';
    }).join('');
    Array.prototype.forEach.call(body.querySelectorAll('[data-open]'), function (btn) {
      btn.addEventListener('click', function () { openOrder(parseInt(btn.getAttribute('data-open'), 10)); });
    });
  }

  function openOrder(id) {
    state.currentId = id;
    return api('/api/admin/orders/' + id).then(function (d) { renderDetail(d); })
      .catch(function (err) { toast(err.message || 'Failed to open order'); });
  }

  function renderDetail(d) {
    var order = d.order || {};
    var addr = d.shipping_address || {};
    var items = d.items || [];
    var tr = d.tracking || {};
    var panel = $('orderDetail');
    var itemsRows = items.map(function (it) {
      return '<tr><td>' + esc(it.name) + '</td><td>' + (Number(it.quantity) || 0) + '</td><td>'
        + money(it.price) + '</td><td>' + money(Number(it.price) * (Number(it.quantity) || 0)) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="muted">No items</td></tr>';

    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;">'
      + '<h2 style="margin:0;">' + esc(order.order_number) + '</h2>'
      + '<button class="link-btn" id="detailClose">Close</button></div>'
      + '<p>Status: ' + statusBadge(order.status) + ' &nbsp; Fulfillment: '
      + fulfillmentBadge(tr.shipped_at ? 'shipped' : (tr.shipping_label_url ? 'label_created' : 'unfulfilled')) + '</p>'
      + '<div class="admin-grid">'
      + '<div><h3>Customer</h3><div>' + esc(d.customer && d.customer.name || '') + '</div>'
      + '<div class="muted">' + esc(d.customer && d.customer.email || '') + '</div></div>'
      + '<div><h3>Shipping address</h3>'
      + '<div>' + esc(addr.name || '') + '</div>'
      + '<div>' + esc(addr.address || '') + '</div>'
      + '<div>' + esc([addr.city, addr.state, addr.zip].filter(Boolean).join(', ')) + '</div></div>'
      + '</div>'
      + '<h3 style="margin-top:1rem;">Items</h3>'
      + '<table class="admin-table"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Line total</th></tr></thead>'
      + '<tbody>' + itemsRows + '</tbody></table>'
      + '<p style="margin-top:.6rem;">Subtotal: ' + money(d.totals && d.totals.subtotal) + ' &nbsp; '
      + ((Number(d.totals && d.totals.discount_amount || 0) > 0)
        ? ('Discount (' + esc((d.totals && d.totals.promo_code) || '') + '): -' + money(d.totals && d.totals.discount_amount) + ' &nbsp; ')
        : '')
      + 'Shipping: ' + money(d.totals && d.totals.shipping_cost) + ' &nbsp; '
      + '<strong>Total: ' + money(d.totals && d.totals.total) + '</strong></p>'
      + '<h3 style="margin-top:1rem;">Tracking</h3>'
      + '<div>Carrier: ' + esc(tr.carrier || '\u2014') + ' &nbsp; Tracking #: ' + esc(tr.tracking_number || '\u2014') + '</div>'
      + '<div>Label: ' + (tr.shipping_label_url ? '<a href="' + esc(tr.shipping_label_url) + '" target="_blank" rel="noopener">view label</a>' : '<span class="muted">none</span>') + '</div>'
      + '<div class="track-form">'
      + '<input id="tfCarrier" placeholder="Carrier" value="' + esc(tr.carrier || '') + '">'
      + '<input id="tfTracking" placeholder="Tracking number" value="' + esc(tr.tracking_number || '') + '">'
      + '<input id="tfLabel" placeholder="Label URL" value="' + esc(tr.shipping_label_url || '') + '">'
      + '<button class="secondary" id="btnSaveTracking">Add Tracking</button>'
      + '</div>'
      + '<div class="admin-actions">'
      + '<button id="btnLabel">Create Shipping Label</button>'
      + '<button class="secondary" id="btnProcessing">Mark Processing</button>'
      + '<button id="btnShipped">Mark Shipped</button>'
      + '</div>';
    panel.classList.remove('hidden');

    $('detailClose').addEventListener('click', function () { panel.classList.add('hidden'); });
    $('btnLabel').addEventListener('click', createLabel);
    $('btnProcessing').addEventListener('click', function () { setStatus('processing'); });
    $('btnShipped').addEventListener('click', function () { setStatus('shipped'); });
    $('btnSaveTracking').addEventListener('click', saveTracking);
  }

  function createLabel() {
    api('/api/admin/orders/' + state.currentId + '/label', { method: 'POST', body: '{}' })
      .then(function (r) {
        var lbl = r.label || {};
        toast('Label created \u2014 ' + (lbl.carrier || '') + ' ' + (lbl.tracking_number || ''));
        return openOrder(state.currentId);
      }).then(loadOrders)
      .catch(function (err) { toast(err.message || 'Failed to create label'); });
  }

  function setStatus(status) {
    api('/api/admin/orders/' + state.currentId + '/status', { method: 'PUT', body: JSON.stringify({ status: status }) })
      .then(function () { toast('Status \u2192 ' + status); return openOrder(state.currentId); })
      .then(loadOrders)
      .catch(function (err) { toast(err.message || 'Failed to update status'); });
  }

  function saveTracking() {
    var body = {
      carrier: $('tfCarrier').value,
      tracking_number: $('tfTracking').value,
      shipping_label_url: $('tfLabel').value
    };
    api('/api/admin/orders/' + state.currentId + '/shipping', { method: 'PUT', body: JSON.stringify(body) })
      .then(function () { toast('Tracking saved'); return openOrder(state.currentId); })
      .then(loadOrders)
      .catch(function (err) { toast(err.message || 'Failed to save tracking'); });
  }

  function wire() {
    var search = $('adminSearch');
    var timer = null;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.search = search.value.trim(); loadOrders(); }, 300);
    });
    Array.prototype.forEach.call($('adminFilters').querySelectorAll('button'), function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call($('adminFilters').querySelectorAll('button'), function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.filter = btn.getAttribute('data-filter') || '';
        loadOrders();
      });
    });
    var lb = $('adminLoginBtn');
    if (lb) lb.addEventListener('click', function () { window.location.href = 'account.html'; });

    var productSearch = $('productSearch');
    if (productSearch) {
      var pTimer = null;
      productSearch.addEventListener('input', function () {
        clearTimeout(pTimer);
        pTimer = setTimeout(function () {
          state.productSearch = productSearch.value.trim();
          renderProductTable();
        }, 250);
      });
    }

    var tabs = $('adminTabs');
    if (tabs) {
      Array.prototype.forEach.call(tabs.querySelectorAll('button[data-tab]'), function (btn) {
        btn.addEventListener('click', function () { switchTab(btn.getAttribute('data-tab')); });
      });
    }

    var addBtn = $('btnAddProduct');
    if (addBtn) addBtn.addEventListener('click', function () { openProductModal(null); });
    var addVariantBtn = $('btnAddVariant');
    if (addVariantBtn) addVariantBtn.addEventListener('click', addVariant);
    var modalClose = $('productModalClose');
    if (modalClose) modalClose.addEventListener('click', closeProductModal);
    var modalCancel = $('productModalCancel');
    if (modalCancel) modalCancel.addEventListener('click', closeProductModal);
    var productForm = $('productForm');
    if (productForm) {
      productForm.addEventListener('submit', saveProduct);
      var slugInput = productForm.elements.slug;
      var nameInput = productForm.elements.name;
      nameInput.addEventListener('input', function () {
        if (!slugInput.value.trim()) {
          slugInput.value = slugify(nameInput.value);
        }
      });
      slugInput.addEventListener('blur', function () {
        slugInput.value = slugify(slugInput.value);
      });
    }

    var modalWrap = $('productModalWrap');
    if (modalWrap) {
      modalWrap.addEventListener('click', function (evt) {
        if (evt.target === modalWrap) closeProductModal();
      });
    }

    var promoSearch = $('promoSearch');
    if (promoSearch) {
      var promoTimer = null;
      promoSearch.addEventListener('input', function () {
        clearTimeout(promoTimer);
        promoTimer = setTimeout(function () {
          state.promoSearch = promoSearch.value.trim();
          loadPromos();
        }, 250);
      });
    }

    var promoFilters = $('promoFilters');
    if (promoFilters) {
      Array.prototype.forEach.call(promoFilters.querySelectorAll('button[data-filter]'), function (btn) {
        btn.addEventListener('click', function () {
          Array.prototype.forEach.call(promoFilters.querySelectorAll('button[data-filter]'), function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          state.promoFilter = btn.getAttribute('data-filter') || '';
          loadPromos();
        });
      });
    }

    var addPromoBtn = $('btnAddPromo');
    if (addPromoBtn) addPromoBtn.addEventListener('click', function () { openPromoModal(null); });
    var promoClose = $('promoModalClose');
    if (promoClose) promoClose.addEventListener('click', closePromoModal);
    var promoCancel = $('promoModalCancel');
    if (promoCancel) promoCancel.addEventListener('click', closePromoModal);
    var promoForm = $('promoForm');
    if (promoForm) promoForm.addEventListener('submit', savePromo);

    var promoGenerateBtn = $('promoGenerateBtn');
    if (promoGenerateBtn) {
      promoGenerateBtn.addEventListener('click', function () {
        var form = $('promoForm');
        if (!form) return;
        form.elements.code.value = generatePromoCode();
      });
    }

    var promoCopyBtn = $('promoCopyBtn');
    if (promoCopyBtn) {
      promoCopyBtn.addEventListener('click', function () {
        var form = $('promoForm');
        if (!form) return;
        copyTextToClipboard(form.elements.code.value);
      });
    }

    var promoModalWrap = $('promoModalWrap');
    if (promoModalWrap) {
      promoModalWrap.addEventListener('click', function (evt) {
        if (evt.target === promoModalWrap) closePromoModal();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    wire();
    loadOrders();
  });
})();
