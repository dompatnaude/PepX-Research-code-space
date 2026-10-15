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
  var CA_PROVINCES = [
    ['AB','Alberta'],['BC','British Columbia'],['MB','Manitoba'],['NB','New Brunswick'],
    ['NL','Newfoundland and Labrador'],['NS','Nova Scotia'],['NT','Northwest Territories'],['NU','Nunavut'],
    ['ON','Ontario'],['PE','Prince Edward Island'],['QC','Quebec'],['SK','Saskatchewan'],['YT','Yukon']
  ];
  var AU_STATES = [
    ['ACT','Australian Capital Territory'],['NSW','New South Wales'],['NT','Northern Territory'],
    ['QLD','Queensland'],['SA','South Australia'],['TAS','Tasmania'],['VIC','Victoria'],['WA','Western Australia']
  ];

  function postalFirst(code, name, dial, max, postalEx, cityEx, phoneEx, line1Ex, hint) {
    return { code: code, name: name, dial: dial, postalFirst: true, postal: 'Postal code', postalEx: postalEx,
      postalMax: max, postalMode: 'numeric', city: 'City', cityEx: cityEx, phoneEx: phoneEx,
      line1: 'Street and house number', line1Ex: line1Ex, line2Ex: '', hint: hint, region: null };
  }

  var DETAILED = [
    { code: 'US', name: 'United States', dial: '+1', postalFirst: false, postal: 'ZIP code', postalEx: '60490', postalMax: 10,
      postalMode: 'numeric', city: 'City', cityEx: '', phoneEx: '(312) 555-0123', line1: 'Street address',
      line1Ex: '123 Main St', line2Ex: 'Apt 4B', hint: '', region: { label: 'State', list: US_STATES, required: true } },
    { code: 'CA', name: 'Canada', dial: '+1', postalFirst: false, postal: 'Postal code', postalEx: 'M5V 2T6', postalMax: 7,
      postalMode: 'text', city: 'City', cityEx: 'Toronto', phoneEx: '(416) 555-0123', line1: 'Street address',
      line1Ex: '200 King St W', line2Ex: 'Unit 1200', hint: 'street, city, province, postal code (A1A 1A1).',
      region: { label: 'Province', list: CA_PROVINCES, required: true } },
    { code: 'GB', name: 'United Kingdom', dial: '+44', postalFirst: false, postal: 'Postcode', postalEx: 'SW1A 1AA', postalMax: 8,
      postalMode: 'text', city: 'Town / city', cityEx: 'London', phoneEx: '7700 900123', line1: 'Street address',
      line1Ex: '10 High Street', line2Ex: 'Flat 2', hint: 'street, town, county (optional), postcode.',
      region: { label: 'County (optional)', list: null, required: false, placeholder: 'Greater London' } },
    postalFirst('DK', 'Denmark', '+45', 4, '2100', 'København Ø', '12 34 56 78', 'Østerbrogade 12', 'street and number, then 4-digit postal code and city. Put floor/side (e.g. 3. th.) on the apartment line.'),
    postalFirst('DE', 'Germany', '+49', 5, '10115', 'Berlin', '1512 3456789', 'Hauptstraße 5', 'street and number, then 5-digit postal code and city.'),
    postalFirst('NL', 'Netherlands', '+31', 7, '1012 AB', 'Amsterdam', '6 12345678', 'Damrak 1', 'street and number, then postal code (1234 AB) and city.'),
    postalFirst('SE', 'Sweden', '+46', 6, '111 22', 'Stockholm', '70 123 45 67', 'Drottninggatan 10', 'street and number, then postal code (123 45) and city.'),
    postalFirst('NO', 'Norway', '+47', 4, '0150', 'Oslo', '412 34 567', 'Karl Johans gate 1', 'street and number, then 4-digit postal code and city.'),
    postalFirst('FR', 'France', '+33', 5, '75001', 'Paris', '6 12 34 56 78', '12 rue de Rivoli', 'number and street, then 5-digit postal code and city.'),
    { code: 'AU', name: 'Australia', dial: '+61', postalFirst: false, postal: 'Postcode', postalEx: '2000', postalMax: 4,
      postalMode: 'numeric', city: 'Suburb', cityEx: 'Sydney', phoneEx: '412 345 678', line1: 'Street address',
      line1Ex: '1 George St', line2Ex: 'Unit 3', hint: 'street, suburb, state, 4-digit postcode.',
      region: { label: 'State', list: AU_STATES, required: true } }
  ];
  // NL and SE postal codes contain a space and letters.
  DETAILED.forEach(function (c) { if (c.code === 'NL' || c.code === 'SE') c.postalMode = 'text'; });

  // code|name|dial|p (p = postal code comes before the city).
  // Countries under U.S. sanctions are intentionally not listed.
  var RAW = 'AD|Andorra|376|p;AE|United Arab Emirates|971;AG|Antigua and Barbuda|1;AL|Albania|355|p;AM|Armenia|374|p;AO|Angola|244;AR|Argentina|54|p;AT|Austria|43|p;AW|Aruba|297;AZ|Azerbaijan|994;BA|Bosnia and Herzegovina|387|p;BB|Barbados|1;BD|Bangladesh|880;BE|Belgium|32|p;BG|Bulgaria|359|p;BH|Bahrain|973;BM|Bermuda|1;BN|Brunei|673;BO|Bolivia|591;BR|Brazil|55;BS|Bahamas|1;BT|Bhutan|975;BW|Botswana|267;BZ|Belize|501;CH|Switzerland|41|p;CI|Ivory Coast|225;CL|Chile|56;CM|Cameroon|237;CN|China|86;CO|Colombia|57;CR|Costa Rica|506;CV|Cape Verde|238;CW|Curaçao|599;CY|Cyprus|357|p;CZ|Czechia|420|p;DM|Dominica|1;DO|Dominican Republic|1;DZ|Algeria|213|p;EC|Ecuador|593;EE|Estonia|372|p;EG|Egypt|20;ES|Spain|34|p;ET|Ethiopia|251;FI|Finland|358|p;FJ|Fiji|679;FO|Faroe Islands|298|p;GD|Grenada|1;GE|Georgia|995|p;GH|Ghana|233;GI|Gibraltar|350;GL|Greenland|299|p;GR|Greece|30|p;GT|Guatemala|502;GY|Guyana|592;HK|Hong Kong|852;HN|Honduras|504;HR|Croatia|385|p;HT|Haiti|509;HU|Hungary|36;ID|Indonesia|62;IE|Ireland|353;IL|Israel|972;IN|India|91;IQ|Iraq|964;IS|Iceland|354|p;IT|Italy|39|p;JM|Jamaica|1;JO|Jordan|962;JP|Japan|81;KE|Kenya|254;KG|Kyrgyzstan|996;KH|Cambodia|855;KR|South Korea|82;KW|Kuwait|965;KY|Cayman Islands|1;KZ|Kazakhstan|7;LA|Laos|856;LB|Lebanon|961;LC|Saint Lucia|1;LI|Liechtenstein|423|p;LK|Sri Lanka|94;LT|Lithuania|370|p;LU|Luxembourg|352|p;LV|Latvia|371|p;MA|Morocco|212|p;MC|Monaco|377|p;MD|Moldova|373|p;ME|Montenegro|382|p;MG|Madagascar|261;MK|North Macedonia|389|p;MM|Myanmar|95;MN|Mongolia|976;MO|Macau|853;MT|Malta|356;MU|Mauritius|230;MV|Maldives|960;MW|Malawi|265;MX|Mexico|52;MY|Malaysia|60;MZ|Mozambique|258;NA|Namibia|264;NC|New Caledonia|687|p;NG|Nigeria|234;NI|Nicaragua|505;NP|Nepal|977;NZ|New Zealand|64;OM|Oman|968;PA|Panama|507;PE|Peru|51;PF|French Polynesia|689|p;PG|Papua New Guinea|675;PH|Philippines|63;PK|Pakistan|92;PL|Poland|48|p;PT|Portugal|351|p;PY|Paraguay|595;QA|Qatar|974;RO|Romania|40;RS|Serbia|381|p;RW|Rwanda|250;SA|Saudi Arabia|966;SC|Seychelles|248;SG|Singapore|65;SI|Slovenia|386|p;SK|Slovakia|421|p;SM|San Marino|378|p;SN|Senegal|221;SR|Suriname|597;SV|El Salvador|503;TH|Thailand|66;TJ|Tajikistan|992;TM|Turkmenistan|993;TN|Tunisia|216|p;TR|Türkiye|90|p;TT|Trinidad and Tobago|1;TW|Taiwan|886;TZ|Tanzania|255;UA|Ukraine|380;UG|Uganda|256;UY|Uruguay|598|p;UZ|Uzbekistan|998;VE|Venezuela|58;VN|Vietnam|84;XK|Kosovo|383|p;ZA|South Africa|27;ZM|Zambia|260;ZW|Zimbabwe|263';

  // Mirrors POSTAL_OPTIONAL_COUNTRIES in services/easypost.js.
  var POSTAL_OPTIONAL = { AE:1, AG:1, AO:1, AW:1, BS:1, BZ:1, BO:1, CW:1, DM:1, FJ:1, GD:1, GH:1, HK:1, JM:1, LC:1, MO:1, QA:1, SC:1, SR:1, TT:1, UG:1, ZW:1 };

  var COUNTRIES = DETAILED.slice();
  var byCode = {};
  DETAILED.forEach(function (c) { byCode[c.code] = c; });
  RAW.split(';').forEach(function (row) {
    var a = row.split('|');
    if (byCode[a[0]]) return;
    var pf = a[3] === 'p';
    var c = { code: a[0], name: a[1], dial: '+' + a[2], postalFirst: pf, postal: 'Postal code', postalEx: '',
      postalMax: 10, postalMode: 'text', city: 'City', cityEx: '', phoneEx: '',
      line1: pf ? 'Street and house number' : 'Street address', line1Ex: '', line2Ex: '',
      hint: pf ? 'street and number, then postal code and city.' : 'street, city, state or province, postal code.',
      region: pf ? null : { label: 'State / province (optional)', list: null, required: false, placeholder: '' } };
    COUNTRIES.push(c);
    byCode[c.code] = c;
  });
  var INTL = COUNTRIES.filter(function (c) { return c.code !== 'US'; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });

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

  el.countrySelect.innerHTML = INTL.map(function (c) {
    return '<option value="' + c.code + '">' + c.name + '</option>';
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
    return 'US';
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
