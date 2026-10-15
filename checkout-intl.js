/*
 * checkout-intl.js
 * ---------------------------------------------------------------------------
 * U.S. / international shipping for checkout.html.
 *
 * script.js still owns the cart, totals, shipping rates and order placement;
 * it reads the same field IDs it always has. This file only:
 *   - switches between U.S. (USPS) and International delivery,
 *   - fills the country dropdown and adapts the address fields to it,
 *   - keeps the hidden #shipping_country (ISO code) and #shipping_state fields
 *     in sync with what the shopper picked,
 *   - hides U.S.-only payment options abroad, and
 *   - shows the express-pay buttons once the wallet rail is available.
 * The server decides the carrier from the country; nothing here is trusted.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var page = document.getElementById('checkoutPage');
  if (!page) return;

  // ---- Country data --------------------------------------------------------
  var US_STATES = [
    ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],
    ['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],
    ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],
    ['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],
    ['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],
    ['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],
    ['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],
    ['OR','Oregon'],['PA','Pennsylvania'],['PR','Puerto Rico'],['RI','Rhode Island'],['SC','South Carolina'],
    ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],
    ['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
  ];
  var MX_STATES = [
    ['AGU','Aguascalientes'],['BCN','Baja California'],['BCS','Baja California Sur'],['CAM','Campeche'],
    ['CHP','Chiapas'],['CHH','Chihuahua'],['CMX','Ciudad de México'],['COA','Coahuila'],['COL','Colima'],
    ['DUR','Durango'],['GUA','Guanajuato'],['GRO','Guerrero'],['HID','Hidalgo'],['JAL','Jalisco'],
    ['MEX','Estado de México'],['MIC','Michoacán'],['MOR','Morelos'],['NAY','Nayarit'],['NLE','Nuevo León'],
    ['OAX','Oaxaca'],['PUE','Puebla'],['QUE','Querétaro'],['ROO','Quintana Roo'],['SLP','San Luis Potosí'],
    ['SIN','Sinaloa'],['SON','Sonora'],['TAB','Tabasco'],['TAM','Tamaulipas'],['TLA','Tlaxcala'],
    ['VER','Veracruz'],['YUC','Yucatán'],['ZAC','Zacatecas']
  ];
  var AE_EMIRATES = [
    ['AZ','Abu Dhabi'],['AJ','Ajman'],['DU','Dubai'],['FU','Fujairah'],['RK','Ras Al Khaimah'],
    ['SH','Sharjah'],['UQ','Umm Al Quwain']
  ];

  // The only countries PepX ships to. Keep in step with
  // INTERNATIONAL_SHIPPING_COUNTRIES in services/easypost.js (the server
  // refuses any other country even if this list is edited in the browser).
  var DETAILED = [
    { code: 'US', name: 'United States', dial: '+1', postalFirst: false, postal: 'ZIP code', postalEx: '60490', postalMax: 10,
      postalMode: 'numeric', city: 'City', cityEx: '', phoneEx: '(312) 555-0123', line1: 'Street address',
      line1Ex: '123 Main St', line2Ex: 'Apt 4B', hint: '', region: { label: 'State', list: US_STATES, required: true } },

    { code: 'MX', name: 'Mexico', group: 'Central & South America', dial: '+52', postalFirst: false,
      postal: 'Código postal', postalEx: '06600', postalMax: 5, postalMode: 'numeric', city: 'City / municipality',
      cityEx: 'Ciudad de México', phoneEx: '55 1234 5678', line1: 'Street and number', line1Ex: 'Av. Reforma 222',
      line2Ex: 'Colonia, interior number', hint: 'street and number, colonia on the second line, then city, state and 5-digit código postal.',
      region: { label: 'State', list: MX_STATES, required: true } },
    { code: 'CO', name: 'Colombia', group: 'Central & South America', dial: '+57', postalFirst: false,
      postal: 'Postal code', postalEx: '110111', postalMax: 6, postalMode: 'numeric', city: 'City',
      cityEx: 'Bogotá', phoneEx: '301 234 5678', line1: 'Street address', line1Ex: 'Calle 93 # 11-26',
      line2Ex: 'Apto, barrio', hint: 'street address (e.g. Calle 93 # 11-26), city and department; postal code if you know it.',
      region: { label: 'Department', list: null, required: true, placeholder: 'Cundinamarca' } },

    { code: 'NL', name: 'Netherlands', group: 'Europe', dial: '+31', postalFirst: true, postal: 'Postal code',
      postalEx: '1012 AB', postalMax: 7, postalMode: 'text', city: 'City', cityEx: 'Amsterdam', phoneEx: '6 12345678',
      line1: 'Street and house number', line1Ex: 'Damrak 1', line2Ex: '', hint: 'street and number, then postal code (1234 AB) and city.',
      region: null },
    { code: 'GB', name: 'United Kingdom', group: 'Europe', dial: '+44', postalFirst: false, postal: 'Postcode', postalEx: 'SW1A 1AA',
      postalMax: 8, postalMode: 'text', city: 'Town / city', cityEx: 'London', phoneEx: '7700 900123', line1: 'Street address',
      line1Ex: '10 High Street', line2Ex: 'Flat 2', hint: 'street, town, county (optional), postcode.',
      region: { label: 'County (optional)', list: null, required: false, placeholder: 'Greater London' } },

    { code: 'AE', name: 'United Arab Emirates', group: 'Middle East & Asia', dial: '+971', postalFirst: false,
      postal: 'Postal code', postalEx: '', postalMax: 10, postalMode: 'text', city: 'City / area', cityEx: 'Dubai Marina',
      phoneEx: '50 123 4567', line1: 'Building and street', line1Ex: 'Marina Plaza, Al Marsa St', line2Ex: 'Apartment / office number',
      hint: 'building and street, apartment number, area and emirate. No postal code needed.',
      region: { label: 'Emirate', list: AE_EMIRATES, required: true } },
    { code: 'TH', name: 'Thailand', group: 'Middle East & Asia', dial: '+66', postalFirst: false, postal: 'Postal code',
      postalEx: '10110', postalMax: 5, postalMode: 'numeric', city: 'District / city', cityEx: 'Khlong Toei',
      phoneEx: '81 234 5678', line1: 'House number and street', line1Ex: '123 Sukhumvit Rd', line2Ex: 'Soi, sub-district',
      hint: 'house number and street, soi and sub-district on the second line, then district, province and 5-digit postal code.',
      region: { label: 'Province', list: null, required: true, placeholder: 'Bangkok' } }
  ];

  var GROUPS = ['Central & South America', 'Europe', 'Middle East & Asia'];

  // Mirrors POSTAL_OPTIONAL_COUNTRIES in services/easypost.js.
  var POSTAL_OPTIONAL = { AE: 1, CO: 1 };

  var COUNTRIES = DETAILED.slice();
  var byCode = {};
  DETAILED.forEach(function (c) { byCode[c.code] = c; });
  var INTL = COUNTRIES.filter(function (c) { return c.code !== 'US'; });

  // ---- Elements ------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  var el = {
    country: $('shipping_country'), state: $('shipping_state'),
    countryWrap: $('cxCountryWrap'), countrySelect: $('cxCountry'),
    address: $('cxAddress'), line1: $('shipping_address'), line1Label: $('cxLine1Label'), line2: $('shipping_address2'),
    city: $('shipping_city'), cityLabel: $('cxCityLabel'),
    regionWrap: $('cxRegionWrap'), regionLabel: $('cxRegionLabel'), regionSelect: $('cxRegionSelect'), regionText: $('cxRegionText'),
    zip: $('shipping_zip'), postalLabel: $('cxPostalLabel'),
    hint: $('cxFormatHint'), phone: $('shipping_phone'), dial: $('cxPhoneDial'),
    customs: $('cxCustomsNotice'), intlShip: $('cxIntlShipNote'), taxRow: $('cxTaxRow'),
    zelle: $('zelleOption'), payNote: $('cxIntlPayNote'), walletName: $('cxWalletName'),
    importRow: $('agreeImportDutiesRow'), importBox: $('agreeImportDuties'),
    express: $('cxExpress'), payBtn: $('checkoutBtn'), total: $('checkoutTotal')
  };
  if (!el.country || !el.countrySelect) return;

  var state = { code: 'US', lastIntl: null };

  el.countrySelect.innerHTML = GROUPS.map(function (g) {
    return '<optgroup label="' + g.replace(/&/g, '&amp;') + '">' + INTL.filter(function (c) { return c.group === g; }).map(function (c) {
      return '<option value="' + c.code + '">' + c.name + '</option>';
    }).join('') + '</optgroup>';
  }).join('');

  // ---- Helpers -------------------------------------------------------------
  function toCode(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return 'US';
    var lower = raw.toLowerCase();
    if (['united states', 'united states of america', 'usa', 'u.s.', 'u.s.a.', 'us', 'america'].indexOf(lower) !== -1) return 'US';
    if (/^[a-z]{2}$/i.test(raw) && byCode[raw.toUpperCase()]) return raw.toUpperCase();
    for (var i = 0; i < COUNTRIES.length; i++) {
      if (COUNTRIES[i].name.toLowerCase() === lower) return COUNTRIES[i].code;
    }
    // A saved address abroad in a country we don't ship to: keep the shopper
    // on International so they can see which countries are available.
    return INTL[0].code;
  }

  function regionCode(country, value) {
    var raw = String(value == null ? '' : value).trim();
    var region = country.region;
    if (!raw || !region || !region.list) return raw;
    var up = raw.toUpperCase();
    for (var i = 0; i < region.list.length; i++) {
      if (region.list[i][0] === up || region.list[i][1].toUpperCase() === up) return region.list[i][0];
    }
    return '';
  }

  function fire(node) {
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setControl(node, on, required) {
    node.hidden = !on;
    node.disabled = !on;
    node.required = !!(on && required);
  }

  function writeState(value) {
    if (el.state.value === value) return;
    el.state.value = value;
    fire(el.state);
  }

  function isIntl() { return state.code !== 'US'; }

  // ---- Apply a country to the form -----------------------------------------
  function applyCountry(code, opts) {
    opts = opts || {};
    var c = byCode[code] || byCode.US;
    var changed = c.code !== state.code;
    state.code = c.code;
    if (c.code !== 'US') state.lastIntl = c.code;
    var intl = c.code !== 'US';

    // zone radios + dropdown
    Array.prototype.forEach.call(document.querySelectorAll('input[name="cx_zone"]'), function (r) {
      r.checked = (r.value === 'intl') === intl;
      r.closest('.cx-zone-option').classList.toggle('is-selected', r.checked);
    });
    el.countryWrap.hidden = !intl;
    el.countrySelect.disabled = !intl;
    if (intl) el.countrySelect.value = c.code;
    page.classList.toggle('cx-intl', intl);

    // address labels and formats
    el.line1Label.textContent = c.line1;
    el.line1.placeholder = c.line1Ex || '';
    el.line2.placeholder = c.line2Ex || '';
    el.cityLabel.textContent = c.city;
    el.city.placeholder = c.cityEx || '';
    el.postalLabel.textContent = c.postal + (POSTAL_OPTIONAL[c.code] ? ' (optional)' : '');
    el.zip.placeholder = c.postalEx || '';
    el.zip.maxLength = c.postalMax || 10;
    el.zip.inputMode = c.postalMode || 'text';
    el.zip.required = !POSTAL_OPTIONAL[c.code];
    el.address.classList.toggle('is-postal-first', !!c.postalFirst);
    el.address.classList.toggle('no-region', !c.region);
    el.hint.hidden = !intl || !c.hint;
    el.hint.textContent = intl && c.hint ? ('Address format for ' + c.name + ': ' + c.hint) : '';

    // region / state control
    var keep = opts.keepRegion ? regionCode(c, el.state.value) : '';
    if (!c.region) {
      el.regionWrap.hidden = true;
      setControl(el.regionSelect, false);
      setControl(el.regionText, false);
      writeState('');
    } else {
      el.regionWrap.hidden = false;
      el.regionLabel.textContent = c.region.label;
      if (c.region.list) {
        el.regionLabel.htmlFor = 'cxRegionSelect';
        el.regionSelect.innerHTML = '<option value="">Select</option>' + c.region.list.map(function (r) {
          return '<option value="' + r[0] + '">' + r[1] + '</option>';
        }).join('');
        setControl(el.regionSelect, true, c.region.required);
        setControl(el.regionText, false);
        el.regionSelect.value = keep;
        writeState(el.regionSelect.value);
      } else {
        el.regionLabel.htmlFor = 'cxRegionText';
        setControl(el.regionSelect, false);
        setControl(el.regionText, true, c.region.required);
        el.regionText.placeholder = c.region.placeholder || '';
        el.regionText.value = opts.keepRegion ? el.state.value : '';
        writeState(el.regionText.value.trim());
      }
    }

    // phone
    el.dial.textContent = c.dial;
    el.phone.placeholder = c.phoneEx || '';

    // country name in notices
    Array.prototype.forEach.call(document.querySelectorAll('[data-cx-country-name]'), function (n) {
      n.textContent = intl ? c.name : 'your country';
    });
    el.customs.hidden = !intl;
    el.intlShip.hidden = !intl;
    if (el.taxRow) el.taxRow.hidden = intl;
    el.importRow.hidden = !intl;
    el.importBox.required = intl;
    if (!intl) el.importBox.checked = false;
    fire(el.importBox);

    // payments: Zelle and Cash App Pay are U.S.-only
    syncPayments();

    if (el.country.value !== c.code) {
      el.country.value = c.code;
      if (!opts.silent) fire(el.country);
    } else if (changed && !opts.silent) {
      fire(el.country);
    }
  }

  function syncPayments() {
    var intl = isIntl();
    if (el.zelle) {
      var zr = el.zelle.querySelector('input');
      el.zelle.hidden = intl;
      zr.disabled = intl;
      if (intl && zr.checked) {
        zr.checked = false;
        var card = document.querySelector('input[name="payment_method"][data-card-rail]');
        if (card && !card.disabled) card.checked = true;
        var picked = document.querySelector('input[name="payment_method"]:checked');
        if (picked) picked.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    if (el.walletName) el.walletName.textContent = intl ? 'Apple Pay or Google Pay' : 'Apple Pay, Google Pay or Cash App Pay';
    el.payNote.hidden = !intl;
    Array.prototype.forEach.call(document.querySelectorAll('[data-cx-us-only]'), function (b) { b.hidden = intl; });
  }

  // ---- Bindings ------------------------------------------------------------
  Array.prototype.forEach.call(document.querySelectorAll('input[name="cx_zone"]'), function (r) {
    r.addEventListener('change', function () {
      if (!r.checked) return;
      applyCountry(r.value === 'intl' ? (state.lastIntl || INTL[0].code) : 'US');
      if (r.value === 'intl') el.countrySelect.focus();
    });
  });
  el.countrySelect.addEventListener('change', function () { applyCountry(el.countrySelect.value); });
  el.regionSelect.addEventListener('change', function () { writeState(el.regionSelect.value); });
  el.regionText.addEventListener('input', function () { writeState(el.regionText.value.trim()); });

  // Express buttons choose the wallet rail; the order is still placed with
  // the single Pay button, after address and shipping are filled in.
  Array.prototype.forEach.call(document.querySelectorAll('[data-cx-express]'), function (b) {
    b.addEventListener('click', function () {
      var wallet = document.querySelector('input[name="payment_method"][data-wallet-rail]');
      if (!wallet || wallet.disabled) return;
      wallet.checked = true;
      wallet.dispatchEvent(new Event('change', { bubbles: true }));
      if (el.payBtn) el.payBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // Show the express row only when script.js has enabled the wallet rail.
  var walletRadio = document.querySelector('input[name="payment_method"][data-wallet-rail]');
  function syncExpress() {
    var on = !!(walletRadio && !walletRadio.disabled);
    el.express.hidden = !on;
    var tile = $('walletOption');
    if (tile) tile.classList.toggle('cx-wallet-on', on);
  }
  if (walletRadio && window.MutationObserver) {
    new MutationObserver(syncExpress).observe(walletRadio, { attributes: true, attributeFilter: ['disabled'] });
  }
  syncExpress();

  // Card rail switches on asynchronously; re-run so an international shopper
  // who landed on Zelle is moved to card as soon as it exists.
  var cardRadio = document.querySelector('input[name="payment_method"][data-card-rail]');
  if (cardRadio && window.MutationObserver) {
    new MutationObserver(syncPayments).observe(cardRadio, { attributes: true, attributeFilter: ['disabled'] });
  }

  // Pay button shows the amount ("Pay $58.70") while it is idle.
  var BUSY = /\.\.\.$|…$/;
  function syncPayLabel() {
    if (!el.payBtn || !el.total) return;
    var amount = String(el.total.textContent || '').trim();
    var label = amount && amount !== '$0.00' ? ('Pay ' + amount) : 'Place Order';
    el.payBtn.setAttribute('data-default-label', label);
    if (!BUSY.test(String(el.payBtn.textContent || '').trim())) el.payBtn.textContent = label;
  }
  if (el.total && window.MutationObserver) {
    new MutationObserver(syncPayLabel).observe(el.total, { childList: true, characterData: true, subtree: true });
  }

  // ---- Public API used by script.js ---------------------------------------
  window.PXCheckoutIntl = {
    isInternational: isIntl,
    countryCode: function () { return state.code; },
    // Re-read fields script.js filled in (saved profile, USPS suggestion).
    syncFromFields: function () {
      applyCountry(toCode(el.country.value), { keepRegion: true, silent: true });
    },
    address2: function () { return String(el.line2.value || '').trim(); },
    // Full street line as stored on the order (line 1 + line 2).
    streetLine: function () {
      var l1 = String(el.line1.value || '').trim();
      var l2 = String(el.line2.value || '').trim();
      return l2 ? (l1 + ', ' + l2) : l1;
    },
    // International numbers are stored with their dialing code.
    phone: function () {
      var raw = String(el.phone.value || '').trim();
      if (!raw || raw.charAt(0) === '+' || !isIntl()) return raw;
      var c = byCode[state.code];
      return (c ? c.dial + ' ' : '') + raw;
    },
    isReadyForRating: function () {
      var zip = String(el.zip.value || '').trim();
      var st = String(el.state.value || '').trim();
      if (!isIntl()) return zip.length >= 5 && st.length >= 2;
      var c = byCode[state.code];
      var needsRegion = !!(c && c.region && c.region.required);
      var city = String(el.city.value || '').trim();
      var line1 = String(el.line1.value || '').trim();
      return line1.length >= 3 && city.length >= 2 &&
        (POSTAL_OPTIONAL[state.code] || zip.length >= 2) &&
        (!needsRegion || st.length >= 2);
    }
  };

  applyCountry(toCode(el.country.value), { keepRegion: true, silent: true });
  syncPayLabel();
})();
