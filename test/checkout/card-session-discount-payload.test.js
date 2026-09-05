'use strict';
/**
 * What the payment host is told about a DISCOUNTED order.
 *
 * services/maef-card.js describes the cart to the payment host as opaque
 * ordinals -- group, variant, quantity, unit cents -- alongside total,
 * subtotal and shipping. It derives subtotal as (total - shipping), and it
 * builds the cart lines from order_items, whose unit prices are the
 * pre-promo prices. A promo discount therefore lands on the subtotal but
 * never on the lines, and the payload stops adding up.
 *
 * These tests PIN that behaviour rather than assert it is correct. The
 * payment host is a third party whose validation rules are not in this
 * repository, so the payload is deliberately left as-is until someone can
 * confirm the accepted shape. If the payload is later corrected, the
 * "does not reconcile" test below will fail -- which is the point: it is a
 * tripwire, not an endorsement.
 *
 * The one committed example of an expected payload, in wallet-redirect.test.js,
 * is an UNDISCOUNTED order (total 112.95, shipping 22.95, one line of 90.00)
 * whose lines do reconcile with its subtotal. That is the only structural
 * evidence the repo offers, and it is consistent with the invariant holding.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.MAEF_PARENT_URL = process.env.MAEF_PARENT_URL || 'https://payment-host.invalid';
process.env.MAEF_SECRET = process.env.MAEF_SECRET || 'test-secret';
process.env.MAEF_CARD_ENABLED = '1';

const maef = require('../../services/maef-card');

/** Capture the body maef-card.js would POST, without any network. */
async function capture(args) {
  const realFetch = global.fetch;
  let body = null;
  global.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return { status: 200, text: async () => JSON.stringify({ session_token: 'tok_test' }) };
  };
  try {
    await maef.mintSession(args);
  } finally {
    global.fetch = realFetch;
  }
  assert.ok(body, 'no payload was sent');
  return body;
}

const lineSum = (payload) => payload.cart.reduce((a, l) => a + l.u * l.q, 0) / 100;

// One item at $75.00. Shipping $5.70. A 10% code takes $7.50 off the goods.
const CART = [{ product_id: 33, variant_id: null, unit_price: '75.00', quantity: 1 }];
const undiscounted = () => capture({ orderId: 4243, ref: 'a'.repeat(16), total: 80.70, shipping: 5.70, items: CART });
const discounted = () => capture({ orderId: 4242, ref: 'b'.repeat(16), total: 73.20, shipping: 5.70, items: CART });

test('an undiscounted order reconciles: lines = subtotal, subtotal + shipping = total', async () => {
  const p = await undiscounted();
  assert.equal(p.total, 80.7);
  assert.equal(p.subtotal, 75);
  assert.equal(p.shipping, 5.7);
  assert.equal(lineSum(p), 75, 'cart lines do not sum to the subtotal');
  assert.equal(Math.round((p.subtotal + p.shipping) * 100) / 100, p.total);
});

test('a discounted order still balances subtotal + shipping against total', async () => {
  const p = await discounted();
  assert.equal(p.total, 73.2);
  assert.equal(p.subtotal, 67.5, 'subtotal is not total minus shipping');
  assert.equal(p.shipping, 5.7);
  assert.equal(Math.round((p.subtotal + p.shipping) * 100) / 100, p.total);
});

test('KNOWN GAP: a discounted order is sent cart lines that overstate its subtotal', async () => {
  const p = await discounted();
  const overstatement = Math.round((lineSum(p) - p.subtotal) * 100) / 100;
  // The lines still carry the pre-discount price, so they exceed the subtotal
  // by exactly the discount. Pinned deliberately: change this only together
  // with a confirmed payload shape from the payment host.
  assert.equal(lineSum(p), 75, 'cart lines are no longer the pre-discount prices');
  assert.equal(overstatement, 7.5,
    'the lines/subtotal gap changed; if the payload was corrected, update this test');
});

test('KNOWN GAP: the payload has nowhere to express a discount', async () => {
  const p = await discounted();
  const keys = Object.keys(p);
  assert.deepEqual(keys.filter((k) => /discount|coupon|promo|adjust/i.test(k)), [],
    'a discount field now exists - the payload can carry the discount, so send it');
  assert.deepEqual(keys.sort(),
    ['cart', 'jti', 'shipping', 'subtotal', 'timestamp', 'total', 'utm_params', 'wc_order_id'],
    'the payload shape changed; re-check whether a discount can now be represented');
});

test('a cart line is never sent with a zero or negative unit price', async () => {
  // buildCart drops non-positive lines, so a discount can never be smuggled in
  // as a negative line: there is no supported way to express one.
  const p = await capture({
    orderId: 4244, ref: 'c'.repeat(16), total: 5.7, shipping: 5.7,
    items: [{ product_id: 1, variant_id: null, unit_price: '0.00', quantity: 1 }] });
  for (const line of p.cart) assert.ok(line.u > 0, 'a non-positive unit price reached the payload');
});

test('the amount the buyer is charged is the order total, whatever the lines say', async () => {
  // Whatever the host makes of the cart, the charge itself is driven by total,
  // and routes/checkout-card.js re-checks the captured amount against it.
  const p = await discounted();
  assert.equal(p.total, 73.2);
  const card = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', '..', 'routes', 'checkout-card.js'), 'utf8');
  assert.match(card, /total:\s*money\(order\.total\)/);
  assert.match(card, /Math\.abs\(st\.amount - money\(order\.total\)\)\s*>\s*0\.005/);
});
