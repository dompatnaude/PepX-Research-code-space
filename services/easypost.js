'use strict';

const crypto = require('crypto');
const EasyPost = require('@easypost/api');

let cachedClient = null;

function missingConfigError(message, code) {
  const err = new Error(message);
  err.code = code || 'easypost-config-missing';
  err.status = 500;
  return err;
}

let warnedAboutKeyMode = false;

// Warns once when the EasyPost key mode does not match the deployment target
// (for example a test key in production). Never logs the key itself - only
// whether it is a live (EZAK) or test (EZTK) key.
function warnOnKeyModeMismatch(key) {
  if (warnedAboutKeyMode) return;
  warnedAboutKeyMode = true;
  const mode = key.indexOf('EZTK') === 0 ? 'test' : (key.indexOf('EZAK') === 0 ? 'live' : 'unknown');
  const target = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
  if (target === 'production' && mode !== 'live') {
    console.warn('[easypost] WARNING: EASYPOST_API_KEY is a ' + mode + ' key but the deployment target is production.');
  } else if (target !== 'production' && mode === 'live') {
    console.warn('[easypost] WARNING: EASYPOST_API_KEY is a LIVE key outside production (target: ' + target + '). Real charges are possible.');
  }
}

function getEasyPostApiKey(env) {
  const key = String((env || process.env).EASYPOST_API_KEY || '').trim();
  if (!key) {
    throw missingConfigError('EasyPost is not configured: EASYPOST_API_KEY is missing.', 'easypost-api-key-missing');
  }
  warnOnKeyModeMismatch(key);
  return key;
}

function getEasyPostWebhookSecret(env) {
  const secret = String((env || process.env).EASYPOST_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    throw missingConfigError('EasyPost is not configured: EASYPOST_WEBHOOK_SECRET is missing.', 'easypost-webhook-secret-missing');
  }
  return secret;
}

function getEasyPostClient(options) {
  options = options || {};
  const env = options.env || process.env;
  const apiKey = options.apiKey || getEasyPostApiKey(env);

  if (!cachedClient || cachedClient.__apiKey !== apiKey) {
    cachedClient = new EasyPost(apiKey, {
      timeout: options.timeout || 60000
    });
    cachedClient.__apiKey = apiKey;
  }

  return cachedClient;
}

function resetEasyPostClientForTests() {
  cachedClient = null;
}

function sanitizeAddress(address) {
  if (!address) return null;
  return {
    id: address.id || null,
    name: address.name || null,
    company: address.company || null,
    street1: address.street1 || null,
    street2: address.street2 || null,
    city: address.city || null,
    state: address.state || null,
    zip: address.zip || null,
    country: address.country || null,
    phone: address.phone || null,
    email: address.email || null,
    residential: typeof address.residential === 'boolean' ? address.residential : null
  };
}

function addressesToComparableString(address) {
  if (!address) return '';
  return [
    address.name,
    address.company,
    address.street1,
    address.street2,
    address.city,
    address.state,
    address.zip,
    address.country,
    address.phone,
    address.email
  ].map(function (value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }).join('|');
}

function addressesMatch(left, right) {
  return addressesToComparableString(left) === addressesToComparableString(right);
}

function normalizeMoney(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round((num + Number.EPSILON) * 100) / 100 : 0;
}

function sanitizeRate(rate) {
  if (!rate) return null;
  return {
    rateId: rate.id || null,
    carrier: rate.carrier || null,
    service: rate.service || null,
    price: normalizeMoney(rate.rate),
    currency: rate.currency || 'USD',
    deliveryDays: rate.delivery_days == null ? null : Number(rate.delivery_days),
    deliveryDate: rate.delivery_date || null,
    shipmentId: rate.shipment_id || null
  };
}

function sanitizeShipmentRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    provider: row.provider,
    providerShipmentId: row.provider_shipment_id,
    providerTrackerId: row.provider_tracker_id,
    rateId: row.rate_id,
    carrier: row.carrier,
    service: row.service,
    trackingNumber: row.tracking_number,
    trackingUrl: row.tracking_url,
    labelUrl: row.label_url,
    labelFormat: row.label_format,
    labelCost: row.label_cost == null ? null : normalizeMoney(row.label_cost),
    currency: row.currency,
    shipmentStatus: row.shipment_status,
    isVoided: !!row.is_voided,
    voidedAt: row.voided_at || null,
    purchasedAt: row.purchased_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function sanitizeTrackerStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'pre_transit') return 'pre_transit';
  if (s === 'in_transit') return 'in_transit';
  if (s === 'out_for_delivery') return 'out_for_delivery';
  if (s === 'delivered') return 'delivered';
  if (s === 'available_for_pickup') return 'available_for_pickup';
  if (s === 'return_to_sender') return 'return_to_sender';
  if (s === 'failure') return 'failure';
  if (s === 'cancelled') return 'cancelled';
  return 'unknown';
}

