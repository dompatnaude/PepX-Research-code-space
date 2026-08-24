'use strict';

// Regression coverage for the "Paid orders" dashboard card -- both the count
// and the drill-down behind it.
//
// Payment state and fulfillment state are separate columns. Confirming a
// payment sets payment_status='paid' + paid_at and moves `status` straight to
// 'processing'; nothing ever parks on status='paid'. Two places got that wrong:
//
//   * the dashboard count read the `GROUP BY status` bucket named 'paid', so
//     the card sat at 0 no matter how many payments had been received;
//   * the drill-down used view=paid => status IN ('paid','processing',
//     'shipped','completed'), a second, status-only definition that ignored
//     payment_status entirely and disagreed with the count.
//
// Both now use PAID_ORDER_SQL, the single admin-wide definition of a paid order
// that customer lifetime spend already used. These tests pin that they stay
// tied together and keep the same semantics.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const createAdminRouter = require('../../routes/admin');
const { orderCountsTowardSpend, PAID_ORDER_SQL } = require('../../services/admin-customers');

const REPO = path.join(__dirname, '..', '..');

// Deliberately contains NO order with status 'paid' -- that is the whole point.
// Every payment-received order has already advanced past it.
const ORDERS = [
  { id: 1, order_number: 'PX1', label: 'zelle confirmed, awaiting fulfillment', status: 'processing', payment_status: 'paid', paid: true },
  { id: 2, order_number: 'PX2', label: 'paid and shipped', status: 'shipped', payment_status: 'paid', paid: true },
  { id: 3, order_number: 'PX3', label: 'paid and delivered', status: 'delivered', payment_status: 'paid', paid: true },
  { id: 4, order_number: 'PX4', label: 'legacy row, no payment_status, past pending', status: 'completed', payment_status: null, paid: true },
  { id: 5, order_number: 'PX5', label: 'awaiting payment (legacy null)', status: 'pending_payment', payment_status: null, paid: false },
  { id: 6, order_number: 'PX6', label: 'awaiting payment (explicit)', status: 'pending_payment', payment_status: 'awaiting_payment', paid: false },
  { id: 7, order_number: 'PX7', label: 'cancelled after payment', status: 'cancelled', payment_status: 'paid', paid: false },
  { id: 8, order_number: 'PX8', label: 'refunded after payment', status: 'refunded', payment_status: 'paid', paid: false }
];

const EXPECTED_PAID_IDS = ORDERS.filter((o) => o.paid).map((o) => o.id);

// Stands in for Postgres. Any query carrying the PAID_ORDER_SQL predicate is
// resolved through orderCountsTowardSpend, the documented JS mirror of that
// predicate -- so the count and the drill-down are evaluated by the same rule
// the database would apply, and cannot silently diverge here.
function fixturePool() {
  const seen = { paidPredicateQueries: 0 };

  return {
    seen,
    query(sql) {
      const text = String(sql);
      const usesPaidPredicate = text.includes(PAID_ORDER_SQL);
      if (usesPaidPredicate) seen.paidPredicateQueries += 1;

      if (/SELECT role FROM users/i.test(text)) {
        return Promise.resolve({ rows: [{ role: 'admin' }] });
      }

      if (usesPaidPredicate) {
        const matching = ORDERS.filter(orderCountsTowardSpend);
        if (/total_count/i.test(text)) {
          return Promise.resolve({ rows: [{ total_count: matching.length }] });
        }
        if (/COUNT\(\*\)/i.test(text)) {
          return Promise.resolve({ rows: [{ count: matching.length }] });
        }
        return Promise.resolve({ rows: matching });
      }

      if (/GROUP BY status/i.test(text)) {
        const buckets = new Map();
        for (const order of ORDERS) {
          buckets.set(order.status, (buckets.get(order.status) || 0) + 1);
        }
        return Promise.resolve({
          rows: Array.from(buckets, ([status, count]) => ({ status, count }))
        });
      }

      return Promise.resolve({
        rows: [{
          count: 0,
          total_count: 0,
          order_count: 0,
          sales_total: 0,
          avg_order_value: 0,
          redemptions_30d: 0,
          discount_total_30d: 0
        }]
      });
    }
  };
}

function request(pool, urlPath) {
  const app = express();
  app.use('/api/admin', createAdminRouter((req, res, next) => {
    req.user = { id: 'admin-1' };
    next();
  }, { pool }));

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      http.get({ port: server.address().port, path: urlPath }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => server.close(() => resolve({ status: res.statusCode, body })));
      }).on('error', (err) => server.close(() => reject(err)));
    });
  });
}

