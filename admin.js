(function () {
  'use strict';

  var state = {
    tab: 'home',
    filter: '',
    search: '',
    orders: [],
    statuses: [],
    pagination: { page: 1, page_size: 25, total_count: 0, total_pages: 1 },
    summary: null,
    currentId: null,
    products: [],
    productSearch: '',
    editingProductId: null,
    productVariants: [],
    promos: [],
    promoSearch: '',
    promoFilter: '',
    promoSummary: null,
    editingPromoId: null,
    orderDetail: null,
    coas: [],
    coaSearch: '',
    coaStatusFilter: '',
    editingCoaId: null,
    coaProducts: [],
    coaVariants: [],
    shipping: {
      shipmentId: null,
      selectedRateId: null,
      rates: [],
      loadingRates: false,
      loadingPurchase: false,
      loadingVoid: false,
      error: '',
      info: '',
      addressVerification: null,
      package: {
        pounds: '',
        ounces: '',
        length: '',
        width: '',
        height: ''
      }
    }
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
    var coaWrap = $('coaModalWrap');
    var productOpen = !!(productWrap && !productWrap.classList.contains('hidden'));
    var promoOpen = !!(promoWrap && !promoWrap.classList.contains('hidden'));
    var coaOpen = !!(coaWrap && !coaWrap.classList.contains('hidden'));
    document.body.classList.toggle('modal-open', productOpen || promoOpen || coaOpen);
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
          err.status = res.status; err.code = data.code; err.details = data.details; throw err;
        }
        if (data && typeof data === 'object') {
          data._status = res.status;
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
    var label = String(status || '').trim();
    var normalized = label.toLowerCase();

    if (normalized === 'processing' || normalized === 'paid' || normalized === 'available') cls = 'blue';
    else if (normalized === 'shipped' || normalized === 'pending' || normalized === 'awaiting_payment') cls = 'amber';
    else if (normalized === 'completed' || normalized === 'delivered') cls = 'green';
    else if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'missing') cls = 'red';

    if (!label) label = 'Unknown';
    else if (normalized === 'pending_payment') label = 'Pending payment';
    else if (normalized === 'awaiting_payment') label = 'Awaiting payment';
    else if (normalized === 'processing') label = 'Processing';
    else if (normalized === 'paid') label = 'Paid';
    else if (normalized === 'shipped') label = 'Shipped';
    else if (normalized === 'completed') label = 'Completed';
    else if (normalized === 'cancelled' || normalized === 'canceled') label = 'Cancelled';
    else if (normalized === 'pending') label = 'Pending';
    else if (normalized === 'delivered') label = 'Delivered';
    else if (normalized === 'available') label = 'Available';
    else if (normalized === 'missing') label = 'Missing';
    else label = label.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });

    return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
  }
  function fulfillmentBadge(f) {
    var cls = 'gray', label = f || 'unfulfilled';
    if (f === 'shipped') { cls = 'green'; }
    else if (f === 'label_created') { cls = 'blue'; label = 'label created'; }
    return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
  }

  function shipmentStatusBadge(status) {
    var value = String(status || '').toLowerCase();
    if (value === 'label_created') return '<span class="badge blue">Label created</span>';
    if (value === 'pre_transit') return '<span class="badge amber">Pre-transit</span>';
    if (value === 'in_transit') return '<span class="badge blue">In transit</span>';
    if (value === 'out_for_delivery') return '<span class="badge blue">Out for delivery</span>';
    if (value === 'delivered') return '<span class="badge green">Delivered</span>';
    if (value === 'available_for_pickup') return '<span class="badge amber">Available for pickup</span>';
    if (value === 'return_to_sender') return '<span class="badge red">Return to sender</span>';
    if (value === 'failure') return '<span class="badge red">Failure</span>';
    if (value === 'cancelled') return '<span class="badge red">Cancelled</span>';
    if (value === 'voided') return '<span class="badge gray">Voided</span>';
    if (value === 'rated') return '<span class="badge gray">Rates ready</span>';
    return '<span class="badge gray">' + esc(value ? value.replace(/_/g, ' ') : 'unknown') + '</span>';
  }

  function formatShippingAddress(row) {
    if (!row) return 'No shipping address on file.';
    var lines = [];
    if (row.name) lines.push(row.name);
    if (row.address) lines.push(row.address);
    var cityStateZip = [row.city, row.state, row.zip].filter(Boolean).join(', ');
    if (cityStateZip) lines.push(cityStateZip);
    if (row.country) lines.push(row.country);
    if (row.phone) lines.push('Phone: ' + row.phone);
    if (row.email) lines.push('Email: ' + row.email);
    return lines.join('\n');
  }

  function formatShipmentAddress(address) {
    if (!address) return 'No address';
    var lines = [];
    if (address.name) lines.push(address.name);
    if (address.company) lines.push(address.company);
    if (address.street1) lines.push(address.street1);
    if (address.street2) lines.push(address.street2);
    var cityStateZip = [address.city, address.state, address.zip].filter(Boolean).join(', ');
    if (cityStateZip) lines.push(cityStateZip);
    if (address.country) lines.push(address.country);
    return lines.join('\n');
  }

  function shippingPackagePayload() {
    return {
      pounds: Number($('shipWeightPounds') && $('shipWeightPounds').value),
      ounces: Number($('shipWeightOunces') && $('shipWeightOunces').value),
      length: Number($('shipLength') && $('shipLength').value),
      width: Number($('shipWidth') && $('shipWidth').value),
      height: Number($('shipHeight') && $('shipHeight').value)
    };
  }

  function setShippingPackageInputs() {
    if ($('shipWeightPounds')) $('shipWeightPounds').value = state.shipping.package.pounds;
    if ($('shipWeightOunces')) $('shipWeightOunces').value = state.shipping.package.ounces;
    if ($('shipLength')) $('shipLength').value = state.shipping.package.length;
    if ($('shipWidth')) $('shipWidth').value = state.shipping.package.width;
    if ($('shipHeight')) $('shipHeight').value = state.shipping.package.height;
  }

  function loadOrders() {
    var qs = [];
    var status = filterToStatus(state.filter);
    if (status) qs.push('status=' + encodeURIComponent(status));
    if (state.search) qs.push('search=' + encodeURIComponent(state.search));
    qs.push('page=' + encodeURIComponent(state.pagination.page || 1));
    qs.push('page_size=' + encodeURIComponent(state.pagination.page_size || 25));
    qs.push('sort_by=created_at');
    qs.push('sort_dir=desc');
    var url = '/api/admin/orders' + (qs.length ? ('?' + qs.join('&')) : '');
    return api(url).then(function (data) {
      state.orders = data.orders || [];
      state.statuses = data.statuses || [];
      state.pagination = data.pagination || state.pagination;
      if ($('adminDenied')) $('adminDenied').classList.add('hidden');
      if ($('adminApp')) $('adminApp').classList.remove('hidden');
      renderDashboard();
      renderTable();
    }).catch(function (err) {
      if (err.status === 401 || err.status === 403) { showDenied(err.status); }
      else { toast(err.message || 'Failed to load orders'); }
    });
  }

  function loadSummary() {
    return api('/api/admin/summary').then(function (data) {
      state.summary = data || null;
      if ($('adminDenied')) $('adminDenied').classList.add('hidden');
      if ($('adminApp')) $('adminApp').classList.remove('hidden');
      renderDashboard();
      return data;
    }).catch(function (err) {
      if (err.status === 401 || err.status === 403) { showDenied(err.status); }
      else { toast(err.message || 'Failed to load dashboard summary'); }
    });
  }

  function renderDashboard() {
    var wrap = $('dashboardSummary');
    if (!wrap) return;

    var s = state.summary || {};
    var counts = s.counts || {};
    var sales = s.sales || {};
    var discounts = s.discounts || {};
    var cards = [
      { label: 'Orders requiring fulfillment', value: Number(counts.requiring_fulfillment || 0), action: 'ready_to_ship' },
      { label: 'Pending payment', value: Number(counts.pending_payment || 0), action: 'pending_payment' },
      { label: 'Paid orders', value: Number(counts.paid || 0), action: 'paid' },
      { label: 'Shipped orders', value: Number(counts.shipped || 0), action: 'shipped' },
      { label: 'Low-stock variants', value: Array.isArray(s.low_stock_variants) ? s.low_stock_variants.length : 0, action: 'products' },
      { label: 'Out-of-stock variants', value: Array.isArray(s.out_of_stock_variants) ? s.out_of_stock_variants.length : 0, action: 'products' },
      { label: '30-day sales', value: money(sales.sales_total_30d || 0), action: 'orders' },
      { label: 'Promo redemptions', value: Number(discounts.redemptions_30d || 0), action: 'promos' }
    ];

    wrap.innerHTML = cards.map(function (card) {
      return '<button type="button" class="dash-card" data-summary-action="' + esc(card.action) + '">'
        + '<span class="dash-label">' + esc(card.label) + '</span>'
        + '<span class="dash-value">' + esc(card.value) + '</span>'
        + '</button>';
    }).join('');

    Array.prototype.forEach.call(wrap.querySelectorAll('[data-summary-action]'), function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-summary-action');
        if (action === 'products') {
          switchTab('products');
          return;
        }
        if (action === 'promos') {
          switchTab('promos');
          return;
        }
        state.filter = '';
        if (action === 'ready_to_ship') state.filter = 'processing';
        if (action === 'pending_payment') state.filter = 'new';
        if (action === 'paid') state.filter = '';
        if (action === 'shipped') state.filter = 'shipped';
        switchTab('orders');
      });
    });

    var recentOrders = $('dashboardRecentOrders');
    if (recentOrders) {
      recentOrders.innerHTML = (s.recent_orders || []).map(function (o) {
        return '<tr>'
          + '<td>' + esc(o.order_number || '') + '</td>'
          + '<td>' + esc(fmtDate(o.created_at)) + '</td>'
          + '<td>' + esc(o.shipping_name || '') + '</td>'
          + '<td>' + statusBadge(o.status) + '</td>'
          + '<td>' + money(o.total) + '</td>'
          + '<td><button type="button" class="link-btn" data-open-order="' + o.id + '">Open</button></td>'
          + '</tr>';
      }).join('') || '<tr><td colspan="6" class="muted">No recent orders.</td></tr>';
      Array.prototype.forEach.call(recentOrders.querySelectorAll('[data-open-order]'), function (btn) {
        btn.addEventListener('click', function () {
          openOrder(parseInt(btn.getAttribute('data-open-order'), 10));
          switchTab('orders');
        });
      });
    }

    var recentCustomers = $('dashboardRecentCustomers');
    if (recentCustomers) {
      recentCustomers.innerHTML = (s.recent_customers || []).map(function (customer) {
        return '<li><span>' + esc(customer.name || customer.email || 'Customer') + '</span><span class="muted">' + esc(fmtDate(customer.created_at)) + '</span></li>';
      }).join('') || '<li class="muted">No recent customers.</li>';
    }

    var alerts = $('adminAlertStrip');
    if (alerts) {
      var alertBits = [];
      if ((counts.label_not_purchased || 0) > 0) alertBits.push(String(counts.label_not_purchased) + ' orders still need labels');
      if ((counts.missing_tracking || 0) > 0) alertBits.push(String(counts.missing_tracking) + ' shipped orders need tracking numbers');
      if ((discounts.redemptions_30d || 0) > 0) alertBits.push(String(discounts.redemptions_30d) + ' promo redemptions in the last 30 days');
      alerts.textContent = alertBits.length ? alertBits.join(' • ') : 'No operational alerts right now.';
    }
  }

  function showDenied(status) {
    var app = $('adminApp');
    var d = $('adminDenied');
    if (app) app.classList.add('hidden');
    if (d) {
      d.classList.remove('hidden');
      var msg = d.querySelector('p');
      if (msg) {
        msg.textContent = status === 401
          ? 'You must be signed in as an administrator to use this console.'
          : 'Your account does not have admin access.';
      }
    }
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
    if (tab === 'home' || tab === 'products' || tab === 'orders' || tab === 'promos' || tab === 'coas' || tab === 'reviews' || tab === 'customers') {
      state.tab = tab;
    } else {
      state.tab = 'home';
    }
    var tabs = $('adminTabs');
    if (tabs) {
      Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === state.tab);
      });
    }
    if ($('homeSection')) $('homeSection').classList.toggle('hidden', state.tab !== 'home');
    if ($('ordersSection')) $('ordersSection').classList.toggle('hidden', state.tab !== 'orders');
    if ($('productsSection')) $('productsSection').classList.toggle('hidden', state.tab !== 'products');
    if ($('promosSection')) $('promosSection').classList.toggle('hidden', state.tab !== 'promos');
    if ($('coasSection')) $('coasSection').classList.toggle('hidden', state.tab !== 'coas');
      if ($('reviewsSection')) $('reviewsSection').classList.toggle('hidden', state.tab !== 'reviews');
    if ($('customersSection')) $('customersSection').classList.toggle('hidden', state.tab !== 'customers');
    if (state.tab === 'home') {
      loadSummary();
    } else if (state.tab === 'products') {
      loadProducts();
    } else if (state.tab === 'promos') {
      loadPromos();
    } else if (state.tab === 'coas') {
      loadCoas();
    } else if (state.tab === 'reviews') {
      loadReviews();
    } else if (state.tab === 'customers') {
      loadCustomers();
    } else {
      loadOrders();
    }
  }

  function renderTable() {
    var body = $('ordersBody');
    if (!state.orders.length) {
      body.innerHTML = '<tr><td colspan="10" class="muted">No orders found.</td></tr>';
      return;
    }
    body.innerHTML = state.orders.map(function (o) {
      var tracking = o.tracking_number
        ? (esc(o.carrier ? o.carrier + ' ' : '') + esc(o.tracking_number))
        : '<span class="muted">\u2014</span>';
      return '<tr>'
        + '<td>' + esc(o.order_number) + '</td>'
        + '<td>' + esc(fmtDate(o.created_at)) + '</td>'
        + '<td>' + esc(o.shipping_name || '') + '<br><span class="muted">' + esc(o.shipping_email || '') + '</span></td>'
        + '<td>' + money(o.total) + '</td>'
        + '<td>' + esc(String(o.item_count || 0)) + '</td>'
        + '<td>' + statusBadge(o.status) + '</td>'
        + '<td>' + fulfillmentBadge(o.fulfillment_status) + '</td>'
        + '<td>' + tracking + '</td>'
        + '<td>' + statusBadge(o.payment_status) + '</td>'
        + '<td>' + statusBadge(o.tracking_status) + '</td>'
        + '<td><button class="link-btn" data-open="' + o.id + '">Open</button></td>'
        + '</tr>';
    }).join('');
    Array.prototype.forEach.call(body.querySelectorAll('[data-open]'), function (btn) {
      btn.addEventListener('click', function () { openOrder(parseInt(btn.getAttribute('data-open'), 10)); });
    });
  }

  function openOrder(id) {
    state.currentId = id;
    state.shipping.shipmentId = null;
    state.shipping.selectedRateId = null;
    state.shipping.rates = [];
    state.shipping.loadingRates = false;
    state.shipping.loadingPurchase = false;
    state.shipping.loadingVoid = false;
    state.shipping.error = '';
    state.shipping.info = '';
    state.shipping.addressVerification = null;
    return api('/api/admin/orders/' + id).then(function (d) { renderDetail(d); })
      .catch(function (err) { toast(err.message || 'Failed to open order'); });
  }

  function renderDetail(d) {
    state.orderDetail = d || null;

    var order = d.order || {};
    var addr = d.shipping_address || {};
    var items = d.items || [];
    var shipments = Array.isArray(d.shipments) ? d.shipments : [];
    var latestShipment = shipments.length ? shipments[0] : null;
    var activeShipment = shipments.find(function (s) { return s.purchasedAt && !s.isVoided; }) || null;
    var displayShipment = activeShipment || latestShipment || null;
    var panel = $('orderDetail');
    var itemsRows = items.map(function (it) {
      var variant = it.variant_name ? '<div class="muted">' + esc(it.variant_name) + '</div>' : '';
      return '<tr><td>' + esc(it.name) + variant + '</td><td>' + (Number(it.quantity) || 0) + '</td><td>'
        + money(it.price) + '</td><td>' + money(Number(it.price) * (Number(it.quantity) || 0)) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="muted">No items</td></tr>';
    var timelineRows = (d.timeline || []).map(function (entry) {
      return '<li><strong>' + esc(entry.label || entry.type || '') + '</strong><span class="muted">' + esc(fmtDate(entry.at)) + '</span></li>';
    }).join('') || '<li class="muted">No timeline events yet.</li>';
    var rates = Array.isArray(state.shipping.rates) ? state.shipping.rates : [];
    var selectedRate = rates.find(function (rate) { return rate.rateId === state.shipping.selectedRateId; }) || null;
    var shipmentHistoryRows = shipments.map(function (shipment) {
      var rateText = [shipment.carrier, shipment.service].filter(Boolean).join(' ');
      var labelLink = shipment.labelUrl ? '<a href="' + esc(shipment.labelUrl) + '" target="_blank" rel="noopener">open</a>' : '<span class="muted">none</span>';
      return '<tr>'
        + '<td>' + esc(fmtDate(shipment.createdAt || shipment.purchasedAt || shipment.updatedAt)) + '</td>'
        + '<td>' + shipmentStatusBadge(shipment.shipmentStatus) + '</td>'
        + '<td>' + esc(rateText || '\u2014') + '</td>'
        + '<td>' + esc(shipment.trackingNumber || '\u2014') + '</td>'
        + '<td>' + labelLink + '</td>'
        + '<td>' + (shipment.isVoided ? '<span class="badge gray">Voided</span>' : '<span class="muted">Active</span>') + '</td>'
        + '</tr>';
    }).join('') || '<tr><td colspan="6" class="muted">No shipments yet.</td></tr>';

    var verificationBanner = '';
    if (state.shipping.addressVerification && state.shipping.addressVerification.needsConfirmation) {
      verificationBanner = '<div class="shipping-banner">'
        + '<strong>EasyPost suggests a corrected destination address.</strong>'
        + '<div class="shipping-banner-columns">'
        + '<div class="shipping-card"><h4>Original</h4><div class="shipping-address">' + esc(formatShipmentAddress(state.shipping.addressVerification.originalAddress)).replace(/\n/g, '<br>') + '</div></div>'
        + '<div class="shipping-card"><h4>Suggested</h4><div class="shipping-address">' + esc(formatShipmentAddress(state.shipping.addressVerification.suggestedAddress)).replace(/\n/g, '<br>') + '</div></div>'
        + '</div>'
        + '<div class="shipping-actions"><button type="button" class="btn-sm" id="btnUseSuggestedAddress">Use suggested address</button><button type="button" class="btn-sm secondary" id="btnDismissSuggestedAddress">Dismiss</button></div>'
        + '</div>';
    }

    var shippingSummary = displayShipment
      ? '<div class="shipping-summary-grid">'
        + '<div class="shipping-summary-row"><span class="label">Status</span><span>' + shipmentStatusBadge(displayShipment.shipmentStatus) + '</span></div>'
        + '<div class="shipping-summary-row"><span class="label">Carrier</span><span>' + esc(displayShipment.carrier || '\u2014') + '</span></div>'
        + '<div class="shipping-summary-row"><span class="label">Service</span><span>' + esc(displayShipment.service || '\u2014') + '</span></div>'
        + '<div class="shipping-summary-row"><span class="label">Cost</span><span>' + money(displayShipment.labelCost || 0) + '</span></div>'
        + '<div class="shipping-summary-row"><span class="label">Tracking</span><span>' + esc(displayShipment.trackingNumber || '\u2014') + '</span></div>'
        + '<div class="shipping-summary-row"><span class="label">Label</span><span>' + (displayShipment.labelUrl ? '<a href="' + esc(displayShipment.labelUrl) + '" target="_blank" rel="noopener">open label</a>' : '<span class="muted">none</span>') + '</span></div>'
        + '<div class="shipping-summary-row"><span class="label">Tracking link</span><span>' + (displayShipment.trackingUrl ? '<a href="' + esc(displayShipment.trackingUrl) + '" target="_blank" rel="noopener">open tracking</a>' : '<span class="muted">none</span>') + '</span></div>'
        + '</div>'
      : '<div class="muted">No purchased shipment yet.</div>';

    var ratesHtml = rates.length
      ? rates.map(function (rate) {
        var selected = rate.rateId === state.shipping.selectedRateId;
        return '<label class="shipping-rate' + (selected ? ' selected' : '') + '">'
          + '<input type="radio" name="shippingRate" value="' + esc(rate.rateId) + '"' + (selected ? ' checked' : '') + '>'
          + '<div class="shipping-rate-main">'
          + '<strong>' + esc(rate.carrier || '') + ' ' + esc(rate.service || '') + '</strong>'
          + '<span class="muted">' + esc(rate.deliveryDays != null ? String(rate.deliveryDays) + ' business days' : (rate.deliveryDate ? 'ETA ' + fmtDate(rate.deliveryDate) : '')) + '</span>'
          + '</div>'
          + '<div><strong>' + money(rate.price || 0) + '</strong><div class="muted">' + esc(rate.currency || 'USD') + '</div></div>'
          + '</label>';
      }).join('')
      : '<div class="muted">No rates loaded yet.</div>';

    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;">'
      + '<h2 style="margin:0;">' + esc(order.order_number) + '</h2>'
      + '<button class="link-btn" id="detailClose">Close</button></div>'
      + '<p>Status: ' + statusBadge(order.status) + ' &nbsp; Payment: ' + statusBadge(d.payment_status) + ' &nbsp; Fulfillment: '
      + fulfillmentBadge(d.fulfillment_status) + '</p>'
      + '<div class="admin-grid">'
      + '<div><h3>Customer</h3><div>' + esc(d.customer && d.customer.name || '') + '</div>'
      + '<div class="muted">' + esc(d.customer && d.customer.email || '') + '</div>'
      + '<div class="muted">Orders: ' + esc(String(d.customer && d.customer.order_count || 0)) + ' · Total spend: ' + money(d.customer && d.customer.total_spend || 0) + '</div></div>'
      + '<div><h3>Shipping address</h3>'
      + '<div>' + esc(addr.name || '') + '</div>'
      + '<div>' + esc(addr.address || '') + '</div>'
      + '<div>' + esc([addr.city, addr.state, addr.zip].filter(Boolean).join(', ')) + '</div>'
      + '<div>' + esc(addr.country || '') + '</div></div>'
      + '</div>'
      + '<h3 style="margin-top:1rem;">Items</h3>'
      + '<table class="admin-table"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Line total</th></tr></thead>'
      + '<tbody>' + itemsRows + '</tbody></table>'
      + '<div class="admin-grid" style="margin-top:1rem;">'
      + '<div><h3>Payment summary</h3>'
      + '<div class="kv"><span>Method</span><strong>' + esc(order.payment_method || 'Not recorded') + '</strong></div>'
      + '<div class="kv"><span>Payment status</span><strong>' + statusBadge(d.payment_status) + '</strong></div>'
      + (d.paid_at ? '<div class="kv"><span>Paid at</span><strong>' + esc(fmtDate(d.paid_at)) + '</strong></div>' : '')
      + '<div class="kv"><span>Subtotal</span><strong>' + money(d.totals && d.totals.subtotal_before_discount != null ? d.totals.subtotal_before_discount : d.totals && d.totals.subtotal) + '</strong></div>'
      + '<div class="kv"><span>Discount</span><strong>-' + money(d.totals && d.totals.discount_amount) + '</strong></div>'
      + '<div class="kv"><span>Shipping</span><strong>' + (Number(d.totals && d.totals.shipping_cost) === 0 ? '<span class="badge green">FREE</span>' : money(d.totals && d.totals.shipping_cost)) + '</strong></div>'
      + '<div class="kv"><span>Total</span><strong>' + money(d.totals && d.totals.total) + '</strong></div>'
      + (order.payment_method === 'zelle' && d.payment_status !== 'paid'
          ? '<div class="zelle-admin-send"><span class="label">Zelle ID:</span> <strong>pxresearch</strong> &nbsp; <span class="label">Amount:</span> <strong>' + money(d.totals && d.totals.total) + '</strong> &nbsp; <span class="label">Memo:</span> <strong>' + esc(order.order_number) + '</strong></div>'
          : '')
      + '</div>'
      + '<div><h3>Tracking</h3>'
      + (order.shipping_service ? '<div class="kv"><span>Customer\'s chosen service</span><strong>' + esc(order.shipping_service) + '</strong></div>' : '')
      + '<div>Carrier: ' + esc((displayShipment && displayShipment.carrier) || order.carrier || '\u2014') + '</div>'
      + '<div>Tracking #: ' + esc((displayShipment && displayShipment.trackingNumber) || '\u2014') + '</div>'
      + '<div>Label: ' + ((displayShipment && displayShipment.labelUrl) ? '<a href="' + esc(displayShipment.labelUrl) + '" target="_blank" rel="noopener">view label</a>' : '<span class="muted">none</span>') + '</div>'
      + '<div class="chip-row"><span class="chip">' + esc(d.customer_status && d.customer_status.label || 'In progress') + '</span><span class="chip">' + esc(d.fulfillment_status || 'unfulfilled') + '</span><span class="chip">' + esc(d.payment_status || 'awaiting_payment') + '</span></div>'
      + '</div>'
      + '</div>'
      + '<div class="shipping-shell">'
      + '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">'
      + '<div><h3 class="shipping-section-title" style="margin:0;">Shipping</h3><div class="admin-subtle">Paid → Ready to ship → Get rates → Select service → Buy label → Print label → Carrier scan → In transit → Delivered</div></div>'
      + '<div class="shipping-state">' + shipmentStatusBadge(displayShipment && displayShipment.shipmentStatus || 'rated') + '</div>'
      + '</div>'
      + '<div class="shipping-top">'
      + '<div class="shipping-card"><h4>Saved destination address</h4><div class="shipping-address">' + esc(formatShippingAddress(addr)).replace(/\n/g, '<br>') + '</div></div>'
      + '<div class="shipping-card"><h4>Current shipment</h4>' + shippingSummary + '</div>'
      + '</div>'
      + verificationBanner
      + '<div class="shipping-card">'
      + '<h4>Package details</h4>'
      + '<div class="shipping-input-grid">'
      + '<input id="shipWeightPounds" type="number" min="0" step="1" placeholder="Pounds" value="' + esc(state.shipping.package.pounds) + '">'
      + '<input id="shipWeightOunces" type="number" min="0" step="0.01" placeholder="Ounces" value="' + esc(state.shipping.package.ounces) + '">'
      + '<input id="shipLength" type="number" min="0" step="0.01" placeholder="Length (in)" value="' + esc(state.shipping.package.length) + '">'
      + '<input id="shipWidth" type="number" min="0" step="0.01" placeholder="Width (in)" value="' + esc(state.shipping.package.width) + '">'
      + '<input id="shipHeight" type="number" min="0" step="0.01" placeholder="Height (in)" value="' + esc(state.shipping.package.height) + '">'
      + '</div>'
      + '<div class="shipping-actions" style="margin-top:10px;">'
      + '<button type="button" class="btn-sm" id="btnGetShippingRates"' + (state.shipping.loadingRates ? ' disabled' : '') + '>Get rates</button>'
      + '<button type="button" class="btn-sm secondary" id="btnPurchaseShippingLabel"' + ((!state.shipping.selectedRateId || state.shipping.loadingPurchase || (activeShipment && !activeShipment.isVoided)) ? ' disabled' : '') + '>Purchase label</button>'
      + '<button type="button" class="btn-sm secondary" id="btnVoidShippingLabel"' + ((!activeShipment || activeShipment.isVoided || state.shipping.loadingVoid) ? ' disabled' : '') + '>Void label</button>'
      + '</div>'
      + (state.shipping.error ? '<div class="shipping-error" style="margin-top:10px;">' + esc(state.shipping.error) + '</div>' : '')
      + (state.shipping.info ? '<div class="muted" style="margin-top:10px;">' + esc(state.shipping.info) + '</div>' : '')
      + '</div>'
      + '<div class="shipping-card">'
      + '<h4>Available rates</h4>'
      + '<div class="shipping-rates" id="shippingRates">' + ratesHtml + '</div>'
      + '<div class="shipping-actions" style="margin-top:10px;">'
      + '<button type="button" class="btn-sm secondary" id="btnRefreshRates"' + (state.shipping.loadingRates ? ' disabled' : '') + '>Refresh rates</button>'
      + '<div class="muted">Selected rate: ' + (selectedRate ? esc(selectedRate.carrier + ' ' + selectedRate.service + ' · ' + money(selectedRate.price || 0)) : 'none') + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="shipping-card">'
      + '<h4>Shipment history</h4>'
      + '<table class="admin-table"><thead><tr><th>Created</th><th>Status</th><th>Carrier / Service</th><th>Tracking</th><th>Label</th><th>Void</th></tr></thead><tbody>' + shipmentHistoryRows + '</tbody></table>'
      + '</div>'
      + '</div>'
      + '<h3 style="margin-top:1rem;">Timeline</h3>'
      + '<ul class="inline-list">' + timelineRows + '</ul>'
      + '<h3 style="margin-top:1rem;">Notes</h3>'
      + '<p class="muted">Internal notes support can be added in a later phase without exposing customer-facing data.</p>'
      + '<div class="admin-actions">'
      + '<button id="btnProcessing">Mark Processing</button>'
      + '<button id="btnShipped">Mark Shipped</button>'
      + (order.payment_method === 'zelle' && d.payment_status !== 'paid'
          ? '<button id="btnConfirmZelle" class="zelle-confirm-btn">Mark Zelle Payment Received</button>'
          : '')
      + '</div>';
    panel.classList.remove('hidden');

    $('detailClose').addEventListener('click', function () { panel.classList.add('hidden'); });
    $('btnProcessing').addEventListener('click', function () { setStatus('processing'); });
    $('btnShipped').addEventListener('click', function () { setStatus('shipped'); });
    if ($('btnConfirmZelle')) {
      $('btnConfirmZelle').addEventListener('click', function () { confirmZellePayment(order.order_number); });
    }
    $('btnGetShippingRates').addEventListener('click', function () { requestShippingRates(false); });
    $('btnRefreshRates').addEventListener('click', function () { requestShippingRates(false); });
    if ($('btnPurchaseShippingLabel')) {
      $('btnPurchaseShippingLabel').addEventListener('click', purchaseSelectedShippingLabel);
    }
    if ($('btnVoidShippingLabel')) {
      $('btnVoidShippingLabel').addEventListener('click', voidSelectedShippingLabel);
    }
    if ($('btnUseSuggestedAddress')) {
      $('btnUseSuggestedAddress').addEventListener('click', function () { requestShippingRates(true); });
    }
    if ($('btnDismissSuggestedAddress')) {
      $('btnDismissSuggestedAddress').addEventListener('click', function () {
        state.shipping.addressVerification = null;
        renderDetail(state.orderDetail);
      });
    }

    var ratePanel = $('shippingRates');
    if (ratePanel) {
      Array.prototype.forEach.call(ratePanel.querySelectorAll('input[type="radio"][name="shippingRate"]'), function (radio) {
        radio.addEventListener('change', function () {
          state.shipping.selectedRateId = radio.value;
          renderDetail(state.orderDetail);
        });
      });
    }

    ['shipWeightPounds', 'shipWeightOunces', 'shipLength', 'shipWidth', 'shipHeight'].forEach(function (fieldId) {
      var input = $(fieldId);
      if (!input) return;
      input.addEventListener('input', function () {
        state.shipping.package = shippingPackagePayload();
      });
    });

    setShippingPackageInputs();
  }

  function refreshCurrentOrder() {
    if (!state.currentId) return Promise.resolve();
    return api('/api/admin/orders/' + state.currentId).then(function (d) {
      renderDetail(d);
      return d;
    });
  }

  function requestShippingRates(confirmVerifiedAddress) {
    if (!state.currentId || state.shipping.loadingRates) return;
    state.shipping.loadingRates = true;
    state.shipping.error = '';
    state.shipping.info = '';
    renderDetail(state.orderDetail);

    var payload = shippingPackagePayload();
    state.shipping.package = {
      pounds: payload.pounds,
      ounces: payload.ounces,
      length: payload.length,
      width: payload.width,
      height: payload.height
    };
    payload.confirmVerifiedAddress = !!confirmVerifiedAddress;
    payload.confirm_verified_address = !!confirmVerifiedAddress;

    api('/api/admin/orders/' + state.currentId + '/shipping/rates', { method: 'POST', body: JSON.stringify(payload) })
      .then(function (result) {
        state.shipping.loadingRates = false;
        state.shipping.shipmentId = result && result.shipment && result.shipment.providerShipmentId ? result.shipment.providerShipmentId : null;
        state.shipping.rates = (result && result.rates) || [];
        state.shipping.selectedRateId = '';
        state.shipping.addressVerification = (result && result.rates && result.rates.length) ? null : (result && result.addressVerification ? result.addressVerification : null);
        state.shipping.info = state.shipping.addressVerification && state.shipping.addressVerification.needsConfirmation
          ? 'Address verification requires confirmation before rates can be used.'
          : 'Rates loaded successfully.';
        // Auto-select the rate matching the customer's chosen shipping service.
        var orderService = state.orderDetail && state.orderDetail.order && state.orderDetail.order.shipping_service;
        if (orderService) {
          var match = state.shipping.rates.find(function (r) {
            var s = String(r.service || '').toLowerCase().replace(/[\s_-]/g, '');
            var canonical = String(r.carrier || '').toUpperCase() === 'USPS'
              ? (s.includes('groundadvantage') ? 'USPS Ground Advantage'
                : (s.includes('prioritymailexpress') || (s.includes('express') && s.includes('priority')) || s === 'express') ? 'USPS Priority Mail Express'
                : s.includes('priority') ? 'USPS Priority Mail' : null)
              : null;
            return canonical === orderService;
          });
          if (match) state.shipping.selectedRateId = match.rateId;
        }
        renderDetail(state.orderDetail);
      })
      .catch(function (err) {
        state.shipping.loadingRates = false;
        if (err.status === 409 && err.code === 'address-verification-confirmation-required' && err.details) {
          state.shipping.addressVerification = Object.assign({}, err.details, { needsConfirmation: true });
          state.shipping.rates = [];
          state.shipping.selectedRateId = '';
          state.shipping.info = 'Address verification requires confirmation before rates can be retrieved.';
          renderDetail(state.orderDetail);
          return;
        }
        state.shipping.error = err.message || 'Failed to retrieve shipping rates';
        renderDetail(state.orderDetail);
      });
  }

  function purchaseSelectedShippingLabel() {
    if (!state.currentId || state.shipping.loadingPurchase) return;
    var selectedRate = state.shipping.rates.find(function (rate) { return rate.rateId === state.shipping.selectedRateId; });
    var currentOrder = state.orderDetail || {};
    var destination = currentOrder.shipping_address || {};
    if (!selectedRate || !state.shipping.shipmentId) {
      toast('Select a rate first');
      return;
    }

    var confirmText = [
      'Purchase label?',
      'Carrier: ' + (selectedRate.carrier || ''),
      'Service: ' + (selectedRate.service || ''),
      'Cost: ' + money(selectedRate.price || 0),
      'Destination: ' + [destination.city, destination.state].filter(Boolean).join(', '),
      'Package: ' + [state.shipping.package.pounds || 0, 'lb', state.shipping.package.ounces || 0, 'oz'] .join(' ')
    ].join('\n');

    if (!window.confirm(confirmText)) {
      return;
    }

    state.shipping.loadingPurchase = true;
    state.shipping.error = '';
    renderDetail(state.orderDetail);

    api('/api/admin/orders/' + state.currentId + '/shipping/purchase', {
      method: 'POST',
      body: JSON.stringify({ shipmentId: state.shipping.shipmentId, rateId: selectedRate.rateId })
    }).then(function () {
      toast('Shipping label purchased');
      state.shipping.loadingPurchase = false;
      state.shipping.rates = [];
      state.shipping.selectedRateId = null;
      state.shipping.shipmentId = null;
      state.shipping.info = 'Label purchased successfully.';
      return refreshCurrentOrder();
    }).catch(function (err) {
      state.shipping.loadingPurchase = false;
      state.shipping.error = err.message || 'Failed to purchase shipping label';
      renderDetail(state.orderDetail);
    });
  }

  function voidSelectedShippingLabel() {
    if (!state.currentId || state.shipping.loadingVoid) return;
    var currentOrder = state.orderDetail || {};
    var shipments = Array.isArray(currentOrder.shipments) ? currentOrder.shipments : [];
    var purchasedShipment = shipments.find(function (shipment) { return shipment.purchasedAt && !shipment.isVoided; }) || null;
    if (!purchasedShipment) {
      toast('No eligible label to void');
      return;
    }
    if (!window.confirm('Void this shipping label? Only unused labels can be refunded.')) {
      return;
    }

    state.shipping.loadingVoid = true;
    renderDetail(state.orderDetail);
    api('/api/admin/orders/' + state.currentId + '/shipping/void', {
      method: 'POST',
      body: JSON.stringify({ shipmentId: purchasedShipment.providerShipmentId })
    }).then(function () {
      toast('Shipping label voided');
      state.shipping.loadingVoid = false;
      state.shipping.info = 'Label voided.';
      return refreshCurrentOrder();
    }).catch(function (err) {
      state.shipping.loadingVoid = false;
      state.shipping.error = err.message || 'Failed to void shipping label';
      renderDetail(state.orderDetail);
    });
  }

  function setStatus(status) {
    api('/api/admin/orders/' + state.currentId + '/status', { method: 'PUT', body: JSON.stringify({ status: status }) })
      .then(function () { toast('Status \u2192 ' + status); return openOrder(state.currentId); })
      .then(loadOrders)
      .catch(function (err) { toast(err.message || 'Failed to update status'); });
  }

  function confirmZellePayment(orderNumber) {
    var orderId = state.currentId;
    if (!orderId) return;
    var confirmed = window.confirm(
      'Confirm Zelle Payment\n\n'
      + 'Confirm that you have personally verified the Zelle payment for Order ' + String(orderNumber || orderId) + ' in your Zelle/bank account.\n\n'
      + 'Press OK to mark this order as paid and move it to Processing.'
    );
    if (!confirmed) return;
    api('/api/admin/orders/' + orderId + '/confirm-zelle-payment', { method: 'POST', body: '{}' })
      .then(function () {
        toast('Zelle payment confirmed \u2014 order moved to Processing');
        return openOrder(orderId);
      })
      .then(loadOrders)
      .catch(function (err) { toast(err.message || 'Failed to confirm Zelle payment'); });
  }

  // ---- COA admin functions -----------------------------------------

  function coaStatusBadge(status) {
    var map = { draft: 'gray', published: 'green', archived: 'amber' };
    var cls = map[status] || 'gray';
    return '<span class="badge ' + cls + '">' + esc(String(status || 'draft')) + '</span>';
  }

  function loadCoas() {
    var params = new URLSearchParams();
    if (state.coaSearch) params.set('search', state.coaSearch);
    if (state.coaStatusFilter) params.set('status', state.coaStatusFilter);
    api('/api/admin/coas?' + params.toString())
      .then(function (data) {
        state.coas = (data && data.coas) || [];
        renderCoasTable();
      })
      .catch(function (err) {
        var body = $('coasBody');
        if (body) body.innerHTML = '<tr><td colspan="11" class="muted">Failed to load COAs</td></tr>';
      });
  }

  function renderCoasTable() {
    var body = $('coasBody');
    if (!body) return;
    if (!state.coas.length) {
      body.innerHTML = '<tr><td colspan="11" class="muted">No COAs found.</td></tr>';
      return;
    }
    body.innerHTML = state.coas.map(function (c) {
      var fileType = c.fileMimeType
        ? (c.fileMimeType.includes('pdf') ? 'PDF' : 'Image')
        : (c.hasFile ? 'File' : '\u2014');
      return '<tr>'
        + '<td>' + esc(c.productName || '') + '</td>'
        + '<td>' + esc(c.variantName || '\u2014') + '</td>'
        + '<td>' + esc(c.batchNumber || '\u2014') + '</td>'
        + '<td>' + esc(c.labName || '\u2014') + '</td>'
        + '<td>' + esc(c.testDate ? String(c.testDate).split('T')[0] : '\u2014') + '</td>'
        + '<td>' + esc(c.reportDate ? String(c.reportDate).split('T')[0] : '\u2014') + '</td>'
        + '<td>' + esc(fileType) + '</td>'
        + '<td>' + coaStatusBadge(c.status) + '</td>'
        + '<td>' + esc(c.publishedAt ? String(c.publishedAt).split('T')[0] : '\u2014') + '</td>'
        + '<td>' + esc(c.updatedAt ? String(c.updatedAt).split('T')[0] : '\u2014') + '</td>'
        + '<td style="white-space:nowrap">'
        + '<button class="link-btn" data-coa-edit="' + c.id + '">Edit</button>'
        + (c.status === 'draft'
            ? ' <button class="link-btn" data-coa-publish="' + c.id + '">Publish</button>'
            : '')
        + (c.status === 'published'
            ? ' <button class="link-btn" data-coa-unpublish="' + c.id + '">Unpublish</button>'
            : '')
        + (c.status !== 'archived'
            ? ' <button class="link-btn" style="color:#8a5b12" data-coa-archive="' + c.id + '">Archive</button>'
            : '')
        + (c.status !== 'published'
            ? ' <button class="link-btn" style="color:#a12626" data-coa-delete="' + c.id + '">Delete</button>'
            : '')
        + '</td>'
        + '</tr>';
    }).join('');

    Array.prototype.forEach.call(body.querySelectorAll('[data-coa-edit]'), function (btn) {
      btn.addEventListener('click', function () { openCoaModal(parseInt(btn.getAttribute('data-coa-edit'), 10)); });
    });
    Array.prototype.forEach.call(body.querySelectorAll('[data-coa-publish]'), function (btn) {
      btn.addEventListener('click', function () { coaPublish(parseInt(btn.getAttribute('data-coa-publish'), 10)); });
    });
    Array.prototype.forEach.call(body.querySelectorAll('[data-coa-unpublish]'), function (btn) {
      btn.addEventListener('click', function () { coaUnpublish(parseInt(btn.getAttribute('data-coa-unpublish'), 10)); });
    });
    Array.prototype.forEach.call(body.querySelectorAll('[data-coa-archive]'), function (btn) {
      btn.addEventListener('click', function () { coaArchive(parseInt(btn.getAttribute('data-coa-archive'), 10)); });
    });
    Array.prototype.forEach.call(body.querySelectorAll('[data-coa-delete]'), function (btn) {
      btn.addEventListener('click', function () { coaDelete(parseInt(btn.getAttribute('data-coa-delete'), 10)); });
    });
  }

  function openCoaModal(id) {
    state.editingCoaId = id || null;
    var wrap = $('coaModalWrap');
    var titleEl = $('coaModalTitle');
    var form = $('coaForm');
    if (!wrap || !form) return;

    // Show modal immediately so the user sees it open
    wrap.classList.remove('hidden');
    syncModalBodyLock();

    // Reset form fields
    form.reset();
    var idField = $('coaIdField');
    if (idField) idField.value = id || '';
    var fileNameEl = $('coaFileName');
    if (fileNameEl) fileNameEl.textContent = 'No file chosen';
    var filePreview = $('coaFilePreview');
    if (filePreview) filePreview.innerHTML = '';
    var currentFileWrap = $('coaCurrentFileWrap');
    if (currentFileWrap) currentFileWrap.style.display = 'none';

    if (titleEl) titleEl.textContent = id ? 'Edit COA' : 'Add COA';

    // Disable select with loading placeholder immediately — no race condition
    var sel = $('coaProductVariantSelect');
    var errEl = $('coaProductLoadError');
    if (sel) {
      sel.innerHTML = '<option value="">Loading products\u2026</option>';
      sel.disabled = true;
    }
    if (errEl) errEl.style.display = 'none';

    // Step 1: get product list — reuse state.products if the Products tab already loaded them,
    // otherwise call the same endpoint the Products tab uses: GET /api/admin/products
    var productsPromise = (state.products && state.products.length)
      ? Promise.resolve(state.products)
      : api('/api/admin/products').then(function (data) { return (data && data.products) || []; });

    productsPromise
      .then(function (allProducts) {
        // Only include active products in the dropdown
        var products = allProducts.filter(function (p) { return p.active !== false; });

        if (!products.length) {
          if (sel) {
            sel.innerHTML = '<option value="">No products available</option>';
            sel.disabled = true;
          }
          return Promise.resolve(null);
        }

        // Step 2: load variants for every product in parallel using the same endpoint
        // the Products tab uses: GET /api/admin/products/:id/variants
        return Promise.all(
          products.map(function (p) {
            return api('/api/admin/products/' + p.id + '/variants')
              .then(function (vData) {
                return {
                  id: p.id,
                  name: p.name,
                  variants: ((vData && vData.variants) || []).filter(function (v) { return v.active !== false; })
                };
              })
              .catch(function () {
                // If variants fail for one product, still show the product without variants
                return { id: p.id, name: p.name, variants: [] };
              });
          })
        );
      })
      .then(function (productsWithVariants) {
        if (!productsWithVariants) return;

        state.coaProducts = productsWithVariants;

        if (!sel) return;

        // Build flat option list: plain product option OR optgroup with variant options
        var options = ['<option value="">Select product\u2026</option>'];
        productsWithVariants.forEach(function (p) {
          if (!p.variants.length) {
            // No variants — product alone is the selectable item
            options.push('<option value="' + p.id + '">' + esc(p.name) + '</option>');
          } else {
            // Variants present — group them under the product name
            options.push('<optgroup label="' + esc(p.name) + '">');
            p.variants.forEach(function (v) {
              options.push(
                '<option value="' + p.id + ':' + v.id + '">'
                + esc(p.name) + ' \u2014 ' + esc(v.name)
                + '</option>'
              );
            });
            options.push('</optgroup>');
          }
        });
        sel.innerHTML = options.join('');
        sel.disabled = false;

        // Step 3 (edit mode): load the existing COA and preselect its product/variant
        if (!id) return null;

        return api('/api/admin/coas/' + id).then(function (coaData) {
          var coa = coaData && coaData.coa;
          if (!coa) return;

          var pField = $('coaProductIdField');
          if (pField) pField.value = coa.productId || '';
          var vField = $('coaVariantIdField');
          if (vField) vField.value = coa.variantId || '';

          // Reconstruct the combined select value and preselect it
          if (sel) {
            var target = coa.variantId
              ? (coa.productId + ':' + coa.variantId)
              : String(coa.productId || '');
            sel.value = target;
          }

          if (form.elements.batch_number) form.elements.batch_number.value = coa.batchNumber || '';
          if (form.elements.lab_name) form.elements.lab_name.value = coa.labName || '';
          if (form.elements.test_type) form.elements.test_type.value = coa.testType || '';
          if (form.elements.test_date) form.elements.test_date.value = coa.testDate ? String(coa.testDate).split('T')[0] : '';
          if (form.elements.report_date) form.elements.report_date.value = coa.reportDate ? String(coa.reportDate).split('T')[0] : '';
          if (form.elements.title) form.elements.title.value = coa.title || '';
          if (form.elements.notes) form.elements.notes.value = coa.notes || '';
          if (coa.hasFile && coa.fileName) {
            if (currentFileWrap) currentFileWrap.style.display = '';
            var nameEl = $('coaCurrentFileName');
            if (nameEl) nameEl.textContent = coa.fileName;
            var linkEl = $('coaCurrentFileLink');
            if (linkEl) linkEl.href = '/api/admin/coas/' + id + '/file';
          }
        });
      })
      .catch(function (err) {
        if (sel) {
          sel.innerHTML = '<option value="">Failed to load products</option>';
          sel.disabled = true;
        }
        if (errEl) {
          errEl.textContent = (err && err.message) || 'Could not load the product list. Please close and try again.';
          errEl.style.display = 'block';
        }
      });
  }

  function closeCoaModal() {
    var wrap = $('coaModalWrap');
    if (wrap) wrap.classList.add('hidden');
    state.editingCoaId = null;
    syncModalBodyLock();
  }

  function saveCoaForm(evt) {
    evt.preventDefault();
    var form = $('coaForm');
    if (!form) return;

    // Parse combined "productId" or "productId:variantId" from the single select
    var pvSel = $('coaProductVariantSelect');
    var pvVal = (pvSel && pvSel.value) ? pvSel.value.trim() : '';
    var parts = pvVal.split(':');
    var productId = parseInt(parts[0], 10) || 0;
    var variantId = parseInt(parts[1], 10) || null;

    if (!productId) { toast('Please select a product'); return; }

    // Keep hidden fields in sync so native form validation is happy
    var pField = $('coaProductIdField');
    if (pField) pField.value = productId;
    var vField = $('coaVariantIdField');
    if (vField) vField.value = variantId || '';

    var payload = {
      product_id: productId,
      variant_id: variantId,
      batch_number: (form.elements.batch_number && form.elements.batch_number.value.trim()) || null,
      lab_name: (form.elements.lab_name && form.elements.lab_name.value.trim()) || null,
      test_type: (form.elements.test_type && form.elements.test_type.value.trim()) || null,
      test_date: (form.elements.test_date && form.elements.test_date.value) || null,
      report_date: (form.elements.report_date && form.elements.report_date.value) || null,
      title: (form.elements.title && form.elements.title.value.trim()) || null,
      notes: (form.elements.notes && form.elements.notes.value.trim()) || null
    };

    var isEdit = !!state.editingCoaId;
    var metaPromise = isEdit
      ? api('/api/admin/coas/' + state.editingCoaId, { method: 'PUT', body: JSON.stringify(payload) })
      : api('/api/admin/coas', { method: 'POST', body: JSON.stringify(payload) });

    var saveBtn = $('coaModalSave');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving\u2026'; }

    metaPromise
      .then(function (data) {
        var coaId = isEdit ? state.editingCoaId : data.id;

        // Upload file if one was selected
        var fileInput = $('coaFileInput');
        if (fileInput && fileInput.files && fileInput.files[0]) {
          var fd = new FormData();
          fd.append('file', fileInput.files[0]);
          return api('/api/admin/coas/' + coaId + '/file', { method: 'POST', body: fd });
        }
        return null;
      })
      .then(function () {
        toast(isEdit ? 'COA updated' : 'COA draft created');
        closeCoaModal();
        loadCoas();
      })
      .catch(function (err) { toast(err.message || 'Failed to save COA'); })
      .finally(function () {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Draft'; }
      });
  }

  function coaPublish(id) {
    if (!confirm('Publish this COA? It will become visible to the public.')) return;
    api('/api/admin/coas/' + id + '/publish', { method: 'POST' })
      .then(function () { toast('COA published'); loadCoas(); })
      .catch(function (err) { toast(err.message || 'Failed to publish COA'); });
  }

  function coaUnpublish(id) {
    if (!confirm('Unpublish this COA? It will be hidden from the public.')) return;
    api('/api/admin/coas/' + id + '/unpublish', { method: 'POST' })
      .then(function () { toast('COA unpublished'); loadCoas(); })
      .catch(function (err) { toast(err.message || 'Failed to unpublish COA'); });
  }

  function coaArchive(id) {
    if (!confirm('Archive this COA? It will no longer be visible publicly.')) return;
    api('/api/admin/coas/' + id + '/archive', { method: 'POST' })
      .then(function () { toast('COA archived'); loadCoas(); })
      .catch(function (err) { toast(err.message || 'Failed to archive COA'); });
  }

  function coaDelete(id) {
    if (!confirm('Permanently delete this COA record? This cannot be undone.')) return;
    api('/api/admin/coas/' + id, { method: 'DELETE' })
      .then(function () { toast('COA deleted'); loadCoas(); })
      .catch(function (err) { toast(err.message || 'Failed to delete COA'); });
  }

  // -----------------------------------------------------------------

  function wire() {
    var search = $('adminSearch');
    var timer = null;
    if (search) {
      search.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { state.search = search.value.trim(); loadOrders(); }, 300);
      });
    }
    var adminFilters = $('adminFilters');
    if (adminFilters) {
      Array.prototype.forEach.call(adminFilters.querySelectorAll('button'), function (btn) {
        btn.addEventListener('click', function () {
          Array.prototype.forEach.call(adminFilters.querySelectorAll('button'), function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          state.filter = btn.getAttribute('data-filter') || '';
          loadOrders();
        });
      });
    }
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
      var slugInput = productForm.elements && productForm.elements.slug;
      var nameInput = productForm.elements && productForm.elements.name;
      if (nameInput) {
        nameInput.addEventListener('input', function () {
          if (slugInput && !slugInput.value.trim()) {
            slugInput.value = slugify(nameInput.value);
          }
        });
      }
      if (slugInput) {
        slugInput.addEventListener('blur', function () {
          slugInput.value = slugify(slugInput.value);
        });
      }
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

    // COA tab wiring
    var coaAdminSearch = $('coaAdminSearch');
    if (coaAdminSearch) {
      var coaSearchTimer = null;
      coaAdminSearch.addEventListener('input', function () {
        clearTimeout(coaSearchTimer);
        coaSearchTimer = setTimeout(function () {
          state.coaSearch = coaAdminSearch.value.trim();
          loadCoas();
        }, 300);
      });
    }

    var coaStatusFilters = $('coaStatusFilters');
    if (coaStatusFilters) {
      Array.prototype.forEach.call(coaStatusFilters.querySelectorAll('button[data-filter]'), function (btn) {
        btn.addEventListener('click', function () {
          Array.prototype.forEach.call(coaStatusFilters.querySelectorAll('button[data-filter]'), function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          state.coaStatusFilter = btn.getAttribute('data-filter') || '';
          loadCoas();
        });
      });
    }

    var addCoaBtn = $('btnAddCoa');
    if (addCoaBtn) addCoaBtn.addEventListener('click', function () { openCoaModal(null); });

    var coaClose = $('coaModalClose');
    if (coaClose) coaClose.addEventListener('click', closeCoaModal);
    var coaCancel = $('coaModalCancel');
    if (coaCancel) coaCancel.addEventListener('click', closeCoaModal);

    var coaForm = $('coaForm');
    if (coaForm) coaForm.addEventListener('submit', saveCoaForm);

    var coaFileInput = $('coaFileInput');
    if (coaFileInput) {
      coaFileInput.addEventListener('change', function () {
        var nameEl = $('coaFileName');
        var previewEl = $('coaFilePreview');
        var file = coaFileInput.files && coaFileInput.files[0];
        if (nameEl) nameEl.textContent = file ? file.name : 'No file chosen';
        if (previewEl) {
          if (file && file.type.startsWith('image/')) {
            var url = URL.createObjectURL(file);
            previewEl.innerHTML = '<img src="' + url + '" alt="Preview" style="max-height:120px;max-width:100%;object-fit:contain;border-radius:6px;border:1px solid #e2eaf7;">';
          } else {
            previewEl.innerHTML = '';
          }
        }
      });
    }

    var coaModalWrap = $('coaModalWrap');
    if (coaModalWrap) {
      coaModalWrap.addEventListener('click', function (evt) {
        if (evt.target === coaModalWrap) closeCoaModal();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    try {
      wire();
      if ($('adminApp')) {
        $('adminApp').classList.remove('hidden');
      }
      if ($('adminDenied')) {
        $('adminDenied').classList.add('hidden');
      }
      switchTab('home');
    } catch (err) {
      var fallback = $('adminDenied');
      if (fallback) {
        fallback.classList.remove('hidden');
        var copy = fallback.querySelector('p');
        if (copy) {
          copy.textContent = 'The admin console could not initialize. Please refresh the page or sign in again.';
        }
      }
      if (console && console.error) {
        console.error('Admin init failed', err);
      }
    }
  });
  // ---- Customer review moderation ----------------------------------------
  var reviewState = { filter: 'pending', bound: false };

  function escapeReviewHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function reviewStars(rating) {
    var r = Math.max(1, Math.min(5, parseInt(rating, 10) || 0));
    return '\u2605'.repeat(r) + '\u2606'.repeat(5 - r);
  }

  function formatReviewDate(value) {
    if (!value) return '';
    var d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleString();
  }

  function renderReviewsTable(rows) {
    var body = $('reviewsBody');
    if (!body) return;
    if (!rows || !rows.length) {
      var msg = reviewState.filter === 'approved'
        ? 'No approved reviews yet.'
        : 'No pending reviews.';
      body.innerHTML = '<tr><td colspan="7" class="muted">' + msg + '</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (r) {
      var approved = !!r.approved;
      var statusLabel = approved ? 'Approved' : 'Pending';
      var actions = '';
      if (!approved) {
        actions += '<button type="button" class="btn-sm" data-review-approve="' + r.id + '">Approve</button> ';
      }
      actions += '<button type="button" class="link-btn" data-review-delete="' + r.id + '">' + (approved ? 'Remove' : 'Reject') + '</button>';
      return '<tr>' +
        '<td>' + escapeReviewHtml(formatReviewDate(r.created_at)) + '</td>' +
        '<td>' + escapeReviewHtml(r.name) + '</td>' +
        '<td>' + escapeReviewHtml(r.email) + '</td>' +
        '<td>' + reviewStars(r.rating) + '</td>' +
        '<td>' + escapeReviewHtml(r.review_text) + '</td>' +
        '<td>' + statusLabel + '</td>' +
        '<td>' + actions + '</td>' +
        '</tr>';
    }).join('');
  }

  function loadReviews() {
    bindReviewControls();
    var body = $('reviewsBody');
    if (body) body.innerHTML = '<tr><td colspan="7" class="muted">Loading\u2026</td></tr>';
    return api('/api/admin/reviews?status=' + encodeURIComponent(reviewState.filter))
      .then(function (data) { renderReviewsTable((data && data.reviews) || []); })
      .catch(function (err) {
        if (body) body.innerHTML = '<tr><td colspan="7" class="muted">' + escapeReviewHtml(err.message || 'Failed to load reviews.') + '</td></tr>';
      });
  }

  function approveReview(id) {
    return api('/api/admin/reviews/' + id + '/approve', { method: 'PATCH' })
      .then(function () { toast('Review approved'); return loadReviews(); })
      .catch(function (err) { toast(err.message || 'Could not approve review'); });
  }

  function deleteReview(id) {
    if (!window.confirm('Delete this review permanently? This cannot be undone.')) return;
    return api('/api/admin/reviews/' + id, { method: 'DELETE' })
      .then(function () { toast('Review deleted'); return loadReviews(); })
      .catch(function (err) { toast(err.message || 'Could not delete review'); });
  }

  function bindReviewControls() {
    if (reviewState.bound) return;
    reviewState.bound = true;
    var filters = $('reviewStatusFilters');
    if (filters) {
      Array.prototype.forEach.call(filters.querySelectorAll('button'), function (btn) {
        btn.addEventListener('click', function () {
          Array.prototype.forEach.call(filters.querySelectorAll('button'), function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          reviewState.filter = btn.getAttribute('data-review-filter') || 'pending';
          loadReviews();
        });
      });
    }
    var body = $('reviewsBody');
    if (body) {
      body.addEventListener('click', function (e) {
        var approveBtn = e.target.closest('[data-review-approve]');
        if (approveBtn) { approveReview(parseInt(approveBtn.getAttribute('data-review-approve'), 10)); return; }
        var deleteBtn = e.target.closest('[data-review-delete]');
        if (deleteBtn) { deleteReview(parseInt(deleteBtn.getAttribute('data-review-delete'), 10)); return; }
      });
    }
  }


  // ===== Customers ========================================================
  var customerState = { page: 1, pageCount: 1, search: '', filter: 'all', sort: 'newest' };

  function loadCustomers() {
    var body = $('customersBody');
    if (!body) return;
    var qs = 'search=' + encodeURIComponent(customerState.search)
      + '&filter=' + encodeURIComponent(customerState.filter)
      + '&sort=' + encodeURIComponent(customerState.sort)
      + '&page=' + customerState.page + '&pageSize=25';
    body.innerHTML = '<tr><td colspan="7" class="muted">Loading&hellip;</td></tr>';
    api('/api/admin/customers?' + qs).then(function (data) {
      customerState.pageCount = data.pageCount || 1;
      var info = $('customersPageInfo');
      if (info) info.textContent = 'Page ' + data.page + ' of ' + (data.pageCount || 1) + ' \u2022 ' + data.total + ' customers';
      if (!data.customers.length) {
        body.innerHTML = '<tr><td colspan="7" class="muted">No customers found.</td></tr>';
        return;
      }
      body.innerHTML = data.customers.map(function (c) {
        var badge = c.status === 'disabled'
          ? '<span class="muted" style="color:#b42318;">Disabled</span>'
          : '<span style="color:#067647;">Active</span>';
        return '<tr data-customer="' + esc(c.id) + '" style="cursor:pointer;">'
          + '<td>' + esc(c.name || '\u2014') + '</td>'
          + '<td>' + esc(c.email || '') + '</td>'
          + '<td>' + esc(fmtDate(c.createdAt)) + '</td>'
          + '<td>' + esc(String(c.orderCount || 0)) + '</td>'
          + '<td>' + money(c.lifetimeSpend) + '</td>'
          + '<td>' + (c.lastOrder ? esc(fmtDate(c.lastOrder)) : '<span class="muted">\u2014</span>') + '</td>'
          + '<td>' + badge + '</td>'
          + '</tr>';
      }).join('');
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="7" class="muted">' + esc(err.message || 'Failed to load customers') + '</td></tr>';
    });
  }

  function openCustomer(id) {
    var wrap = $('customerDetailWrap');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    var body = $('customerDetailBody');
    body.innerHTML = '<div class="muted">Loading&hellip;</div>';
    api('/api/admin/customers/' + encodeURIComponent(id)).then(function (d) {
      var c = d.customer, st = d.stats;
      var authLabels = { google: 'Google', email_password: 'Email / Password', linked: 'Linked (Google + Password)', unknown: 'Unknown' };
      var head = '<div class="admin-bar admin-bar-between"><div>'
        + '<h3 style="margin:0;">' + esc(c.name || '\u2014') + '</h3>'
        + '<div class="muted">' + esc(c.email || '') + '</div></div>'
        + '<div>' + (c.status === 'disabled' ? '<span style="color:#b42318;font-weight:700;">Disabled</span>' : '<span style="color:#067647;font-weight:700;">Active</span>') + '</div></div>';
      var cards = '<div class="admin-metrics" style="display:flex;gap:.75rem;flex-wrap:wrap;margin:.75rem 0;">'
        + metricCard('Orders', String(st.orderCount))
        + metricCard('Lifetime spend', money(st.lifetimeSpend))
        + metricCard('Avg order', money(st.avgOrderValue))
        + metricCard('Last order', st.lastOrder ? fmtDate(st.lastOrder) : '\u2014')
        + '</div>';
      var info = '<div class="muted" style="margin-bottom:.75rem;">'
        + 'Account created ' + esc(fmtDate(c.createdAt))
        + ' \u2022 Auth: ' + esc(authLabels[c.authMethod] || c.authMethod)
        + '</div>';
      var orders = '<h4>Order history</h4>' + (d.orders.length
        ? '<div class="table-wrap"><table class="admin-table"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Payment</th><th>Total</th><th>Tracking</th></tr></thead><tbody>'
          + d.orders.map(function (o) {
            return '<tr><td><a href="#" data-order="' + o.id + '">' + esc(o.orderNumber || ('#' + o.id)) + '</a></td>'
              + '<td>' + esc(fmtDate(o.date)) + '</td>'
              + '<td>' + statusBadge(o.status) + '</td>'
              + '<td>' + statusBadge(o.paymentStatus || '') + '</td>'
              + '<td>' + money(o.total) + '</td>'
              + '<td>' + (o.trackingNumber ? esc(o.trackingNumber) : '<span class="muted">\u2014</span>') + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="muted">No orders yet.</div>');
      var addrs = '<h4>Shipping addresses</h4>' + (d.addresses.length
        ? d.addresses.map(function (a) {
            return '<div style="border:1px solid #e7ebf1;border-radius:8px;padding:.6rem;margin-bottom:.4rem;">'
              + '<strong>' + esc(a.name || '') + '</strong><br>'
              + esc(a.line1 || '') + (a.line2 ? ', ' + esc(a.line2) : '') + '<br>'
              + esc(a.city || '') + ', ' + esc(a.state || '') + ' ' + esc(a.zip || '') + ' ' + esc(a.country || '')
              + (a.phone ? '<br>' + esc(a.phone) : '')
              + '<div class="muted" style="font-size:.8rem;margin-top:.3rem;">Used ' + a.timesUsed + '\u00d7 \u2022 last ' + esc(fmtDate(a.lastUsed)) + '</div>'
              + '</div>';
          }).join('')
        : '<div class="muted">No shipping addresses on record.</div>');
      body.innerHTML = head + cards + info + orders + addrs + renderNotes(c.id, d.notes) + renderActions(c);
    }).catch(function (err) {
      body.innerHTML = '<div class="muted">' + esc(err.message || 'Failed to load customer') + '</div>';
    });
  }

  function metricCard(label, value) {
    return '<div class="admin-panel" style="flex:1;min-width:120px;"><div class="muted">' + esc(label) + '</div><div><strong>' + esc(value) + '</strong></div></div>';
  }

  function renderNotes(customerId, notes) {
    var list = (notes && notes.length)
      ? notes.map(function (n) {
          return '<div style="border:1px solid #e7ebf1;border-radius:8px;padding:.6rem;margin-bottom:.4rem;" data-note="' + n.id + '">'
            + '<div>' + esc(n.note) + '</div>'
            + '<div class="muted" style="font-size:.8rem;margin-top:.3rem;">' + esc(n.adminName || 'Admin') + ' \u2022 ' + esc(fmtDate(n.createdAt)) + ' '
            + '<button type="button" class="link-btn" data-note-del="' + n.id + '">Delete</button></div>'
            + '</div>';
        }).join('')
      : '<div class="muted">No internal notes.</div>';
    return '<h4>Internal notes <span class="muted" style="font-weight:400;font-size:.8rem;">(admin only)</span></h4>'
      + list
      + '<div class="admin-bar" style="gap:.4rem;margin-top:.4rem;" data-customer="' + esc(customerId) + '">'
      + '<input type="text" id="newNoteInput" placeholder="Add a note" style="flex:1;padding:.5rem;border:1px solid #cbd2dc;border-radius:8px;">'
      + '<button type="button" class="admin-btn" id="addNoteBtn">Add note</button></div>';
  }

  function renderActions(c) {
    var disableLabel = c.status === 'disabled' ? 'Re-enable account' : 'Disable account';
    var resetBtn = c.canResetPassword
      ? '<button type="button" class="admin-btn" id="resetPwBtn" data-customer="' + esc(c.id) + '">Send password reset email</button>'
      : '<button type="button" class="admin-btn" disabled title="Google-only account">No password to reset</button>';
    return '<h4>Account actions</h4><div class="admin-bar" style="gap:.5rem;flex-wrap:wrap;">'
      + '<button type="button" class="admin-btn" id="toggleDisableBtn" data-customer="' + esc(c.id) + '" data-disabled="' + (c.status === 'disabled' ? '1' : '0') + '">' + disableLabel + '</button>'
      + resetBtn + '</div>';
  }

  // Wire up interactions once DOM is ready.
  function wireCustomers() {
    var navBtn = document.querySelector('#adminTabs button[data-tab="customers"]');
    if (navBtn) navBtn.addEventListener('click', function () { switchTab('customers'); });
    var search = $('customerSearch');
    if (search) search.addEventListener('input', debounceCust(function () { customerState.search = search.value; customerState.page = 1; loadCustomers(); }, 300));
    var filter = $('customerFilter');
    if (filter) filter.addEventListener('change', function () { customerState.filter = filter.value; customerState.page = 1; loadCustomers(); });
    var sort = $('customerSort');
    if (sort) sort.addEventListener('change', function () { customerState.sort = sort.value; customerState.page = 1; loadCustomers(); });
    var prev = $('customersPrev');
    if (prev) prev.addEventListener('click', function () { if (customerState.page > 1) { customerState.page--; loadCustomers(); } });
    var next = $('customersNext');
    if (next) next.addEventListener('click', function () { if (customerState.page < customerState.pageCount) { customerState.page++; loadCustomers(); } });
    var cbody = $('customersBody');
    if (cbody) cbody.addEventListener('click', function (e) {
      var row = e.target.closest('[data-customer]');
      if (row) openCustomer(row.getAttribute('data-customer'));
    });
    var detail = $('customerDetailBody');
    if (detail) detail.addEventListener('click', function (e) {
      var addBtn = e.target.closest('#addNoteBtn');
      if (addBtn) { addNote(addBtn.parentNode.getAttribute('data-customer')); return; }
      var delBtn = e.target.closest('[data-note-del]');
      if (delBtn) { deleteNote(currentCustomerId, delBtn.getAttribute('data-note-del')); return; }
      var dis = e.target.closest('#toggleDisableBtn');
      if (dis) { toggleDisable(dis.getAttribute('data-customer'), dis.getAttribute('data-disabled') === '1'); return; }
      var rst = e.target.closest('#resetPwBtn');
      if (rst) { sendReset(rst.getAttribute('data-customer')); return; }
      var ord = e.target.closest('[data-order]');
      if (ord) { e.preventDefault(); openOrder(parseInt(ord.getAttribute('data-order'), 10)); }
    });
    var closeBtn = $('customerDetailClose');
    if (closeBtn) closeBtn.addEventListener('click', function () { $('customerDetailWrap').classList.add('hidden'); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireCustomers);
  } else {
    wireCustomers();
  }

  var currentCustomerId = null;
  function debounceCust(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  function addNote(id) {
    currentCustomerId = id;
    var input = $('newNoteInput');
    var note = input ? input.value.trim() : '';
    if (!note) return;
    api('/api/admin/customers/' + encodeURIComponent(id) + '/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note }) })
      .then(function () { toast('Note added'); openCustomer(id); }).catch(function (err) { toast(err.message || 'Failed'); });
  }
  function deleteNote(id, noteId) {
    if (!confirm('Delete this note?')) return;
    api('/api/admin/customers/' + encodeURIComponent(id) + '/notes/' + noteId, { method: 'DELETE' })
      .then(function () { toast('Note deleted'); openCustomer(id); }).catch(function (err) { toast(err.message || 'Failed'); });
  }
  function toggleDisable(id, currentlyDisabled) {
    var msg = currentlyDisabled ? 'Re-enable this account?' : 'Disable this account? The customer will not be able to log in.';
    if (!confirm(msg)) return;
    api('/api/admin/customers/' + encodeURIComponent(id) + '/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disabled: !currentlyDisabled }) })
      .then(function () { toast('Account updated'); openCustomer(id); loadCustomers(); }).catch(function (err) { toast(err.message || 'Failed'); });
  }
  function sendReset(id) {
    if (!confirm('Send a password reset email to this customer?')) return;
    api('/api/admin/customers/' + encodeURIComponent(id) + '/password-reset', { method: 'POST' })
      .then(function () { toast('Password reset email triggered'); }).catch(function (err) { toast(err.message || 'Failed'); });
  }


})();