function validateWebhookSignature(rawBody, signatureHeader, webhookSecret) {
  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''));
  const expectedHex = crypto.createHmac('sha256', webhookSecret).update(bodyBuffer).digest('hex');
  const expectedBase64 = crypto.createHmac('sha256', webhookSecret).update(bodyBuffer).digest('base64');
  const header = String(signatureHeader || '').trim();

  function safeEqual(a, b) {
    try {
      const left = Buffer.from(String(a));
      const right = Buffer.from(String(b));
      if (left.length !== right.length) return false;
      return crypto.timingSafeEqual(left, right);
    } catch (error) {
      return false;
    }
  }

  return safeEqual(header, expectedHex) || safeEqual(header, expectedBase64);
}

function getShipFromAddress(env) {
  const source = env || process.env;
  const required = ['SHIP_FROM_NAME', 'SHIP_FROM_STREET1', 'SHIP_FROM_CITY', 'SHIP_FROM_STATE', 'SHIP_FROM_ZIP'];
  const missing = required.filter(function (key) {
    return !String(source[key] || '').trim();
  });
  if (missing.length) {
    throw missingConfigError('EasyPost ship-from address is incomplete. Missing: ' + missing.join(', '), 'easypost-ship-from-missing');
  }

  return {
    name: String(source.SHIP_FROM_NAME || '').trim(),
    company: String(source.SHIP_FROM_COMPANY || '').trim() || null,
    street1: String(source.SHIP_FROM_STREET1 || '').trim(),
    street2: String(source.SHIP_FROM_STREET2 || '').trim() || null,
    city: String(source.SHIP_FROM_CITY || '').trim(),
    state: String(source.SHIP_FROM_STATE || '').trim(),
    zip: String(source.SHIP_FROM_ZIP || '').trim(),
    country: String(source.SHIP_FROM_COUNTRY || 'US').trim() || 'US',
    phone: String(source.SHIP_FROM_PHONE || '').trim() || null,
    email: String(source.SHIP_FROM_EMAIL || '').trim() || null
  };
}

function normalizeAddressText(value) {
  return String(value == null ? '' : value).trim();
}

// ---- Countries -----------------------------------------------------------
// Checkout stores ISO-3166 alpha-2 codes. Older orders stored "United States",
// so names that mean the US are still understood.
const US_COUNTRY_NAMES = new Set([
  'united states', 'united states of america', 'usa', 'u.s.', 'u.s.a.', 'us', 'america'
]);

function toCountryCode(value) {
  const raw = normalizeAddressText(value);
  if (!raw) return 'US';
  if (US_COUNTRY_NAMES.has(raw.toLowerCase())) return 'US';
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return raw;
}

function isDomesticCountry(value) {
  return toCountryCode(value) === 'US';
}

// Countries PepX ships to outside the U.S. Checkout only lists these, and
// the server refuses rates and orders for anything else. Override with a
// comma-separated SHIPPING_COUNTRIES env var (ISO codes) without a deploy.
const DEFAULT_INTERNATIONAL_COUNTRIES = ['MX', 'CO', 'NL', 'GB', 'AE', 'TH'];

function internationalShippingCountries(env) {
  const raw = String(((env || process.env).SHIPPING_COUNTRIES) || '').trim();
  const list = raw
    ? raw.split(',').map(function (c) { return c.trim().toUpperCase(); }).filter(function (c) { return /^[A-Z]{2}$/.test(c) && c !== 'US'; })
    : DEFAULT_INTERNATIONAL_COUNTRIES;
  return new Set(list);
}

function isShippableCountry(value, env) {
  const code = toCountryCode(value);
  return code === 'US' || internationalShippingCountries(env).has(code);
}

// Countries whose addresses need a state / province to be deliverable.
const REGION_REQUIRED_COUNTRIES = new Set(['US', 'CA', 'AU', 'MX', 'AE']);