const readSource = (...parts) => fs.readFileSync(path.join(REPO, ...parts), 'utf8');

test('fixture contains no status=paid order, which is the bug being guarded', () => {
  assert.equal(ORDERS.filter((o) => o.status === 'paid').length, 0);
});

test('a confirmed payment that moved to processing is counted on the dashboard', async () => {
  const res = await request(fixturePool(), '/api/admin/summary');
  assert.equal(res.status, 200);

  const counts = JSON.parse(res.body).counts;
  assert.equal(counts.paid, EXPECTED_PAID_IDS.length);
  assert.notEqual(counts.paid, 0, 'Paid orders regressed to zero');
});

test('the drill-down returns the confirmed payment that moved to processing', async () => {
  const res = await request(fixturePool(), '/api/admin/orders?view=paid');
  assert.equal(res.status, 200);

  const ids = JSON.parse(res.body).orders.map((o) => o.id);
  assert.ok(ids.includes(1), 'a zelle-confirmed order sitting in processing must appear');
});

test('the drill-down includes paid orders that already shipped or delivered', async () => {
  const res = await request(fixturePool(), '/api/admin/orders?view=paid');
  const ids = JSON.parse(res.body).orders.map((o) => o.id);

  assert.ok(ids.includes(2), 'paid + shipped must appear');
  assert.ok(ids.includes(3), 'paid + delivered must appear');
  assert.ok(ids.includes(4), 'valid legacy paid order must appear');
});

test('the drill-down excludes pending, cancelled and refunded orders', async () => {
  const res = await request(fixturePool(), '/api/admin/orders?view=paid');
  const ids = JSON.parse(res.body).orders.map((o) => o.id);

  for (const id of [5, 6, 7, 8]) {
    const order = ORDERS.find((o) => o.id === id);
    assert.ok(!ids.includes(id), order.label + ' must not appear in the paid drill-down');
  }
});

test('the count and the drill-down return the same set of orders', async () => {
  const summary = JSON.parse((await request(fixturePool(), '/api/admin/summary')).body);
  const list = JSON.parse((await request(fixturePool(), '/api/admin/orders?view=paid')).body);

  const ids = list.orders.map((o) => o.id).sort();
  assert.deepEqual(ids, EXPECTED_PAID_IDS.slice().sort());
  assert.equal(list.pagination.total_count, summary.counts.paid,
    'the drill-down total must equal the dashboard count');
  assert.equal(ids.length, summary.counts.paid);
});

test('both the count and the drill-down are driven by PAID_ORDER_SQL', async () => {
  const summaryPool = fixturePool();
  await request(summaryPool, '/api/admin/summary');
  assert.ok(summaryPool.seen.paidPredicateQueries >= 1,
    'the dashboard count must query with the canonical paid predicate');

  const listPool = fixturePool();
  await request(listPool, '/api/admin/orders?view=paid');
  assert.ok(listPool.seen.paidPredicateQueries >= 1,
    'the drill-down must query with the canonical paid predicate');
});

test('no competing definition of a paid order remains in the admin routes', () => {
  const source = readSource('routes', 'admin.js');

  assert.doesNotMatch(
    source,
    /paid:\s*Number\(statusCounts\.paid/,
    'Paid orders must not be read from the GROUP BY status bucket'
  );
  assert.doesNotMatch(
    source,
    /o\.status IN \('paid','processing','shipped','completed'\)/,
    'the status-only paid view must not come back; it ignores payment_status'
  );
});

test('the dashboard card asks the server for the paid view, not a status filter', () => {
  const source = readSource('admin.js');

  assert.match(
    source,
    /action === 'paid'\)\s*state\.view = 'paid';/,
    'the Paid orders card must select the paid view'
  );
  assert.match(
    source,
    /if \(state\.view\) qs\.push\('view=' \+ encodeURIComponent\(state\.view\)\);/,
    'loadOrders must forward the selected view to the server'
  );
});

test('paid orders past fulfillment count, unpaid and reversed orders do not', () => {
  for (const status of ['processing', 'shipped', 'delivered', 'completed']) {
    assert.equal(orderCountsTowardSpend({ status, payment_status: 'paid' }), true,
      'a paid order with status "' + status + '" should count as paid');
  }
  assert.equal(orderCountsTowardSpend({ status: 'pending_payment', payment_status: null }), false);
  assert.equal(orderCountsTowardSpend({ status: 'pending_payment', payment_status: 'awaiting_payment' }), false);
  assert.equal(orderCountsTowardSpend({ status: 'cancelled', payment_status: 'paid' }), false);
  assert.equal(orderCountsTowardSpend({ status: 'refunded', payment_status: 'paid' }), false);
});
