/* Admin Console -> Site-wide Sale tab.
   ----------------------------------------------------------------------------
   Create, schedule, switch on/off and delete site-wide sales: a percentage off
   every product, applied automatically at checkout, plus the announcement bar
   that advertises it. admin.js calls PepxAdminSale.load() when the tab opens.
   ------------------------------------------------------------------------- */
(function () {
  'use strict';

  var sales = [];
  var bound = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
  }
  function fmtDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return String(d); }
  }
  function fmtPercent(v) { return String(Number(Number(v || 0).toFixed(2))) + '%'; }
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function api(path, options) {
    options = options || {};
    options.credentials = 'include';
    options.headers = options.headers || {};
    if (options.body) options.headers['Content-Type'] = 'application/json';
    return fetch(path, options).then(function (res) {
      return res.text().then(function (raw) {
        var data = {};
        if (raw) { try { data = JSON.parse(raw); } catch (e) { data = { error: raw }; } }
        if (!res.ok) {
          var err = new Error(data.error || ('Request failed (' + res.status + ')'));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  // <input type="datetime-local"> works in the admin's own time zone. Convert
  // both ways here so the server only ever sees an exact moment.
  function dateInputFromIso(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function isoFromDateInput(value) {
    if (!value) return null;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function statusBadge(sale) {
    var s = String(sale.status || '');
    if (s === 'active') {
      return sale.applied_now
        ? '<span class="badge green">Live now</span>'
        : '<span class="badge amber">On, but a bigger sale is applied</span>';
    }
    if (s === 'disabled') return '<span class="badge gray">Turned off</span>';
    if (s === 'scheduled') return '<span class="badge blue">Scheduled</span>';
    if (s === 'expired') return '<span class="badge red">Ended</span>';
    if (s === 'usage_limit_reached') return '<span class="badge amber">Maximum uses reached</span>';
    return '<span class="badge gray">' + esc(s || 'Unknown') + '</span>';
  }

  // Mirrors defaultBannerText() in services/sitewide-sale.js for the live preview.
  function defaultBannerText(name, percent, expiresIso) {
    var text = (String(name || '').trim() || 'Sale') + ': ' + fmtPercent(percent) +
      ' off everything, applied automatically at checkout.';
    if (expiresIso) {
      var end = new Date(expiresIso);
      if (!isNaN(end.getTime())) {
        text += ' Ends ' + end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Chicago' }) + '.';
      }
    }
    return text;
  }

  function renderLivePanel() {
    var summary = $('saleLiveSummary');
    var bannerWrap = $('saleLiveBannerWrap');
    var banner = $('saleLiveBanner');
    if (!summary) return;
    var live = sales.filter(function (s) { return s.applied_now; })[0];
    if (!live) {
      var next = sales.filter(function (s) { return s.status === 'scheduled'; })
        .sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); })[0];
      summary.innerHTML = '<strong>No sale is running.</strong> <span class="muted">Customers pay regular prices and can use discount codes.'
        + (next ? ' Next up: ' + esc(next.name) + ' (' + esc(fmtPercent(next.discount_percent)) + ' off) starts ' + esc(fmtDate(next.starts_at)) + '.' : '')
        + '</span>';
      if (bannerWrap) bannerWrap.classList.add('hidden');
      return;
    }
    var bits = [];
    bits.push(live.expires_at ? 'ends ' + fmtDate(live.expires_at) : 'no end date');
    bits.push(live.usage_limit == null
      ? String(live.total_used || 0) + ' orders so far'
      : String(live.total_used || 0) + ' of ' + live.usage_limit + ' uses');
    summary.innerHTML = '<span class="badge green">Live now</span> <strong>' + esc(live.name) + ' &mdash; '
      + esc(fmtPercent(live.discount_percent)) + ' off every product</strong> <span class="muted">(' + esc(bits.join(' • ')) + ')</span>';
    if (bannerWrap && banner) {
      bannerWrap.classList.remove('hidden');
      banner.classList.toggle('is-off', live.show_banner === false);
      banner.textContent = live.show_banner === false
        ? 'Announcement bar is hidden for this sale. Prices are still discounted.'
        : live.banner_preview;
    }
  }

  function renderTable() {
    var body = $('salesBody');
    if (!body) return;
    if (!sales.length) {
      body.innerHTML = '<tr><td colspan="11" class="muted">No site-wide sales yet. Click &ldquo;New Site-wide Sale&rdquo; to create one.</td></tr>';
      return;
    }
    body.innerHTML = sales.map(function (sale) {
      return '<tr>'
        + '<td><strong>' + esc(sale.name) + '</strong>'
        + (sale.show_banner === false ? '<br><span class="muted">No announcement bar</span>' : '') + '</td>'
        + '<td>' + esc(fmtPercent(sale.discount_percent)) + ' off</td>'
        + '<td>' + statusBadge(sale) + '</td>'
        + '<td>' + esc(String(sale.total_used || 0)) + '</td>'
        + '<td>' + (sale.usage_limit == null ? 'Unlimited' : esc(String(sale.usage_limit))) + '</td>'
        + '<td>' + (sale.remaining_uses == null ? 'Unlimited' : esc(String(sale.remaining_uses))) + '</td>'
        + '<td>' + money(sale.total_discount_given) + '</td>'
        + '<td>' + money(sale.total_revenue_generated) + '</td>'
        + '<td>' + (esc(fmtDate(sale.starts_at)) || '<span class="muted">&mdash;</span>') + '</td>'
        + '<td>' + (esc(fmtDate(sale.expires_at)) || '<span class="muted">&mdash;</span>') + '</td>'
        + '<td>'
        + '<button type="button" class="btn-sm secondary" data-sale-action="edit" data-sale-id="' + sale.id + '">Edit</button> '
        + '<button type="button" class="btn-sm secondary" data-sale-action="toggle" data-sale-id="' + sale.id + '">' + (sale.active ? 'Turn off' : 'Turn on') + '</button> '
        + '<button type="button" class="btn-sm danger" data-sale-action="delete" data-sale-id="' + sale.id + '">Delete</button>'
        + '</td></tr>';
    }).join('');
  }

  function load() {
    bind();
    return api('/api/admin/sales').then(function (data) {
      sales = data.sales || [];
      renderLivePanel();
      renderTable();
    }).catch(function (err) {
      var body = $('salesBody');
      if (body) body.innerHTML = '<tr><td colspan="11" class="muted">' + esc(err.message || 'Failed to load site-wide sales.') + '</td></tr>';
      var summary = $('saleLiveSummary');
      if (summary) summary.innerHTML = '<span class="muted">Could not load the current sale.</span>';
    });
  }

  function setBodyLock() {
    var anyOpen = !!document.querySelector('.modal-backdrop:not(.hidden)');
    document.body.classList.toggle('modal-open', anyOpen);
  }

  function updatePreview() {
    var form = $('saleForm');
    var preview = $('saleBannerPreview');
    var hint = $('saleBannerHint');
    if (!form || !preview) return;
    var auto = defaultBannerText(form.elements.name.value, form.elements.discount_percent.value,
      isoFromDateInput(form.elements.expires_at.value));
    var custom = String(form.elements.banner_text.value || '').trim();
    var shown = form.elements.show_banner.checked;
    preview.classList.toggle('is-off', !shown);
    preview.textContent = shown ? (custom || auto) : 'Announcement bar hidden. Prices are still discounted.';
    if (hint) hint.textContent = custom ? 'Using your own text.' : 'Automatic text: “' + auto + '”';
  }

  function openModal(sale) {
    var wrap = $('saleModalWrap');
    var form = $('saleForm');
    if (!wrap || !form) return;
    form.reset();
    form.elements.sale_id.value = sale ? String(sale.id) : '';
    form.elements.name.value = sale ? sale.name : '';
    form.elements.discount_percent.value = sale ? String(Number(sale.discount_percent)) : '';
    form.elements.starts_at.value = sale ? dateInputFromIso(sale.starts_at) : '';
    form.elements.expires_at.value = sale ? dateInputFromIso(sale.expires_at) : '';
    form.elements.usage_limit.value = sale && sale.usage_limit != null ? String(sale.usage_limit) : '';
    form.elements.active.value = sale && sale.active === false ? 'false' : 'true';
    form.elements.banner_text.value = sale && sale.banner_text ? sale.banner_text : '';
    form.elements.show_banner.checked = sale ? sale.show_banner !== false : true;
    form.elements.banner_scroll.checked = sale ? !!sale.banner_scroll : false;
    $('saleModalTitle').textContent = sale ? 'Edit Site-wide Sale' : 'New Site-wide Sale';

    var statsWrap = $('saleStatsWrap');
    var statsText = $('saleStatsText');
    if (sale && statsWrap && statsText) {
      statsWrap.style.display = 'block';
      statsText.textContent = 'Orders: ' + String(sale.total_used || 0)
        + ' | Customer savings: ' + money(sale.total_discount_given)
        + ' | Revenue: ' + money(sale.total_revenue_generated)
        + ' | Created: ' + fmtDate(sale.created_at);
    } else if (statsWrap) {
      statsWrap.style.display = 'none';
    }
    updatePreview();
    wrap.classList.remove('hidden');
    setBodyLock();
  }

  function closeModal() {
    var wrap = $('saleModalWrap');
    if (wrap) wrap.classList.add('hidden');
    setBodyLock();
  }

  function save(evt) {
    evt.preventDefault();
    var form = evt.target;
    var id = parseInt(form.elements.sale_id.value, 10);
    var isEdit = Number.isInteger(id);
    var startsRaw = form.elements.starts_at.value;
    var endsRaw = form.elements.expires_at.value;
    var payload = {
      name: String(form.elements.name.value || '').trim(),
      discount_percent: Number(form.elements.discount_percent.value),
      starts_at: isoFromDateInput(startsRaw),
      expires_at: isoFromDateInput(endsRaw),
      usage_limit: form.elements.usage_limit.value === '' ? null : Number(form.elements.usage_limit.value),
      active: form.elements.active.value === 'true',
      banner_text: String(form.elements.banner_text.value || '').trim() || null,
      show_banner: !!form.elements.show_banner.checked,
      banner_scroll: !!form.elements.banner_scroll.checked
    };
    if (payload.expires_at && payload.active && new Date(payload.expires_at) < new Date()) {
      if (!window.confirm('That end date is already in the past, so this sale will not run. Save anyway?')) return;
    }
    var saveBtn = $('saleModalSave');
    if (saveBtn) saveBtn.disabled = true;
    api(isEdit ? '/api/admin/sales/' + id : '/api/admin/sales', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    }).then(function (data) {
      var s = data.sale || {};
      var msg = isEdit ? 'Sale updated' : 'Sale created';
      if (s.applied_now) msg += ' — it is live now';
      else if (s.status === 'scheduled') msg += ' — scheduled';
      toast(msg);
      closeModal();
      return load();
    }).catch(function (err) {
      toast(err.message || 'Failed to save sale');
    }).then(function () {
      if (saveBtn) saveBtn.disabled = false;
    });
  }

  function toggle(sale) {
    var turningOn = !sale.active;
    return api('/api/admin/sales/' + sale.id, { method: 'PUT', body: JSON.stringify({ active: turningOn }) })
      .then(function (data) {
        var s = data.sale || {};
        if (!turningOn) toast('Sale turned off. Regular prices are back.');
        else if (s.applied_now) toast('Sale is live now');
        else if (s.status === 'scheduled') toast('Sale turned on. It starts ' + fmtDate(s.starts_at));
        else if (s.status === 'expired') toast('Turned on, but its end date has passed. Edit the dates to run it.');
        else if (s.status === 'usage_limit_reached') toast('Turned on, but it has reached its maximum uses.');
        else toast('Sale turned on');
        return load();
      })
      .catch(function (err) { toast(err.message || 'Failed to update sale'); });
  }

  function remove(sale) {
    var warning = sale.applied_now
      ? 'This sale is LIVE. Deleting it ends the sale immediately and prices go back to normal.\n\n'
      : '';
    if (!window.confirm(warning + 'Permanently delete "' + sale.name + '"? Past orders keep their discount. This cannot be undone.')) {
      return Promise.resolve(false);
    }
    return api('/api/admin/sales/' + sale.id, { method: 'DELETE' })
      .then(function () { toast('Sale deleted'); return load(); })
      .catch(function (err) { toast(err.message || 'Failed to delete sale'); });
  }

  function bind() {
    if (bound) return;
    bound = true;

    var addBtn = $('btnAddSale');
    if (addBtn) addBtn.addEventListener('click', function () { openModal(null); });
    var closeBtn = $('saleModalClose');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    var cancelBtn = $('saleModalCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    var wrap = $('saleModalWrap');
    if (wrap) wrap.addEventListener('click', function (evt) { if (evt.target === wrap) closeModal(); });

    var form = $('saleForm');
    if (form) {
      form.addEventListener('submit', save);
      form.addEventListener('input', updatePreview);
      form.addEventListener('change', updatePreview);
    }

    var body = $('salesBody');
    if (body) {
      body.addEventListener('click', function (evt) {
        var btn = evt.target && evt.target.closest ? evt.target.closest('button[data-sale-action]') : null;
        if (!btn || btn.disabled) return;
        var id = parseInt(btn.getAttribute('data-sale-id'), 10);
        var sale = sales.filter(function (s) { return Number(s.id) === id; })[0];
        if (!sale) return;
        var action = btn.getAttribute('data-sale-action');
        if (action === 'edit') { openModal(sale); return; }
        btn.disabled = true;
        var pending = action === 'toggle' ? toggle(sale) : (action === 'delete' ? remove(sale) : null);
        Promise.resolve(pending).then(function () { btn.disabled = false; });
      });
    }
  }

  window.PepxAdminSale = { load: load };
})();