// Countries that do not use postal codes (or where they are optional).
const POSTAL_OPTIONAL_COUNTRIES = new Set([
  'AE', 'AG', 'AO', 'AW', 'BS', 'BZ', 'BO', 'CO', 'CW', 'DM', 'FJ', 'GD', 'GH',
  'HK', 'JM', 'LC', 'MO', 'QA', 'SC', 'SR', 'TT', 'UG', 'ZW'
]);

function isRegionRequired(country) {
  return REGION_REQUIRED_COUNTRIES.has(toCountryCode(country));
}

function isPostalOptional(country) {
  return POSTAL_OPTIONAL_COUNTRIES.has(toCountryCode(country));
}

function buildOrderDestinationAddress(order) {
  return {
    name: normalizeAddressText(order.shipping_name),
    company: null,
    street1: normalizeAddressText(order.shipping_address),
    street2: null,
    city: normalizeAddressText(order.shipping_city),
    state: normalizeAddressText(order.shipping_state),
    zip: normalizeAddressText(order.shipping_zip),
    country: toCountryCode(order.shipping_country),
    phone: normalizeAddressText(order.shipping_phone) || null,
    email: normalizeAddressText(order.shipping_email) || null
  };
}

function validateDestinationAddress(order) {
  const destination = buildOrderDestinationAddress(order);
  const missing = [];
  if (!destination.street1) missing.push('street1');
  if (!destination.city) missing.push('city');
  if (!destination.state && isRegionRequired(destination.country)) missing.push('state');
  if (!destination.zip && !isPostalOptional(destination.country)) missing.push('zip');
  if (!destination.country) missing.push('country');

  if (missing.length) {
    const err = new Error('Incomplete destination address. Missing: ' + missing.join(', '));
    err.status = 422;
    err.code = 'incomplete_destination_address';
    throw err;
  }

  return destination;
}

function validatePackageInput(input) {
  const body = input || {};
  const pounds = Number(body.pounds);
  const ounces = Number(body.ounces);
  const length = Number(body.length);
  const width = Number(body.width);
  const height = Number(body.height);

  if (!Number.isFinite(pounds) || pounds < 0 || pounds > 1000) {
    const err = new Error('Package pounds must be between 0 and 1000.');
    err.status = 422;
    err.code = 'invalid_package_weight';
    throw err;
  }
  if (!Number.isFinite(ounces) || ounces < 0 || ounces >= 16) {
    const err = new Error('Package ounces must be between 0 and 15.99.');
    err.status = 422;
    err.code = 'invalid_package_weight';
    throw err;
  }

  const totalOunces = Math.round((pounds * 16 + ounces) * 100) / 100;
  if (!Number.isFinite(totalOunces) || totalOunces <= 0 || totalOunces > 32000) {
    const err = new Error('Package weight must be greater than zero and within reasonable limits.');
    err.status = 422;
    err.code = 'invalid_package_weight';
    throw err;
  }

  for (const entry of [
    ['length', length],
    ['width', width],
    ['height', height]
  ]) {
    if (!Number.isFinite(entry[1]) || entry[1] <= 0 || entry[1] > 108) {
      const err = new Error('Package ' + entry[0] + ' must be a positive number within carrier limits.');
      err.status = 422;
      err.code = 'invalid_package_dimensions';
      throw err;
    }
  }

  return {
    pounds,
    ounces,
    weight_oz: totalOunces,
    length,
    width,
    height
  };
}

function formatAddressForComparison(address) {
  return sanitizeAddress(address);
}

// Label output requested from EasyPost at shipment-creation time.
// USPS returns a native 4x6 portrait thermal label; because label_format is
// PDF the printable file comes back on postage_label.label_pdf_url.
const SHIPMENT_LABEL_OPTIONS = {
  label_size: '4x6',
  label_format: 'PDF'
};

function buildShipmentCreateParams({ toAddress, fromAddress, packageInfo, customsInfo }) {
  const params = {
    to_address: toAddress,
    from_address: fromAddress,
    parcel: {
      weight: packageInfo.weight_oz,
      length: packageInfo.length,
      width: packageInfo.width,
      height: packageInfo.height
    },
    options: Object.assign({}, SHIPMENT_LABEL_OPTIONS)
  };
  if (customsInfo) params.customs_info = customsInfo;
  return params;
}

