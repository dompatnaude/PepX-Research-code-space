/**
 * services/email.js
 * ------------------------------------------------------------------
 * Transactional email delivery via Resend.
 *
 * This module owns the Resend client and the order confirmation
 * template. It deliberately does NOT touch the database: callers pass
 * in an already-loaded order row plus its order_items rows, so the
 * message is always rendered from authoritative server-side values
 * and never from anything the browser submitted.
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

// --- order normalisation ---------------------------------------------

/**
 * Pick the address the receipt goes to. The checkout contact email is
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

function describePayment(order) {
  const paid = isPaymentConfirmed(order);
  return {
    paid,
    method: paymentMethodLabel(order),
    headline: paid ? 'Payment Received' : 'Order Received',
    statusLabel: paid ? 'Paid' : 'Pending',
    statusLine: paid ? 'Payment Status: Paid' : 'Payment Status: Pending'
  };
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
 * order_items table, which was written server-side at order creation;
 * the line total is recomputed here rather than trusted from anywhere.
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

// --- templates --------------------------------------------------------

const COLORS = {
  ink: '#0b0b0c',
  body: '#3f4550',
  muted: '#6b7280',
  blue: '#1d4ed8',
  blueSoft: '#eef2ff',
  line: '#e3e6ec',
  paper: '#ffffff',
  canvas: '#f5f7fb'
};

function renderItemRows(items) {
  if (!items.length) {
    return '<tr><td colspan="4" style="padding:14px 0;color:' + COLORS.muted +
      ';font-size:14px;">No items recorded on this order.</td></tr>';
  }
  return items
    .map(function (item) {
      return '' +
        '<tr>' +
        '<td style="padding:12px 0;border-bottom:1px solid ' + COLORS.line +
        ';font-size:14px;color:' + COLORS.ink + ';">' + escapeHtml(item.name) + '</td>' +
        '<td align="center" style="padding:12px 8px;border-bottom:1px solid ' + COLORS.line +
        ';font-size:14px;color:' + COLORS.body + ';">' + escapeHtml(String(item.quantity)) + '</td>' +
        '<td align="right" style="padding:12px 8px;border-bottom:1px solid ' + COLORS.line +
        ';font-size:14px;color:' + COLORS.body + ';">' + escapeHtml(money(item.unitPrice)) + '</td>' +
        '<td align="right" style="padding:12px 0;border-bottom:1px solid ' + COLORS.line +
        ';font-size:14px;color:' + COLORS.ink + ';font-weight:600;">' +
        escapeHtml(money(item.lineTotal)) + '</td>' +
        '</tr>';
    })
    .join('');
}

function renderTotalRow(label, value, options) {
  const opts = options || {};
  const weight = opts.strong ? '700' : '400';
  const size = opts.strong ? '16px' : '14px';
  const color = opts.strong ? COLORS.ink : COLORS.body;
  const border = opts.strong ? '2px solid ' + COLORS.ink : 'none';
  return '' +
    '<tr>' +
    '<td style="padding:6px 0;border-top:' + border + ';font-size:' + size +
    ';color:' + color + ';font-weight:' + weight + ';">' + escapeHtml(label) + '</td>' +
    '<td align="right" style="padding:6px 0;border-top:' + border + ';font-size:' + size +
    ';color:' + color + ';font-weight:' + weight + ';">' + escapeHtml(value) + '</td>' +
    '</tr>';
}

function renderHtml(view) {
  const totalsRows = [
    renderTotalRow('Subtotal', money(view.totals.subtotal)),
    view.totals.discount > 0
      ? renderTotalRow(
          view.totals.promoCode ? 'Discount (' + view.totals.promoCode + ')' : 'Discount',
          '-' + money(view.totals.discount)
        )
      : '',
    renderTotalRow('Shipping', money(view.totals.shipping)),
    renderTotalRow('Total', money(view.totals.total), { strong: true })
  ].join('');

  const greeting = view.firstName
    ? 'Hi ' + escapeHtml(view.firstName) + ','
    : 'Hi,';

  const addressHtml = view.addressLines.length
    ? view.addressLines.map(escapeHtml).join('<br>')
    : '<span style="color:' + COLORS.muted + ';">No shipping address on file.</span>';

  const pendingNote = view.payment.paid
    ? ''
    : '<p style="margin:0 0 22px;padding:12px 14px;background:' + COLORS.blueSoft +
      ';border-left:3px solid ' + COLORS.blue + ';font-size:14px;line-height:1.55;color:' +
      COLORS.body + ';">We have not received payment for this order yet. ' +
      'It will move to fulfillment as soon as your payment is confirmed.</p>';

  return '' +
'<!doctype html>' +
'<html><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>' + escapeHtml(view.subject) + '</title></head>' +
'<body style="margin:0;padding:0;background:' + COLORS.canvas +
';font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' +
COLORS.canvas + ';padding:28px 12px;">' +
'<tr><td align="center">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:' +
COLORS.paper + ';border:1px solid ' + COLORS.line + ';border-radius:10px;overflow:hidden;">' +

'<tr><td style="background:' + COLORS.ink + ';padding:22px 28px;">' +
'<div style="font-size:20px;font-weight:700;letter-spacing:0.02em;color:#ffffff;">PepX<span style="color:#7aa2ff;">&nbsp;Research</span></div>' +
'</td></tr>' +

'<tr><td style="padding:28px 28px 8px;">' +
'<h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:' + COLORS.ink + ';">' +
escapeHtml(view.payment.headline) + '</h1>' +
'<p style="margin:0 0 18px;font-size:14px;color:' + COLORS.muted + ';">' +
'Order <strong style="color:' + COLORS.blue + ';">#' + escapeHtml(view.orderNumber) +
'</strong> &nbsp;&middot;&nbsp; ' + escapeHtml(view.orderDate) + '</p>' +
'<p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:' + COLORS.body + ';">' + greeting + '</p>' +
'<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:' + COLORS.body + ';">' +
'Thank you for your order. Here is a summary of what we received.</p>' +
pendingNote +
'</td></tr>' +

'<tr><td style="padding:0 28px;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
'<tr>' +
'<th align="left" style="padding:0 0 8px;border-bottom:2px solid ' + COLORS.ink +
';font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:' + COLORS.muted + ';">Item</th>' +
'<th align="center" style="padding:0 8px 8px;border-bottom:2px solid ' + COLORS.ink +
';font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:' + COLORS.muted + ';">Qty</th>' +
'<th align="right" style="padding:0 8px 8px;border-bottom:2px solid ' + COLORS.ink +
';font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:' + COLORS.muted + ';">Unit</th>' +
'<th align="right" style="padding:0 0 8px;border-bottom:2px solid ' + COLORS.ink +
';font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:' + COLORS.muted + ';">Total</th>' +
'</tr>' + renderItemRows(view.items) + '</table>' +
'</td></tr>' +

'<tr><td style="padding:18px 28px 4px;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + totalsRows + '</table>' +
'</td></tr>' +

'<tr><td style="padding:24px 28px 8px;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
'<td valign="top" width="50%" style="padding-right:10px;">' +
'<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:' +
COLORS.muted + ';margin-bottom:6px;">Shipping to</div>' +
'<div style="font-size:14px;line-height:1.6;color:' + COLORS.body + ';">' + addressHtml + '</div>' +
'</td>' +
'<td valign="top" width="50%" style="padding-left:10px;">' +
'<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:' +
COLORS.muted + ';margin-bottom:6px;">Payment</div>' +
'<div style="font-size:14px;line-height:1.6;color:' + COLORS.body + ';">' +
'Method: ' + escapeHtml(view.payment.method) + '<br>' +
'Payment Status: <strong style="color:' + (view.payment.paid ? COLORS.blue : COLORS.ink) + ';">' +
escapeHtml(view.payment.statusLabel) + '</strong></div>' +
'</td></tr></table>' +
'</td></tr>' +

'<tr><td align="center" style="padding:26px 28px 30px;">' +
'<a href="' + escapeHtml(view.siteUrl) + '" style="display:inline-block;background:' + COLORS.blue +
';color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 26px;border-radius:6px;">' +
'Visit PepX Research</a></td></tr>' +

'<tr><td style="padding:18px 28px 26px;border-top:1px solid ' + COLORS.line + ';">' +
'<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:' + COLORS.muted + ';">' +
'For research use only. Not for human consumption.</p>' +
'<p style="margin:0;font-size:12px;line-height:1.6;color:' + COLORS.muted + ';">' +
'&copy; ' + escapeHtml(String(view.year)) + ' PepX Research &middot; ' +
'<a href="' + escapeHtml(view.siteUrl) + '" style="color:' + COLORS.blue + ';">' +
escapeHtml(view.siteUrl) + '</a></p>' +
'</td></tr>' +

'</table></td></tr></table></body></html>';
}

function renderText(view) {
  const lines = [];
  lines.push('PEPX RESEARCH');
  lines.push('');
  lines.push(view.payment.headline);
  lines.push('Order #' + view.orderNumber);
  lines.push('Order date: ' + view.orderDate);
  lines.push('');
  lines.push(view.firstName ? 'Hi ' + view.firstName + ',' : 'Hi,');
  lines.push('Thank you for your order. Here is a summary of what we received.');
  if (!view.payment.paid) {
    lines.push('');
    lines.push('We have not received payment for this order yet. It will move to');
    lines.push('fulfillment as soon as your payment is confirmed.');
  }
  lines.push('');
  lines.push('ITEMS');
  if (view.items.length) {
    view.items.forEach(function (item) {
      lines.push('- ' + item.name);
      lines.push('    Qty ' + item.quantity + ' x ' + money(item.unitPrice) +
        ' = ' + money(item.lineTotal));
    });
  } else {
    lines.push('- No items recorded on this order.');
  }
  lines.push('');
  lines.push('Subtotal: ' + money(view.totals.subtotal));
  if (view.totals.discount > 0) {
    lines.push('Discount' + (view.totals.promoCode ? ' (' + view.totals.promoCode + ')' : '') +
      ': -' + money(view.totals.discount));
  }
  lines.push('Shipping: ' + money(view.totals.shipping));
  lines.push('Total: ' + money(view.totals.total));
  lines.push('');
  lines.push('SHIPPING TO');
  if (view.addressLines.length) {
    view.addressLines.forEach(function (line) { lines.push(line); });
  } else {
    lines.push('No shipping address on file.');
  }
  lines.push('');
  lines.push('PAYMENT');
  lines.push('Method: ' + view.payment.method);
  lines.push(view.payment.statusLine);
  lines.push('');
  lines.push(view.siteUrl);
  lines.push('');
  lines.push('For research use only. Not for human consumption.');
  lines.push('(c) ' + view.year + ' PepX Research');
  return lines.join('\n');
}

/**
 * Build the full message for an order. Pure: no network, no database.
 * Exported so tests can assert on content without sending anything.
 */
