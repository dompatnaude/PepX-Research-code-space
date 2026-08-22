/**
 * services/email.js
 * ------------------------------------------------------------------
 * Transactional email templates and Resend delivery.
 *
 * This module owns the Resend client and the customer-facing email
 * templates. It deliberately does NOT touch the database: callers pass
 * in already-loaded rows (order, order_items, shipment), so every
 * message is rendered from authoritative server-side values and never
 * from anything the browser submitted.
 *
 * Two customer emails are defined here:
 *   1. Payment confirmed  - sent once the database says the money arrived.
 *   2. Order shipped      - sent once a real tracking number exists.
 *
 * Required environment (never hardcode these):
 *   RESEND_API_KEY   - Resend API key. Never logged, never rendered.
 *   ORDER_FROM_EMAIL - e.g. "PepX Research <orders@pepxresearch.com>"
 *   SITE_URL         - e.g. "https://pepxresearch.com"
 * ------------------------------------------------------------------
 */

'use strict';

const DEFAULT_SITE_URL = 'https://pepxresearch.com';
const DEFAULT_FROM = 'PepX Research <orders@pepxresearch.com>';
const BRAND_NAME = 'PepX Research';
// Existing published support address (index.html, shipping-policy.html).
const SUPPORT_EMAIL = 'pepxaminos@gmail.com';
const DISCLAIMER = 'For research use only. Not for human consumption.';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class EmailConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmailConfigError';
  }
}

// --- formatting helpers ----------------------------------------------

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return '$' + toNumber(value).toFixed(2);
}

function formatOrderDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

function siteUrl(env) {
  const configured = String((env && env.SITE_URL) || '').trim();
  return configured.replace(/\/+$/, '') || DEFAULT_SITE_URL;
}

function fromAddress(env) {
  return String((env && env.ORDER_FROM_EMAIL) || '').trim() || DEFAULT_FROM;
}