// Customs declaration for an international label. Each order line becomes one
// customs item; the package weight is split across them by quantity. The
// declared description, HS code and signer come from env so they can be set
// to whatever PepX's broker or carrier requires without a code change.
function buildCustomsInfo({ items, packageInfo, env }) {
  const src = env || process.env;
  const lines = (Array.isArray(items) ? items : []).filter(function (it) {
    return it && Number(it.quantity) > 0;
  });
  if (!lines.length) return null;
  const totalQty = lines.reduce(function (sum, it) { return sum + Number(it.quantity); }, 0);
  const totalOz = Number(packageInfo && packageInfo.weight_oz) > 0 ? Number(packageInfo.weight_oz) : 8;
  const describe = String(src.CUSTOMS_ITEM_DESCRIPTION || '').trim();
  const hsCode = String(src.CUSTOMS_HS_TARIFF_NUMBER || '').trim();

  return {
    contents_type: String(src.CUSTOMS_CONTENTS_TYPE || 'merchandise').trim() || 'merchandise',
    contents_explanation: String(src.CUSTOMS_CONTENTS_EXPLANATION || '').trim() || null,
    customs_certify: true,
    customs_signer: String(src.CUSTOMS_SIGNER || src.SHIP_FROM_NAME || '').trim() || null,
    eel_pfc: String(src.CUSTOMS_EEL_PFC || 'NOEEI 30.37(a)').trim(),
    non_delivery_option: String(src.CUSTOMS_NON_DELIVERY || 'return').trim() || 'return',
    restriction_type: 'none',
    customs_items: lines.map(function (it) {
      const qty = Number(it.quantity);
      const unit = Number(it.price != null ? it.price : it.variant_price) || 0;
      const name = [it.name, it.variant_name].filter(Boolean).join(' ');
      const item = {
        description: (describe || name || 'Merchandise').slice(0, 45),
        quantity: qty,
        value: normalizeMoney(unit * qty),
        weight: Math.max(0.1, Math.round((totalOz * qty / totalQty) * 10) / 10),
        origin_country: String(src.CUSTOMS_ORIGIN_COUNTRY || 'US').trim() || 'US',
        currency: 'USD'
      };
      if (hsCode) item.hs_tariff_number = hsCode;
      return item;
    })
  };
}

// Maps EasyPost carrier+service strings to canonical checkout display names.
function classifyUspsService(carrier, service) {
  if (String(carrier || '').toUpperCase() !== 'USPS') return null;
  const s = String(service || '').toLowerCase().replace(/[\s_-]/g, '');
  if (s.includes('groundadvantage')) return 'USPS Ground Advantage';
  if (s.includes('prioritymailexpress') || (s.includes('express') && s.includes('priority'))) return 'USPS Priority Mail Express';
  if (s === 'express') return 'USPS Priority Mail Express';
  if (s.includes('priority')) return 'USPS Priority Mail';
  return null;
}

// Maps EasyPost FedEx carrier+service strings to the international services
// checkout offers. FedEx has renamed International Priority over time
// (INTERNATIONAL_PRIORITY -> FEDEX_INTERNATIONAL_PRIORITY), so both are read.
// Express, freight and distribution variants are deliberately not offered.
function classifyFedexInternationalService(carrier, service) {
  if (String(carrier || '').toUpperCase().indexOf('FEDEX') === -1) return null;
  const s = String(service || '').toLowerCase().replace(/[\s_-]/g, '');
  if (/freight|distribution|first|express|onerate/.test(s)) return null;
  if (s.includes('internationalconnectplus') || s.includes('connectplus')) return 'FedEx International Connect Plus';
  if (s.includes('internationaleconomy')) return 'FedEx International Economy';
  if (s.includes('internationalpriority')) return 'FedEx International Priority';
  return null;
}

// Display order for each zone at checkout, cheapest tier first.
const DOMESTIC_SERVICE_ORDER = [
  'USPS Ground Advantage',
  'USPS Priority Mail',
  'USPS Priority Mail Express'
];
const INTERNATIONAL_SERVICE_ORDER = [
  'FedEx International Connect Plus',
  'FedEx International Economy',
  'FedEx International Priority'
];

