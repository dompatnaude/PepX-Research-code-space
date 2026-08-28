'use strict';
/**
 * Card rail — server-to-server client for the payment host.
 *
 * Everything sent upstream is NUMBERS plus an opaque line shape. No product
 * name, no SKU, no strength, no order number, no domain. The cart is described
 * only as ordinals: group, variant, quantity, unit cents.
 */
const crypto = require('crypto');

function config() {
  return {
    base: String(process.env.MAEF_PARENT_URL || '').replace(/\/+$/, ''),
    secret: String(process.env.MAEF_SECRET || ''),
    enabled: String(process.env.MAEF_CARD_ENABLED || '') === '1',
  };
}
function configured() {
  const c = config();
  return Boolean(c.base && c.secret);
}
/**
 * The operator master switch. Configured is not the same as live: the payment
 * host cannot charge until its processor account is connected, so the rail
 * stays dark until MAEF_CARD_ENABLED is deliberately set.
 */
function available() {
  return configured() && config().enabled;
}
function sign(body, secret) {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}
/** Opaque frame ticket: expiry + MAC. Carries no data about this store. */
function frameTicket() {
  const c = config();
  if (!c.secret) return '';
  const exp = Math.floor(Date.now() / 1000) + 10800; // 3h
  return exp + '.' + crypto.createHmac('sha256', c.secret).update('maef-sq-frame|' + exp, 'utf8').digest('hex');
}
/** A neutral reference. The store's own order number carries the brand stem. */
function neutralRef() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Build the opaque cart shape from order items.
 * Group = base product, variant ordinal distinguishes strengths of the same product.
 */
function buildCart(items) {
  const groups = new Map();
  const cart = [];
  for (const it of items) {
    const baseKey = String(it.product_id);
    if (!groups.has(baseKey)) groups.set(baseKey, { g: groups.size, variants: new Map() });
    const grp = groups.get(baseKey);
    const vKey = String(it.variant_id || 0);
    if (!grp.variants.has(vKey)) grp.variants.set(vKey, grp.variants.size);
    const q = Math.max(1, parseInt(it.quantity, 10) || 1);
    const u = Math.round(Number(it.unit_price) * 100);
    if (u > 0) cart.push({ g: grp.g, v: grp.variants.get(vKey), q, u });
  }
  return cart;
}

async function post(path, payload) {
  const c = config();
  const body = JSON.stringify(payload);
  const res = await fetch(c.base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-MAEF-Signature': sign(body, c.secret) },
    body,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* non-JSON upstream reply */ }
  return { status: res.status, json };
}

/** Mint a payment session for an order. Returns { token } or throws. */
async function mintSession({ orderId, ref, total, shipping, items }) {
  const subtotal = Math.round((Number(total) - Number(shipping)) * 100) / 100;
  const cart = buildCart(items);
  const payload = {
    timestamp: Math.floor(Date.now() / 1000),
    jti: 'c' + crypto.randomBytes(8).toString('hex'),
    total: Number(total),
    subtotal: subtotal >= 0 ? subtotal : Number(total),
    shipping: Number(shipping) || 0,
    wc_order_id: Number(orderId),
    cart: cart.length ? cart : [{ g: 0, v: 0, q: 1, u: Math.round(Number(total) * 100) }],
    utm_params: { child_order_ref: String(ref) },
  };
  const { status, json } = await post('/wp-json/maef/v1/embed-session', payload);
  const token = json && json.session_token ? String(json.session_token) : '';
  if (!token) {
    const err = new Error('session_mint_failed');
    err.upstreamStatus = status;
    throw err;
  }
  return { token };
}

/** Ask the payment host whether this session actually captured. */
async function sessionStatus(token) {
  const { status, json } = await post('/wp-json/maef/v1/embed-status', {
    timestamp: Math.floor(Date.now() / 1000),
    session_token: String(token),
  });
  return {
    httpStatus: status,
    paid: Boolean(json && json.paid),
    amount: json && json.amount != null ? Number(json.amount) : null,
    transId: json && json.transId ? String(json.transId) : '',
    state: json && json.status ? String(json.status) : '',
  };
}

module.exports = { config, configured, available, frameTicket, neutralRef, buildCart, mintSession, sessionStatus };