function siteHost(env) {
  return siteUrl(env).replace(/^https?:\/\//, '');
}

// --- order normalisation ---------------------------------------------

/**
 * Pick the address the email goes to. The checkout contact email is
 * preferred (that is what the customer typed for this order); the
 * account email is the fallback. Anything malformed is ignored.
 */
function resolveRecipient(order) {
  const candidates = [
    order && order.shipping_email,
    order && order.customer_email
  ];
  for (const candidate of candidates) {
    const value = String(candidate == null ? '' : candidate).trim();
    if (value && EMAIL_PATTERN.test(value)) return value;
  }
  return null;
}

function resolveFirstName(order) {
  const source = String(
    (order && (order.customer_name || order.shipping_name)) || ''
  ).trim();
  if (!source) return '';
  return source.split(/\s+/)[0];
}

const PAYMENT_METHOD_LABELS = {
  zelle: 'Zelle',
  card: 'Card'
};

function paymentMethodLabel(order) {
  const raw = String((order && order.payment_method) || '').trim();
  if (!raw) return 'Not recorded';
  return PAYMENT_METHOD_LABELS[raw.toLowerCase()] || raw;
}

/**
 * The database is the only source of truth for whether money arrived.
 * Only an explicit 'paid' payment_status (or a paid_at stamp on legacy
 * rows that predate payment_status) counts as confirmed. Every other
 * value - awaiting_payment, refunded, NULL, unknown - stays pending.
 */
function isPaymentConfirmed(order) {
  if (!order) return false;
  const status = String(order.payment_status || '').trim().toLowerCase();
  if (status === 'paid') return true;
  if (status) return false;
  return order.paid_at != null;
}

function orderNumberOf(order) {
  return String((order && order.order_number) || '').trim() ||
    ('#' + String((order && order.id) == null ? '' : order.id));
}

function addressLines(order) {
  const row = order || {};
  const cityState = [row.shipping_city, row.shipping_state]
    .map((part) => String(part == null ? '' : part).trim())
    .filter(Boolean)
    .join(', ');
  const cityStateZip = [cityState, String(row.shipping_zip || '').trim()]
    .filter(Boolean)
    .join(' ');
  return [
    row.shipping_name,
    row.shipping_address,
    cityStateZip,
    row.shipping_country
  ]
    .map((line) => String(line == null ? '' : line).trim())
    .filter(Boolean);
}

/**
 * Normalise order_items rows. Quantity and unit price come from the
 * order_items table, written server-side at order creation; the line
 * total is recomputed here rather than trusted from anywhere.
 */
function normalizeItems(items) {
  const rows = Array.isArray(items) ? items : [];
  return rows.map((item) => {
    const source = item || {};
    const quantity = Math.max(0, Math.trunc(toNumber(source.quantity)));
    const unitPrice = toNumber(source.price);
    const label = [source.name, source.variant_name]
      .map((part) => String(part == null ? '' : part).trim())
      .filter(Boolean)
      .join(' - ');
    return {
      name: label || 'Item',
      quantity,
      unitPrice,
      lineTotal: Math.round(unitPrice * quantity * 100) / 100
    };
  });
}

function normalizeTotals(order) {
  const row = order || {};
  return {
    subtotal: toNumber(row.subtotal),
    discount: toNumber(row.discount_amount),
    promoCode: String(row.promo_code || '').trim() || null,
    shipping: toNumber(row.shipping_cost),
    total: toNumber(row.total)
  };
}

/** Deep link to the customer's own order detail view (account.html reads order_id). */
function orderUrl(order, env) {
  const id = order && order.id;
  if (!Number.isInteger(Number(id))) return null;
  return siteUrl(env) + '/account.html?tab=orders&order_id=' + encodeURIComponent(String(id));
}

// --- shipment / tracking ----------------------------------------------

// Only carriers whose public tracking URL format we actually know.
// Anything else gets the tracking number rendered as plain text with no
// call to action, rather than a guessed link that 404s for the customer.
const CARRIER_TRACKING_URLS = {
  USPS: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=',
  UPS: 'https://www.ups.com/track?tracknum=',
  FEDEX: 'https://www.fedex.com/fedextrack/?trknbr='
};

function normalizeCarrierKey(carrier) {
  const raw = String(carrier || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!raw) return null;
  if (raw.startsWith('USPS')) return 'USPS';
  if (raw.startsWith('FEDEX')) return 'FEDEX';
  // UPSDAP / UPSMAILINNOVATIONS etc. are still UPS-tracked.
  if (raw.startsWith('UPS')) return 'UPS';
  return null;
}

function carrierDisplayName(carrier) {
  const key = normalizeCarrierKey(carrier);
  if (key === 'FEDEX') return 'FedEx';
  if (key) return key;
  return String(carrier || '').trim() || 'Carrier';
}

function isSafeHttpUrl(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return false;
  return /^https?:\/\/[^\s<>"']+$/i.test(raw);
}

/**
 * Best available tracking URL, in priority order:
 *   1. the URL EasyPost already stored on the shipment (tracker public_url)
 *   2. an explicit mapping for a carrier we support
 *   3. nothing - the caller must then render the number without a CTA
 * Never guesses a URL for an unknown carrier.
 */
function buildTrackingUrl(input) {
  const args = input || {};
  const trackingNumber = String(args.trackingNumber == null ? '' : args.trackingNumber).trim();
  if (!trackingNumber) return null;

  if (isSafeHttpUrl(args.trackingUrl)) {
    return String(args.trackingUrl).trim();
  }

  const key = normalizeCarrierKey(args.carrier);
  if (!key) return null;
  return CARRIER_TRACKING_URLS[key] + encodeURIComponent(trackingNumber);
}

const SHIPMENT_STATUS_LABELS = {
  label_created: 'Label created',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  available_for_pickup: 'Available for pickup',
  return_to_sender: 'Return to sender',
  failure: 'Delivery issue',
  unknown: null
};

function shipmentStatusLabel(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (!raw) return null;
  if (Object.prototype.hasOwnProperty.call(SHIPMENT_STATUS_LABELS, raw)) {
    return SHIPMENT_STATUS_LABELS[raw];
  }
  return raw.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Normalise a shipments row (or the order's own tracking columns) into
 * the shape the shipping template needs.
 */
function normalizeShipment(shipment, order) {
  const row = shipment || {};
  const fallback = order || {};
  const trackingNumber = String(
    row.tracking_number || row.trackingNumber || fallback.tracking_number || ''
  ).trim();
  const carrier = row.carrier || fallback.carrier || null;
  const trackingUrl = buildTrackingUrl({
    trackingNumber,
    carrier,
    trackingUrl: row.tracking_url || row.trackingUrl || null
  });

  return {
    trackingNumber: trackingNumber || null,
    carrier: carrier ? carrierDisplayName(carrier) : null,
    service: String(row.service || fallback.shipping_service || '').trim() || null,
    trackingUrl,
    status: shipmentStatusLabel(row.shipment_status || row.shipmentStatus)
  };
}

// --- shared layout ----------------------------------------------------

const COLORS = {
  canvas: '#eef1f6',
  paper: '#ffffff',
  header: '#0d0f12',
  ink: '#0b0b0c',
  body: '#3f4550',
  muted: '#6b7280',
  blue: '#1d4ed8',
  blueSoft: '#eff4ff',
  line: '#e4e8ef',
  card: '#f8fafc',
  green: '#0f7b46',
  greenSoft: '#e9f7f0'
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function label(text) {
  return '<div style="font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;' +
    'color:' + COLORS.muted + ';margin:0 0 10px;">' + escapeHtml(text) + '</div>';
}

/** Rounded information card. */
function card(title, innerHtml, options) {
  const opts = options || {};
  const background = opts.background || COLORS.card;
  const border = opts.border || COLORS.line;
  return '' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">' +
    '<tr><td style="background:' + background + ';border:1px solid ' + border +
    ';border-radius:12px;padding:20px;">' +
    (title ? label(title) : '') + innerHtml +
    '</td></tr></table>';
}

function button(href, text) {
  return '' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px auto 0;">' +
    '<tr><td align="center" style="background:' + COLORS.blue + ';border-radius:8px;">' +
    '<a href="' + escapeHtml(href) + '" style="display:block;padding:15px 34px;color:#ffffff;' +
    'text-decoration:none;font-family:' + FONT + ';font-size:15px;font-weight:700;letter-spacing:0.03em;">' +
    escapeHtml(text) + '</a></td></tr></table>';
}

function kvRow(name, value, options) {
  const opts = options || {};
  const valueHtml = opts.raw ? value : escapeHtml(value);
  return '' +
    '<tr>' +
    '<td style="padding:5px 0;font-size:14px;color:' + COLORS.muted + ';">' + escapeHtml(name) + '</td>' +
    '<td align="right" style="padding:5px 0;font-size:14px;color:' + COLORS.ink +
    ';font-weight:600;">' + valueHtml + '</td>' +
    '</tr>';
}

function kvTable(rowsHtml) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + rowsHtml + '</table>';
}

function itemsTable(items) {
  if (!items.length) {
    return '<div style="font-size:14px;color:' + COLORS.muted + ';">No items recorded on this order.</div>';
  }
  const rows = items.map(function (item) {
    return '' +
      '<tr>' +
      '<td style="padding:10px 0;border-top:1px solid ' + COLORS.line + ';font-size:14px;color:' +
      COLORS.ink + ';line-height:1.45;">' + escapeHtml(item.name) +
      '<div style="font-size:12px;color:' + COLORS.muted + ';margin-top:3px;">Qty ' +
      escapeHtml(String(item.quantity)) + ' &times; ' + escapeHtml(money(item.unitPrice)) + '</div></td>' +
      '<td align="right" style="padding:10px 0;border-top:1px solid ' + COLORS.line +
      ';font-size:14px;color:' + COLORS.ink + ';font-weight:600;white-space:nowrap;">' +
      escapeHtml(money(item.lineTotal)) + '</td>' +
      '</tr>';
  }).join('');
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + rows + '</table>';
}

function totalsTable(totals) {
  const rows = [
    kvRow('Subtotal', money(totals.subtotal)),
    totals.discount > 0
      ? kvRow(totals.promoCode ? 'Discount (' + totals.promoCode + ')' : 'Discount',
          '-' + money(totals.discount))
      : '',
    kvRow('Shipping', money(totals.shipping)),
    '<tr><td style="padding:12px 0 0;border-top:2px solid ' + COLORS.ink + ';font-size:16px;' +
    'font-weight:700;color:' + COLORS.ink + ';">Total</td>' +
    '<td align="right" style="padding:12px 0 0;border-top:2px solid ' + COLORS.ink +
    ';font-size:16px;font-weight:700;color:' + COLORS.ink + ';">' +
    escapeHtml(money(totals.total)) + '</td></tr>'
  ].join('');
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ' +
    'style="margin-top:14px;">' + rows + '</table>';
}

function supportSection(env) {
  return '' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0;">' +
    '<tr><td style="border-top:1px solid ' + COLORS.line + ';padding:22px 0 0;">' +
    '<div style="font-size:15px;font-weight:700;color:' + COLORS.ink + ';margin:0 0 6px;">Need Assistance?</div>' +
    '<div style="font-size:14px;line-height:1.6;color:' + COLORS.body + ';">' +
    'If you have questions about your order, contact PepX Research support at ' +
    '<a href="mailto:' + escapeHtml(SUPPORT_EMAIL) + '" style="color:' + COLORS.blue +
    ';font-weight:600;text-decoration:none;">' + escapeHtml(SUPPORT_EMAIL) + '</a>.' +
    '</div></td></tr></table>';
}

function footerSection(env, year) {
  const url = siteUrl(env);
  return '' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
    '<tr><td align="center" style="padding:26px 28px 30px;">' +
    '<div style="font-size:13px;font-weight:700;color:' + COLORS.ink + ';letter-spacing:0.02em;">' +
    escapeHtml(BRAND_NAME) + '</div>' +
    '<div style="font-size:13px;margin-top:4px;"><a href="' + escapeHtml(url) +
    '" style="color:' + COLORS.blue + ';text-decoration:none;">' + escapeHtml(siteHost(env)) + '</a></div>' +
    '<div style="font-size:12px;line-height:1.6;color:' + COLORS.muted + ';margin-top:12px;">' +
    escapeHtml(DISCLAIMER) + '</div>' +
    '<div style="font-size:12px;color:' + COLORS.muted + ';margin-top:6px;">&copy; ' +
    escapeHtml(String(year)) + ' ' + escapeHtml(BRAND_NAME) + '</div>' +
    '</td></tr></table>';
}

/** The 600px card shell every transactional email shares. */
function renderLayout(view) {
  return '' +
'<!doctype html>' +
'<html><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<meta name="color-scheme" content="light">' +
'<title>' + escapeHtml(view.subject) + '</title></head>' +
'<body style="margin:0;padding:0;background:' + COLORS.canvas + ';font-family:' + FONT + ';">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' +
COLORS.canvas + ';padding:24px 12px;">' +
'<tr><td align="center">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ' +
'style="max-width:600px;background:' + COLORS.paper + ';border:1px solid ' + COLORS.line +
';border-radius:14px;overflow:hidden;">' +

'<tr><td align="center" style="background:' + COLORS.header + ';padding:28px 28px;">' +
'<div style="font-size:26px;font-weight:800;letter-spacing:0.02em;color:#ffffff;line-height:1;">' +
'PepX<span style="color:#7ea6ff;">&nbsp;Research</span></div>' +
'<div style="font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;' +
'color:#9aa6bd;margin-top:8px;">Research-Grade Compounds</div>' +
'</td></tr>' +

'<tr><td style="padding:32px 28px 6px;">' +
'<h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;color:' + COLORS.ink + ';">' +
escapeHtml(view.heading) + '</h1>' +
'<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:' + COLORS.body + ';">' +
escapeHtml(view.subheading) + '</p>' +
(view.greeting
  ? '<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:' + COLORS.body + ';">' +
    escapeHtml(view.greeting) + '</p>'
  : '') +
'</td></tr>' +

'<tr><td style="padding:0 28px 28px;">' + view.blocks + supportSection(view.env) + '</td></tr>' +

'<tr><td style="border-top:1px solid ' + COLORS.line + ';">' +
footerSection(view.env, view.year) + '</td></tr>' +

'</table></td></tr></table></body></html>';
}

// --- shared view model -------------------------------------------------

function baseView(order, items, env) {
  return {
    env,
    order,
    orderNumber: orderNumberOf(order),
    orderDate: formatOrderDate(order && order.created_at),
    firstName: resolveFirstName(order),
    items: normalizeItems(items),
    totals: normalizeTotals(order),
    addressLines: addressLines(order),
    paymentMethod: paymentMethodLabel(order),
    orderUrl: orderUrl(order, env),
    year: new Date((order && order.created_at) || Date.now()).getUTCFullYear() ||
      new Date().getUTCFullYear()
  };
}

function greetingFor(view) {
  return view.firstName ? 'Hi ' + view.firstName + ',' : 'Hi,';
}

function orderSummaryCard(view) {
  return card('Order Summary',
    kvTable(
      kvRow('Order number', view.orderNumber) +
      kvRow('Order date', view.orderDate)
    ) +
    '<div style="height:6px;"></div>' +
    itemsTable(view.items) +
    totalsTable(view.totals)
  );
}

function destinationCard(view) {
  const body = view.addressLines.length
    ? view.addressLines.map(escapeHtml).join('<br>')
    : '<span style="color:' + COLORS.muted + ';">No shipping address on file.</span>';
  return card('Shipping Destination',
    '<div style="font-size:14px;line-height:1.65;color:' + COLORS.body + ';">' + body + '</div>');
}

function viewOrderCard(view, title, text) {
  if (!view.orderUrl) return '';
  return card(title,
    '<div style="font-size:14px;line-height:1.6;color:' + COLORS.body + ';margin:0 0 16px;">' +
    escapeHtml(text) + '</div>' + button(view.orderUrl, 'View Order'));
}

function plainTextItems(view) {
  if (!view.items.length) return ['- No items recorded on this order.'];
  const lines = [];
  view.items.forEach(function (item) {
    lines.push('- ' + item.name);
    lines.push('    Qty ' + item.quantity + ' x ' + money(item.unitPrice) + ' = ' + money(item.lineTotal));
  });
  return lines;
}

function plainTextTotals(view) {
  const lines = ['Subtotal: ' + money(view.totals.subtotal)];
  if (view.totals.discount > 0) {
    lines.push('Discount' + (view.totals.promoCode ? ' (' + view.totals.promoCode + ')' : '') +
      ': -' + money(view.totals.discount));
  }
  lines.push('Shipping: ' + money(view.totals.shipping));
  lines.push('Total: ' + money(view.totals.total));
  return lines;
}

function plainTextFooter(view) {
  return [
    '',
    'Need Assistance?',
    'If you have questions about your order, contact PepX Research support at ' + SUPPORT_EMAIL + '.',
    '',
    BRAND_NAME,
    siteUrl(view.env),
    '',
    DISCLAIMER,
    '(c) ' + view.year + ' ' + BRAND_NAME
  ];
}

// --- email 1: payment confirmed ---------------------------------------

function buildPaymentConfirmationEmail(input) {
  const args = input || {};
  const order = args.order || {};
  const env = args.env || process.env;
  const view = baseView(order, args.items != null ? args.items : order.items, env);

  view.subject = 'Payment Confirmed — Order #' + view.orderNumber;
  view.heading = 'Payment Confirmed';
  view.subheading = 'Your payment has been received and your order is now being prepared.';
  view.greeting = greetingFor(view);

  const paidCard = card(null,
    '<div style="font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;' +
    'color:' + COLORS.green + ';margin:0 0 6px;">Payment Status</div>' +
    '<div style="font-size:30px;font-weight:800;letter-spacing:0.04em;color:' + COLORS.green +
    ';line-height:1;">PAID</div>' +
    '<div style="font-size:14px;color:' + COLORS.body + ';margin-top:10px;">Your PepX Research order ' +
    'has been confirmed and is now being prepared.</div>',
    { background: COLORS.greenSoft, border: '#c9e9d9' });

  const paymentCard = card('Payment Details', kvTable(
    kvRow('Payment method', view.paymentMethod) +
    kvRow('Payment status', 'Paid') +
    kvRow('Amount paid', money(view.totals.total))
  ));

  view.blocks = paidCard + orderSummaryCard(view) +
    viewOrderCard(view, 'Track Your Order', 'You can review this order any time from your account.') +
    paymentCard + destinationCard(view);

  const text = [
    'PEPX RESEARCH',
    '',
    'PAYMENT CONFIRMED',
    'Your PepX Research order has been confirmed and is now being prepared.',
    '',
    greetingFor(view),
    '',
    'Order number: ' + view.orderNumber,
    'Order date: ' + view.orderDate,
    'Payment method: ' + view.paymentMethod,
    'Payment status: Paid',
    '',
    'ITEMS'
  ]
    .concat(plainTextItems(view))
    .concat([''])
    .concat(plainTextTotals(view))
    .concat(view.orderUrl ? ['', 'View your order: ' + view.orderUrl] : [])
    .concat(['', 'SHIPPING DESTINATION'])
    .concat(view.addressLines.length ? view.addressLines : ['No shipping address on file.'])
    .concat(plainTextFooter(view))
    .join('\n');

  return {
    from: fromAddress(env),
    to: resolveRecipient(order),
    subject: view.subject,
    html: renderLayout(view),
    text,
    view
  };
}

// --- email 2: shipped + tracking --------------------------------------

function trackingCard(shipment) {
  const rows = [];
  if (shipment.carrier) rows.push(kvRow('Carrier', shipment.carrier));
  if (shipment.service) rows.push(kvRow('Service', shipment.service));
  if (shipment.status) rows.push(kvRow('Status', shipment.status));

  // The tracking number itself is a link whenever we have a real URL.
  const numberHtml = shipment.trackingUrl
    ? '<a href="' + escapeHtml(shipment.trackingUrl) + '" style="color:' + COLORS.blue +
      ';font-weight:700;text-decoration:underline;word-break:break-all;">' +
      escapeHtml(shipment.trackingNumber) + '</a>'
    : '<span style="color:' + COLORS.ink + ';font-weight:700;word-break:break-all;">' +
      escapeHtml(shipment.trackingNumber) + '</span>';

  const cta = shipment.trackingUrl
    ? '<div style="margin-top:18px;">' + button(shipment.trackingUrl, 'TRACK YOUR PACKAGE') + '</div>'
    : '<div style="margin-top:14px;font-size:13px;line-height:1.6;color:' + COLORS.muted + ';">' +
      'Use this tracking number with your carrier to follow the shipment.</div>';

  return card('Tracking Details',
    kvTable(rows.join('') + kvRow('Tracking number', numberHtml, { raw: true })) + cta,
    { background: COLORS.blueSoft, border: '#d3e0fb' });
}

function buildShippingConfirmationEmail(input) {
  const args = input || {};
  const order = args.order || {};
  const env = args.env || process.env;
  const view = baseView(order, args.items != null ? args.items : order.items, env);
  const shipment = normalizeShipment(args.shipment, order);

  view.subject = 'Your PepX Research Order Has Shipped — #' + view.orderNumber;
  view.heading = 'Your Order Has Shipped';
  view.subheading = 'Your PepX Research order is on the way.';
  view.greeting = greetingFor(view);
  view.shipment = shipment;

  view.blocks =
    trackingCard(shipment) +
    destinationCard(view) +
    orderSummaryCard(view) +
    viewOrderCard(view, 'Order Status', 'You can review this order any time from your account.');

  const text = [
    'PEPX RESEARCH',
    '',
    'YOUR ORDER HAS SHIPPED',
    'Your PepX Research order is on the way.',
    '',
    greetingFor(view),
    '',
    'Order number: ' + view.orderNumber,
    'Carrier: ' + (shipment.carrier || 'Not recorded'),
    'Tracking number: ' + (shipment.trackingNumber || 'Not recorded')
  ]
    .concat(shipment.service ? ['Service: ' + shipment.service] : [])
    .concat(shipment.status ? ['Status: ' + shipment.status] : [])
    .concat(shipment.trackingUrl
      ? ['Track your package: ' + shipment.trackingUrl]
      : ['Use this tracking number with your carrier to follow the shipment.'])
    .concat(['', 'SHIPPING TO'])
    .concat(view.addressLines.length ? view.addressLines : ['No shipping address on file.'])
    .concat(['', 'ORDER SUMMARY'])
    .concat(plainTextItems(view))
    .concat([''])
    .concat(plainTextTotals(view))
    .concat(view.orderUrl ? ['', 'View your order: ' + view.orderUrl] : [])
    .concat(plainTextFooter(view))
    .join('\n');

  return {
    from: fromAddress(env),
    to: resolveRecipient(order),
    subject: view.subject,
    html: renderLayout(view),
    text,
    view
  };
}

// --- delivery ---------------------------------------------------------

/**
 * Resolve a Resend client. Tests inject their own via options.resend so
 * no automated run ever reaches the network or needs a real API key.
 */
function getResendClient(options) {
  const opts = options || {};
  if (opts.resend) return opts.resend;

  const env = opts.env || process.env;
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    throw new EmailConfigError('RESEND_API_KEY is not configured');
  }

  const { Resend } = require('resend');
  return new Resend(apiKey);
}

async function deliver(message, options) {
  const opts = options || {};
  const env = opts.env || process.env;

  if (!message.to) {
    throw new EmailConfigError('No usable customer email address for this order');
  }

  const client = getResendClient({ env, resend: opts.resend });
  const response = await client.emails.send({
    from: message.from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text
  });

  // The Resend SDK reports failures in the payload rather than throwing.
  if (response && response.error) {
    const error = new Error(String(response.error.message || 'Resend rejected the message'));
    error.name = 'ResendError';
    throw error;
  }

  return {
    id: (response && response.data && response.data.id) || null,
    to: message.to,
    subject: message.subject
  };
}

async function sendPaymentConfirmation(order, options) {
  const opts = options || {};
  const env = opts.env || process.env;
  return deliver(
    buildPaymentConfirmationEmail({ order, items: opts.items, env }),
    { env, resend: opts.resend }
  );
}

async function sendShippingConfirmation(order, options) {
  const opts = options || {};
  const env = opts.env || process.env;
  return deliver(
    buildShippingConfirmationEmail({ order, items: opts.items, shipment: opts.shipment, env }),
    { env, resend: opts.resend }
  );
}

module.exports = {
  sendPaymentConfirmation,
  sendShippingConfirmation,
  buildPaymentConfirmationEmail,
  buildShippingConfirmationEmail,
  buildTrackingUrl,
  normalizeShipment,
  carrierDisplayName,
  getResendClient,
  isPaymentConfirmed,
  resolveRecipient,
  resolveFirstName,
  normalizeItems,
  normalizeTotals,
  addressLines,
  orderUrl,
  escapeHtml,
  money,
  SUPPORT_EMAIL,
  EmailConfigError
};