// Friendly carrier names for the account types EasyPost reports.
const CARRIER_DISPLAY_NAMES = {
  USPS: 'USPS',
  FEDEX: 'FedEx',
  FEDEXDEFAULT: 'FedEx',
  FEDEXSMARTPOST: 'FedEx',
  UPS: 'UPS',
  UPSDAP: 'UPS',
  UPSMAILINNOVATIONS: 'UPS',
  DHLEXPRESS: 'DHL Express',
  DHLECOMMERCE: 'DHL eCommerce',
  CANADAPOST: 'Canada Post',
  ASENDIAUSA: 'Asendia',
  GLOBEGISTICS: 'Globegistics',
  PASSPORTGLOBAL: 'Passport'
};
const SERVICE_WORDS = { usps: 'USPS', ups: 'UPS', dhl: 'DHL', fedex: 'FedEx', ddp: 'DDP', ddu: 'DDU', dap: 'DAP', nondoc: 'Non-Document' };

function carrierDisplayName(carrier) {
  const raw = String(carrier || '').trim();
  const key = raw.toUpperCase().replace(/[\s_-]/g, '');
  return CARRIER_DISPLAY_NAMES[key] || raw;
}

// "PriorityMailInternational" / "FEDEX_INTERNATIONAL_ECONOMY" -> readable words,
// with the carrier's own name dropped from the front of the service.
function serviceDisplayName(carrier, service) {
  const carrierName = carrierDisplayName(carrier);
  const words = String(service || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(function (w) {
      const lower = w.toLowerCase();
      if (SERVICE_WORDS[lower]) return SERVICE_WORDS[lower];
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    });
  const carrierWords = carrierName.toLowerCase().split(/\s+/);
  while (words.length && carrierWords.indexOf(words[0].toLowerCase()) !== -1) words.shift();
  return [carrierName].concat(words).join(' ').trim();
}

// U.S. orders ship USPS only. International orders may use any service the
// EasyPost account returns; FedEx keeps its familiar names.
function classifyCheckoutService(carrier, service, country) {
  if (isDomesticCountry(country)) return classifyUspsService(carrier, service);
  if (!String(carrier || '').trim() || !String(service || '').trim()) return null;
  return classifyFedexInternationalService(carrier, service) || serviceDisplayName(carrier, service);
}

function checkoutServiceOrder(country) {
  return isDomesticCountry(country) ? DOMESTIC_SERVICE_ORDER : INTERNATIONAL_SERVICE_ORDER;
}

// Default package dimensions for checkout rate requests (overridable via env).
function getCheckoutPackage(env) {
  const src = env || process.env;
  return {
    pounds: Number(src.CHECKOUT_SHIP_POUNDS) >= 0 ? Number(src.CHECKOUT_SHIP_POUNDS) : 0,
    ounces: Number(src.CHECKOUT_SHIP_OUNCES) > 0 ? Number(src.CHECKOUT_SHIP_OUNCES) : 8,
    length: Number(src.CHECKOUT_SHIP_LENGTH) > 0 ? Number(src.CHECKOUT_SHIP_LENGTH) : 8,
    width: Number(src.CHECKOUT_SHIP_WIDTH) > 0 ? Number(src.CHECKOUT_SHIP_WIDTH) : 5,
    height: Number(src.CHECKOUT_SHIP_HEIGHT) > 0 ? Number(src.CHECKOUT_SHIP_HEIGHT) : 3
  };
}

module.exports = {
  getEasyPostClient,
  getEasyPostApiKey,
  getEasyPostWebhookSecret,
  resetEasyPostClientForTests,
  sanitizeAddress,
  addressesMatch,
  sanitizeRate,
  sanitizeShipmentRecord,
  sanitizeTrackerStatus,
  validateWebhookSignature,
  getShipFromAddress,
  buildOrderDestinationAddress,
  validateDestinationAddress,
  validatePackageInput,
  formatAddressForComparison,
  buildShipmentCreateParams,
  SHIPMENT_LABEL_OPTIONS,
  missingConfigError,
  classifyUspsService,
  classifyFedexInternationalService,
  classifyCheckoutService,
  carrierDisplayName,
  serviceDisplayName,
  checkoutServiceOrder,
  DOMESTIC_SERVICE_ORDER,
  INTERNATIONAL_SERVICE_ORDER,
  buildCustomsInfo,
  toCountryCode,
  isDomesticCountry,
  isShippableCountry,
  internationalShippingCountries,
  DEFAULT_INTERNATIONAL_COUNTRIES,
  isRegionRequired,
  isPostalOptional,
  getCheckoutPackage
};