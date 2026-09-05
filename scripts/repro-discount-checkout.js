#!/usr/bin/env node
'use strict';
/**
 * Reproduce checkout with and without a discount code, end to end, against a
 * LOCAL database only.
 *
 * This mounts the real orders router over the real SQL and the real promo
 * service. Only two things are faked: the signed-in user and the shipping
 * carrier, neither of which is involved in the discount path.
 *
 *   node scripts/repro-discount-checkout.js            # current schema
 *   node scripts/repro-discount-checkout.js --drift    # drop the column first
 *
 * --drift removes promo_code_redemptions.discount_amount so the run matches a
 * database that never received it, which is what production looked like.
 * Re-running `npm run migrate` puts it back.
 */
const assertLocal = require('path').join(__dirname, 'assert-local-db.js');
require(assertLocal);

const http = require('node:http');
const express = require('express');
const path = require('node:path');

const DRIFT = process.argv.includes('--drift');

// The carrier is not part of what we are testing. Answer with one fixed rate.
const easypostPath = require.resolve('../services/easypost');
require.cache[easypostPath] = {
  id: easypostPath, filename: easypostPath, loaded: true, exports: {
    getEasyPostClient: () => ({
      Shipment: { retrieve: async () => ({ rates: [{ id: 'rate_TEST', carrier: 'USPS', service: 'GroundAdvantage', rate: '5.70', delivery_days: 3 }] }) },
    }),
    classifyUspsService: () => 'USPS Ground Advantage',
    getEasyPostApiKey: () => 'test',
    getEasyPostWebhookSecret: () => 'test',
    resetEasyPostClientForTests: () => {},
  },
};

const pool = require('../db/connection');
const createOrdersRouter = require('../routes/orders');

const USER = { id: 'repro-user-1', email: 'repro@example.test' };

async function resetFixtures(client) {
  await client.query('DELETE FROM promo_code_redemptions WHERE user_id = $1', [USER.id]);
  await client.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)', [USER.id]);
  await client.query('DELETE FROM orders WHERE user_id = $1', [USER.id]);
  await client.query('DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)', [USER.id]);
  await client.query('DELETE FROM carts WHERE user_id = $1', [USER.id]);
  await client.query('DELETE FROM promo_codes WHERE code = $1', ['REPRO10']);

  await client.query(
    `INSERT INTO users (id, name, email, institution, provider, role)
     VALUES ($1,'Repro Buyer',$2,'Repro Lab','local','customer')
     ON CONFLICT (id) DO NOTHING`, [USER.id, USER.email]);

  const prod = await client.query(
    `INSERT INTO products (name, slug, description, price, stock_quantity, active)
     VALUES ('Repro Peptide','repro-peptide','fixture',75.00,500,true)
     ON CONFLICT (slug) DO UPDATE SET price = EXCLUDED.price, stock_quantity = 500, active = true
     RETURNING id, price`);
  const productId = prod.rows[0].id;

  const cart = await client.query('INSERT INTO carts (user_id) VALUES ($1) RETURNING id', [USER.id]);
  await client.query('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1,$2,1)', [cart.rows[0].id, productId]);

  await client.query(
    `INSERT INTO promo_codes (code, discount_type, discount_value, discount_percent, active, total_used)
     VALUES ('REPRO10','percentage',10.00,10.00,true,0)`);

  return { productId, price: Number(prod.rows[0].price) };
}

function post(port, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: '/api/orders', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => { let raw = ''; res.on('data', (d) => { raw += d; });
        res.on('end', () => { let parsed = null; try { parsed = JSON.parse(raw); } catch (_) {}
          resolve({ status: res.statusCode, body: parsed, raw }); }); });
    req.on('error', reject);
    req.end(payload);
  });
}

function show(label, request, response) {
  console.log('\n=== ' + label + ' ===');
  console.log('--> POST /api/orders');
  console.log(JSON.stringify(request, null, 2).split('\n').map((l) => '    ' + l).join('\n'));
  console.log('<-- HTTP ' + response.status);
  console.log(JSON.stringify(response.body, null, 2).split('\n').map((l) => '    ' + l).join('\n'));
}

(async () => {
  const capturedErrors = [];
  const realError = console.error;
  console.error = (...args) => { capturedErrors.push(args.map(String).join(' ')); };

  const client = await pool.connect();
  try {
    if (DRIFT) {
      await client.query('ALTER TABLE promo_code_redemptions DROP COLUMN IF EXISTS discount_amount');
      await client.query("DELETE FROM schema_migrations WHERE name = '034_promo_redemption_discount_amount.sql'");
      realError('[repro] dropped promo_code_redemptions.discount_amount to mirror the drifted production schema');
    }
    await resetFixtures(client);
  } finally { client.release(); }

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = USER; next(); });
  app.use('/api/orders', createOrdersRouter((req, res, next) => next()));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = server.address().port;

  const base = {
    shipping_name: 'Repro Buyer', shipping_email: USER.email,
    shipping_address: '11 Douglas Ave', shipping_city: 'Elgin', shipping_state: 'IL',
    shipping_zip: '60120', shipping_country: 'United States', shipping_phone: '5555550123',
    payment_method: 'card',
    easypost_shipment_id: 'shp_TEST', easypost_rate_id: 'rate_TEST',
  };

  const noPromo = Object.assign({}, base, { promo_code: null });
  const r1 = await post(port, noPromo);
  show('A. checkout WITHOUT a discount code', noPromo, r1);

  const c2 = await pool.connect();
  try { await resetFixtures(c2); } finally { c2.release(); }

  const withPromo = Object.assign({}, base, { promo_code: 'REPRO10' });
  const r2 = await post(port, withPromo);
  show('B. checkout WITH discount code REPRO10 (10% off)', withPromo, r2);

  console.error = realError;
  if (capturedErrors.length) {
    console.log('\n=== server-side errors logged during the run ===');
    capturedErrors.forEach((e) => console.log('    ' + e.split('\n')[0]));
  }

  console.log('\n=== side-by-side ===');
  console.log('  without code : HTTP ' + r1.status + '  total=' + (r1.body && r1.body.totals ? r1.body.totals.total : '-'));
  console.log('  with code    : HTTP ' + r2.status + '  total=' + (r2.body && r2.body.totals ? r2.body.totals.total : '-'));

  const rows = await pool.query(
    `SELECT o.id, o.promo_code, o.subtotal, o.subtotal_before_discount, o.discount_amount, o.shipping_cost, o.total,
            r.final_total AS redemption_total, r.subtotal_before_discount AS redemption_subtotal
       FROM orders o LEFT JOIN promo_code_redemptions r ON r.order_id = o.id
      WHERE o.user_id = $1 ORDER BY o.id`, [USER.id]);
  console.log('\n=== orders actually written ===');
  console.table(rows.rows);

  server.close();
  await pool.end();
  process.exit(r2.status === 201 ? 0 : 1);
})().catch((e) => { console.error('repro failed:', e); process.exit(2); });
