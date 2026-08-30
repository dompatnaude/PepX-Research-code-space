'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');

// The wallet rail sends the buyer OFF this site to approve the payment. Two things
// must hold every time it does: the return address travels in the URL FRAGMENT (a
// browser never puts a fragment on the wire, and the payment host clears it before
// its own SDK can report the page address upstream), and an order that is already
// paid can never be sent round again.
process.env.MAEF_PARENT_URL = 'https://host.example';
process.env.MAEF_SECRET = 'x'.repeat(64);
process.env.MAEF_CARD_ENABLED = '1';
process.env.MAEF_WALLET_ENABLED = '1';
process.env.SITE_URL = 'https://store.example';

const { createCheckoutCardRouter } = require('../../routes/checkout-card');

const ORDER = {
  id: 41, user_id: 7, status: 'pending_payment', total: '112.95', shipping_cost: '22.95',
  payment_method: 'card', payment_status: 'pending', maef_session_token: null, maef_ref: null,
  order_number: 'PX000123', shipping_name: 'A B', shipping_email: 'a@b.co', shipping_address: '1 St',
  shipping_city: 'Elgin', shipping_state: 'IL', shipping_zip: '60120-1234', shipping_country: 'United States',
};

function stubPool(overrides) {
  const order = Object.assign({}, ORDER, overrides || {});
  const writes = [];
  return {
    writes,
    query: async (sql, params) => {
      if (/FROM orders WHERE id/.test(sql)) return { rows: [order] };
      if (/FROM order_items/.test(sql)) return { rows: [{ product_id: 3, variant_id: 9, unit_price: '90.00', quantity: 1 }] };
      writes.push({ sql, params });
      return { rows: [] };
    },
  };
}

async function callWalletStart(pool, body) {
  const app = express();
  app.use(express.json());
  app.use('/api/checkout/card', createCheckoutCardRouter({
    pool,
    requireAuth: (req, _res, next) => { req.user = { id: 7 }; next(); },
  }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/checkout/card/wallet-start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

function withMintedSession() {
  const realFetch = global.fetch;
  const seen = [];
  global.fetch = async (url, opts) => {
    // Only the payment host is stubbed; the test's own call to its local server is real.
    if (!String(url).includes('host.example')) return realFetch(url, opts);
    seen.push({ url: String(url), body: JSON.parse(opts.body) });
    return new Response(JSON.stringify({ session_token: 'TOK123' }), { status: 200 });
  };
  const restore = () => { global.fetch = realFetch; };
  return { seen, restore };
}

test('the return address and the token ride the fragment, never the query', async () => {
  const h = withMintedSession();
  try {
    const r = await callWalletStart(stubPool(), { order_id: 41 });
    assert.strictEqual(r.status, 200);
    const url = r.body.redirect;
    const [page, fragment] = url.split('#');

    assert.strictEqual(page, 'https://host.example/secure-wallet/', 'the wallet page must carry no query string');
    assert.ok(fragment, 'there must be a fragment');
    assert.ok(!page.includes('store.example'), 'this store must not appear before the #');
    assert.match(fragment, /(^|&)t=TOK123(&|$)/);
    assert.match(fragment, /(^|&)a=11295(&|$)/, 'the amount is whole cents of the order total');

    const back = decodeURIComponent(fragment.match(/(?:^|&)r=([^&]*)/)[1]);
    assert.match(back, /^https:\/\/store\.example\/order-confirmation\.html\?/);
    assert.match(back, /[?&]w=1(&|$)/, 'the return leg must ask the confirmation page to settle');
  } finally { h.restore(); }
});

test('the session sent upstream carries numbers and no order number', async () => {
  const h = withMintedSession();
  try {
    await callWalletStart(stubPool(), { order_id: 41 });
    const mint = h.seen.find((s) => s.url.includes('/embed-session'));
    assert.ok(mint, 'a session must be minted');
    const wire = JSON.stringify(mint.body);
    assert.ok(!wire.includes('PX000123'), 'the store order number must never go upstream');
    assert.ok(!wire.includes('store.example'), 'this store address must never go upstream');
    assert.deepStrictEqual(mint.body.cart, [{ g: 0, v: 0, q: 1, u: 9000 }]);
  } finally { h.restore(); }
});

test('an order that is already paid is never sent round again', async () => {
  const h = withMintedSession();
  try {
    const r = await callWalletStart(stubPool({ payment_status: 'paid' }), { order_id: 41 });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.error, 'already_paid');
  } finally { h.restore(); }
});

test('another buyer cannot start a wallet payment for this order', async () => {
  const h = withMintedSession();
  try {
    const r = await callWalletStart(stubPool({ user_id: 999 }), { order_id: 41 });
    assert.strictEqual(r.status, 404, 'ownership is the authorisation, and it must not confirm the order exists');
  } finally { h.restore(); }
});

test('the wallet stays dark while its own switch is off', async () => {
  const h = withMintedSession();
  process.env.MAEF_WALLET_ENABLED = '0';
  try {
    const r = await callWalletStart(stubPool(), { order_id: 41 });
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.body.error, 'wallet_unavailable');
  } finally { process.env.MAEF_WALLET_ENABLED = '1'; h.restore(); }
});
