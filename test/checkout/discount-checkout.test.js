'use strict';
/**
 * Checkout with a discount code.
 *
 * The bug these cover: promo_code_redemptions on the production database was
 * created from an older schema variant and never received the discount_amount
 * column that 015 declares. routes/orders.js inserts that column on every
 * redemption, so an order placed WITH a code died with
 *   42703 column "discount_amount" of relation "promo_code_redemptions"
 *          does not exist
 * and the whole order transaction rolled back. Orders WITHOUT a code never
 * reach that INSERT, so only discounted checkouts were affected -- and no
 * discounted order had ever been written.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const readSource = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');

const ordersSource = readSource('routes', 'orders.js');
const migrationDir = path.join(REPO, 'db', 'migrations');
const driftMigration = fs
  .readdirSync(migrationDir)
  .find((f) => /promo_redemption_discount_amount\.sql$/.test(f));

// ── the schema the code writes to ────────────────────────────────────────────

test('a migration adds promo_code_redemptions.discount_amount', () => {
  assert.ok(driftMigration, 'no migration adds the missing redemption column');
  const sql = fs.readFileSync(path.join(migrationDir, driftMigration), 'utf8');
  assert.match(sql, /ALTER TABLE promo_code_redemptions\s+ADD COLUMN IF NOT EXISTS discount_amount/i);
});

test('that migration is additive and safe to run more than once', () => {
  const sql = fs.readFileSync(path.join(migrationDir, driftMigration), 'utf8');
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN)\b/i, 'migration drops something');
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i, 'migration truncates');
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i, 'migration deletes rows');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS/i);
  // every bare CREATE INDEX is guarded, so a second run cannot fail
  const unguarded = sql
    .split('\n')
    .filter((l) => /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s/i.test(l) && !/IF NOT EXISTS/i.test(l));
  for (const line of unguarded) {
    assert.match(sql, /IF NOT EXISTS \(\s*\n?\s*SELECT 1 FROM pg_indexes/i,
      'unguarded index creation: ' + line.trim());
  }
});

test('every column the redemption INSERT names is one the migrations create', () => {
  const insert = ordersSource.match(/INSERT INTO promo_code_redemptions \(([\s\S]*?)\)/);
  assert.ok(insert, 'redemption insert not found');
  const columns = insert[1].split(',').map((c) => c.trim()).filter(Boolean);
  const allSql = fs.readdirSync(migrationDir)
    .map((f) => fs.readFileSync(path.join(migrationDir, f), 'utf8')).join('\n');
  for (const column of columns) {
    assert.match(allSql, new RegExp(column + '\\b'),
      'redemption column "' + column + '" is never created by any migration');
  }
  assert.ok(columns.includes('discount_amount'), 'discount_amount is no longer written');
});

// ── totals are decided on the server ─────────────────────────────────────────

const { computeCheckoutTotals, assertTotalsConsistent } = require('../../routes/orders');

test('no discount: total is subtotal plus shipping', () => {
  const t = computeCheckoutTotals({ subtotalBeforeDiscount: 75, discountAmount: 0, carrierRate: 5.7 });
  assert.equal(t.discountAmount, 0);
  assert.equal(t.subtotalAfterDiscount, 75);
  assert.equal(t.total, 80.7);
  assert.deepEqual(assertTotalsConsistent(t), []);
});

test('a percentage discount comes off the goods, not the shipping', () => {
  const t = computeCheckoutTotals({ subtotalBeforeDiscount: 75, discountAmount: 7.5, carrierRate: 5.7 });
  assert.equal(t.discountAmount, 7.5);
  assert.equal(t.subtotalAfterDiscount, 67.5);
  assert.equal(t.shippingCost, 5.7, 'shipping was discounted');
  assert.equal(t.total, 73.2);
  assert.deepEqual(assertTotalsConsistent(t), []);
});

test('a fixed discount behaves the same way', () => {
  const t = computeCheckoutTotals({ subtotalBeforeDiscount: 49.99, discountAmount: 10, carrierRate: 5.7 });
  assert.equal(t.subtotalAfterDiscount, 39.99);
  assert.equal(t.total, 45.69);
  assert.deepEqual(assertTotalsConsistent(t), []);
});

test('a discount larger than the cart cannot make the total negative', () => {
  const t = computeCheckoutTotals({ subtotalBeforeDiscount: 20, discountAmount: 500, carrierRate: 5.7 });
  assert.equal(t.discountAmount, 20, 'discount was not clamped to the subtotal');
  assert.equal(t.subtotalAfterDiscount, 0);
  assert.equal(t.total, 5.7);
  assert.ok(t.total >= 0);
  assert.deepEqual(assertTotalsConsistent(t), []);
});

test('a negative discount is refused rather than added on', () => {
  const t = computeCheckoutTotals({ subtotalBeforeDiscount: 20, discountAmount: -5, carrierRate: 0 });
  assert.equal(t.discountAmount, 0);
  assert.equal(t.total, 20);
});

test('thirds of a cent land on a real money amount', () => {
  // 10% of 33.33 is 3.333; the customer is charged whole cents either way.
  const t = computeCheckoutTotals({ subtotalBeforeDiscount: 33.33, discountAmount: 3.333, carrierRate: 4.44 });
  assert.equal(t.discountAmount, 3.33);
  assert.equal(t.subtotalAfterDiscount, 30);
  assert.equal(t.total, 34.44);
  assert.equal(Math.round(t.total * 100), t.total * 100, 'total is not a whole number of cents');
  assert.deepEqual(assertTotalsConsistent(t), []);
});

test('free shipping is judged on what is actually paid for goods', () => {
  const above = computeCheckoutTotals({
    subtotalBeforeDiscount: 200, discountAmount: 20, carrierRate: 9.9,
    freeShippingEligible: true, freeShippingThreshold: 150 });
  assert.equal(above.shippingCost, 0);
  const below = computeCheckoutTotals({
    subtotalBeforeDiscount: 160, discountAmount: 20, carrierRate: 9.9,
    freeShippingEligible: true, freeShippingThreshold: 150 });
  assert.equal(below.shippingCost, 9.9, 'a discount below the threshold still got free shipping');
});

test('inconsistent totals are reported, not written', () => {
  assert.deepEqual(assertTotalsConsistent({
    subtotalBeforeDiscount: 75, discountAmount: 7.5, subtotalAfterDiscount: 67.5,
    shippingCost: 5.7, total: 73.2 }), []);
  const problems = assertTotalsConsistent({
    subtotalBeforeDiscount: 75, discountAmount: 7.5, subtotalAfterDiscount: 67.5,
    shippingCost: 5.7, total: 80.7 });
  assert.ok(problems.length, 'a total that ignores the discount was accepted');
});

test('order creation refuses to commit when the totals do not add up', () => {
  assert.match(ordersSource, /assertTotalsConsistent\(totals\)/);
  assert.match(ordersSource, /totalsProblems\.length[\s\S]{0,120}ROLLBACK/);
});

test('the browser cannot name a price: no submitted total is ever read', () => {
  for (const field of ['body.total', 'body.subtotal', 'body.discount_amount', 'body.shipping_cost', 'body.amount']) {
    assert.ok(!ordersSource.includes(field), 'order creation reads ' + field + ' from the request');
  }
  assert.match(ordersSource, /const submittedPromoCode = String\(body\.promo_code/,
    'the discount code should be the only money-related field taken from the browser');
});

// ── which codes are accepted ─────────────────────────────────────────────────

const { evaluatePromoRow } = require('../../services/promo-service');
const NOW = new Date('2026-09-05T00:00:00Z');
const basePromo = { active: true, discount_type: 'percentage', discount_value: 10, total_used: 0 };

test('a valid percentage code applies', () => {
  const r = evaluatePromoRow(Object.assign({}, basePromo, { code: 'SAVE10' }), 75, NOW);
  assert.equal(r.valid, true);
  assert.equal(r.discount, 7.5);
  assert.equal(r.subtotal_after_discount, 67.5);
});

test('a valid fixed code applies', () => {
  const r = evaluatePromoRow(
    Object.assign({}, basePromo, { code: 'TEN', discount_type: 'fixed', discount_value: 10 }), 75, NOW);
  assert.equal(r.valid, true);
  assert.equal(r.discount, 10);
});

test('an unknown code is rejected', () => {
  assert.deepEqual(evaluatePromoRow(null, 75, NOW), { valid: false, reason: 'invalid_code' });
});

test('an inactive code is rejected', () => {
  const r = evaluatePromoRow(Object.assign({}, basePromo, { active: false }), 75, NOW);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'inactive');
});

test('an expired code is rejected', () => {
  const r = evaluatePromoRow(
    Object.assign({}, basePromo, { expires_at: '2026-08-01T00:00:00Z' }), 75, NOW);
  assert.equal(r.reason, 'expired');
});

test('a code whose window has not opened is rejected', () => {
  const r = evaluatePromoRow(
    Object.assign({}, basePromo, { starts_at: '2026-10-01T00:00:00Z' }), 75, NOW);
  assert.equal(r.reason, 'not_started');
});

test('a code at its usage limit is rejected', () => {
  const r = evaluatePromoRow(
    Object.assign({}, basePromo, { usage_limit: 5, total_used: 5 }), 75, NOW);
  assert.equal(r.reason, 'usage_limit');
});

test('a cart under the minimum is rejected, and says what the minimum is', () => {
  const r = evaluatePromoRow(Object.assign({}, basePromo, { minimum_order: 100 }), 75, NOW);
  assert.equal(r.reason, 'minimum_order');
  assert.equal(r.context.minimum_order, 100);
});

test('the minimum is measured before the discount, so a code cannot disqualify itself', () => {
  const r = evaluatePromoRow(Object.assign({}, basePromo, { minimum_order: 75 }), 75, NOW);
  assert.equal(r.valid, true, 'a cart exactly on the minimum was refused');
});

test('a fixed discount larger than the cart is capped at the cart', () => {
  const r = evaluatePromoRow(
    Object.assign({}, basePromo, { discount_type: 'fixed', discount_value: 500 }), 20, NOW);
  assert.equal(r.discount, 20);
  assert.equal(r.subtotal_after_discount, 0);
});

// ── the money that is charged is the money that was stored ───────────────────

test('the payment session is minted from the stored order total, not a client figure', () => {
  const card = readSource('routes', 'checkout-card.js');
  assert.match(card, /total:\s*money\(order\.total\)/, 'the session is not minted from order.total');
  assert.match(card, /Math\.abs\(st\.amount - money\(order\.total\)\)/,
    'the captured amount is not checked against the order total');
  assert.ok(!/req\.body\.(total|amount)/.test(card), 'the card rail reads an amount from the browser');
});

test('a discounted order stores the discount, both codes and both subtotals', () => {
  const insert = ordersSource.match(/INSERT INTO orders \(([\s\S]*?)\)\s*VALUES/);
  assert.ok(insert, 'order insert not found');
  const columns = insert[1];
  for (const column of ['promo_code', 'promo_code_id', 'discount_amount', 'subtotal_before_discount', 'subtotal', 'total']) {
    assert.match(columns, new RegExp('\\b' + column + '\\b'), 'orders.' + column + ' is not written');
  }
  assert.match(ordersSource, /UPDATE promo_codes[\s\S]{0,220}total_used = total_used \+ 1/,
    'the redemption is not counted against the code');
});
