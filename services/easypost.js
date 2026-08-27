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

function getEasyPostApiKey(env) {
  const key = String((env || process.env).EASYPOST_API_KEY || '').trim();
  if (!key) {
    throw missingConfigError('EasyPost is not configured: EASYPOST_API_KEY is missing.', 'easypost-api-key-missing');
  }
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

function buildOrderDestinationAddress(order) {
  return {
    name: normalizeAddressText(order.shipping_name),
    company: null,
    street1: normalizeAddressText(order.shipping_address),
    street2: null,
    city: normalizeAddressText(order.shipping_city),
    state: normalizeAddressText(order.shipping_state),
    zip: normalizeAddressText(order.shipping_zip),
    country: normalizeAddressText(order.shipping_country) || 'US',
    phone: normalizeAddressText(order.shipping_phone) || null,
    email: normalizeAddressText(order.shipping_email) || null
  };
}

function validateDestinationAddress(order) {
  const destination = buildOrderDestinationAddress(order);
  const missing = [];
  if (!destination.street1) missing.push('street1');
  if (!destination.city) missing.push('city');
  if (!destination.state) missing.push('state');
  if (!destination.zip) missing.push('zip');
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

function buildShipmentCreateParams({ toAddress, fromAddress, packageInfo }) {
  return {
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
  getCheckoutPackage
};