'use strict';
/**
 * Site-wide sales (Admin Console -> Site-wide Sale).
 *
 * A sale takes a percentage off every order automatically -- no code -- and
 * drives the announcement bar. These cover the rules that decide when a sale
 * is live, what it takes off, what the admin form accepts, and that checkout
 * is wired to it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');

const sale = require('../../services/sitewide-sale');
const { buildSalePayload } = require('../../routes/admin-sales');
const { computeCheckoutTotals, assertTotalsConsistent } = require('../../routes/orders');

const NOW = new Date('2026-10-08T12:00:00Z');
const base = { id: 1, name: 'Fall Sale', discount_percent: '25.00', active: true, total_used: 0 };

// ── when a sale is live ──────────────────────────────────────────────────────

test('an active sale with no dates and no limit is live', () => {
  assert.equal(sale.saleStatus(base, NOW), 'active');
  assert.equal(sale.isSaleLive(base, NOW), true);
});

test('a sale that is turned off is not live', () => {
  assert.equal(sale.saleStatus({ ...base, active: false }, NOW), 'disabled');
});

test('a sale is not live before its start date or after its end date', () => {
  assert.equal(sale.saleStatus({ ...base, starts_at: '2026-10-09T00:00:00Z' }, NOW), 'scheduled');
  assert.equal(sale.saleStatus({ ...base, expires_at: '2026-10-07T00:00:00Z' }, NOW), 'expired');
  assert.equal(sale.saleStatus({ ...base, starts_at: '2026-10-01T00:00:00Z', expires_at: '2026-11-01T00:00:00Z' }, NOW), 'active');
});

test('a sale stops being live once its usage limit is reached', () => {
  assert.equal(sale.saleStatus({ ...base, usage_limit: 100, total_used: 99 }, NOW), 'active');
  assert.equal(sale.saleStatus({ ...base, usage_limit: 100, total_used: 100 }, NOW), 'usage_limit_reached');
});

// ── what it takes off ────────────────────────────────────────────────────────

test('the discount is the percentage of the subtotal, rounded to cents', () => {
  assert.equal(sale.computeSaleDiscount(base, 100), 25);
  assert.equal(sale.computeSaleDiscount(base, 140.97), 35.24);
  assert.equal(sale.computeSaleDiscount(base, 19.99), 5);
});

test('the discount is never negative and never more than the subtotal', () => {
  assert.equal(sale.computeSaleDiscount(base, 0), 0);
  assert.equal(sale.computeSaleDiscount({ ...base, discount_percent: 100 }, 80), 80);
  assert.equal(sale.computeSaleDiscount({ ...base, discount_percent: 0 }, 80), 0);
});

test('a sale order adds up: goods discounted, shipping untouched', () => {
  const subtotal = 140.97;
  const totals = computeCheckoutTotals({
    subtotalBeforeDiscount: subtotal,
    discountAmount: sale.computeSaleDiscount(base, subtotal),
    carrierRate: 5.7,
  });
  assert.equal(totals.subtotalAfterDiscount, 105.73);
  assert.equal(totals.total, 111.43);
  assert.deepEqual(assertTotalsConsistent(totals), []);
});

// ── what shoppers are told ───────────────────────────────────────────────────

test('the automatic announcement names the sale, the percentage and the end date', () => {
  const text = sale.defaultBannerText({ ...base, expires_at: '2026-11-02T04:59:00Z' });
  assert.match(text, /Fall Sale/);
  assert.match(text, /25% off everything/);
  assert.match(text, /Ends November 1\./);
});

test('the public sale carries custom text when set and no admin-only fields', () => {
  const pub = sale.toPublicSale({ ...base, banner_text: '  FALL SALE - 25% OFF  ', show_banner: true,
    total_revenue_generated: '999.00', created_by: 'admin-id' });
  assert.equal(pub.banner_text, 'FALL SALE - 25% OFF');
  assert.equal(pub.percent, 25);
  assert.deepEqual(Object.keys(pub).sort(),
    ['banner_scroll', 'banner_text', 'expires_at', 'id', 'name', 'percent', 'show_banner']);
  assert.equal(sale.toPublicSale(null), null);
});

// ── what the admin form accepts ──────────────────────────────────────────────

test('a new sale needs a name and a percentage between 0 and 100', () => {
  assert.match(buildSalePayload({ discount_percent: 25 }, false).error, /name is required/i);
  assert.match(buildSalePayload({ name: 'X', discount_percent: 0 }, false).error, /greater than 0/i);
  assert.match(buildSalePayload({ name: 'X', discount_percent: 101 }, false).error, /cannot exceed 100/i);
  assert.match(buildSalePayload({ name: 'X', discount_percent: 10, usage_limit: 1.5 }, false).error, /whole number/i);
  assert.match(buildSalePayload({ name: 'X', discount_percent: 10, expires_at: 'nope' }, false).error, /End date is invalid/i);
});

test('a valid new sale defaults to on, with the bar showing and no limits', () => {
  const { payload, error } = buildSalePayload({ name: ' Fall Sale ', discount_percent: '25' }, false);
  assert.equal(error, undefined);
  assert.deepEqual(payload, {
    name: 'Fall Sale', discount_percent: 25, banner_text: null, show_banner: true,
    banner_scroll: false, starts_at: null, expires_at: null, usage_limit: null, active: true,
  });
});

test('an update only touches the fields that were sent', () => {
  assert.deepEqual(buildSalePayload({ active: false }, true).payload, { active: false });
});

// ── wiring ───────────────────────────────────────────────────────────────────

test('checkout applies the live sale and refuses codes on top of it', () => {
  const orders = read('routes', 'orders.js');
  assert.match(orders, /sitewideSale\.getLiveSale\(client\)/);
  assert.match(orders, /sitewideSale\.computeSaleDiscount\(liveSale, subtotalBeforeDiscount\)/);
  assert.match(orders, /code: "sale_active"/);
  assert.match(orders, /code: "sale_changed"/);
});

test('the usage limit is enforced in the same statement that counts the use', () => {
  const orders = read('routes', 'orders.js');
  const update = orders.match(/UPDATE sitewide_sales[\s\S]*?RETURNING/);
  assert.ok(update, 'sale usage update not found');
  assert.match(update[0], /total_used = total_used \+ 1/);
  assert.match(update[0], /usage_limit IS NULL OR total_used < usage_limit/);
});

test('the migration is additive', () => {
  const sql = read('db', 'migrations', '035_sitewide_sales.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS sitewide_sales/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS sitewide_sale_id/);
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN)\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
});

test('every storefront page loads the announcement bar, the admin console does not', () => {
  const pages = fs.readdirSync(REPO).filter((f) => f.endsWith('.html'));
  for (const page of pages) {
    const html = read(page);
    if (page === 'admin.html') {
      assert.doesNotMatch(html, /pepx-sale\.js/);
    } else {
      assert.match(html, /<script src="\/pepx-sale\.js"><\/script>/, page + ' is missing the sale script');
    }
  }
  assert.match(read('services', 'public-page.js'), /pepx-sale\.js/);
});

test('the sale endpoint is public and registered ahead of the API 404', () => {
  const server = read('server.js');
  const endpoint = server.indexOf("app.get('/api/sale'");
  assert.ok(endpoint > 0, 'GET /api/sale is not registered');
  assert.ok(endpoint < server.indexOf("app.use('/api/*'"), 'GET /api/sale sits behind the API 404');
});