function buildOrderConfirmationEmail(input) {
  const args = input || {};
  const order = args.order || {};
  const env = args.env || process.env;
  const items = normalizeItems(args.items != null ? args.items : order.items);
  const orderNumber = String(order.order_number || '').trim() ||
    ('#' + String(order.id == null ? '' : order.id));
  const orderDate = formatOrderDate(order.created_at);

  const view = {
    subject: BRAND_NAME + ' Order #' + orderNumber,
    orderNumber: orderNumber,
    orderDate: orderDate,
    firstName: resolveFirstName(order),
    items: items,
    totals: normalizeTotals(order),
    addressLines: addressLines(order),
    payment: describePayment(order),
    siteUrl: siteUrl(env),
    year: new Date(order.created_at || Date.now()).getUTCFullYear() ||
      new Date().getUTCFullYear()
  };

  return {
    from: fromAddress(env),
    to: resolveRecipient(order),
    subject: view.subject,
    html: renderHtml(view),
    text: renderText(view),
    view: view
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

/**
 * Send the order confirmation receipt for an already-persisted order.
 * Throws on failure so the caller decides how to react; callers in the
 * order flow must swallow that error (see services/order-confirmation.js).
 */
async function sendOrderConfirmation(order, options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const message = buildOrderConfirmationEmail({
    order: order,
    items: opts.items,
    env: env
  });

  if (!message.to) {
    throw new EmailConfigError(
      'No usable customer email address for order ' +
        String((order && order.order_number) || (order && order.id) || 'unknown')
    );
  }

  const client = getResendClient({ env: env, resend: opts.resend });
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

module.exports = {
  sendOrderConfirmation,
  buildOrderConfirmationEmail,
  getResendClient,
  isPaymentConfirmed,
  describePayment,
  resolveRecipient,
  resolveFirstName,
  normalizeItems,
  normalizeTotals,
  addressLines,
  escapeHtml,
  money,
  EmailConfigError
};
