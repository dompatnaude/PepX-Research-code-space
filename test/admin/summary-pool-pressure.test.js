'use strict';

// Regression coverage for admin-dashboard pool pressure.
//
// GET /api/admin/summary builds the whole dashboard from many independent
// queries. node-postgres checks out a SEPARATE pool client for every query
// that is in flight at the same time, so an unbounded `Promise.all` over those
// queries demanded more clients than the pool is allowed to hand out (9 needed
// vs. `max: 8` in db/connection.js). One admin refresh then held every client
// in the pool, and unrelated requests -- including the express-session store
// lookup that essentially every page load performs -- queued behind it until
// `connectionTimeoutMillis` elapsed and they failed with the site-wide
// "An unexpected error occurred. Please try again." response.
//
// These tests pin the invariant: one admin summary request must never demand
// more pool clients than the pool can supply, with headroom left for the rest
// of the site.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const createAdminRouter = require('../../routes/admin');

const REPO = path.join(__dirname, '..', '..');

// The pool ceiling this route has to live under, read from the real config so
// the test follows the source of truth rather than a copy of it.
function configuredPoolMax() {
  const source = fs.readFileSync(path.join(REPO, 'db', 'connection.js'), 'utf8');
  const match = source.match(/max:\s*(\d+)/);
  assert.ok(match, 'could not read `max` from db/connection.js');
  return Number(match[1]);
}

// A stub pool that records how many queries are in flight simultaneously --
// which is exactly how many clients the real pool would have checked out.
function trackingPool() {
  const stats = { inFlight: 0, peak: 0, total: 0 };

  return {
    stats,
    query() {
      stats.inFlight += 1;
      stats.total += 1;
      if (stats.inFlight > stats.peak) stats.peak = stats.inFlight;

      return new Promise((resolve) => {
        // Hold the client briefly so overlapping queries actually overlap.
        setTimeout(() => {
          stats.inFlight -= 1;
          resolve({
            rows: [{
              role: 'admin',
              status: 'paid',
              count: 0,
              order_count: 0,
              sales_total: 0,
              avg_order_value: 0,
              redemptions_30d: 0,
              discount_total_30d: 0
            }]
          });
        }, 15);
      });
    }
  };
}

function getSummary(pool) {
  const app = express();
  app.use('/api/admin', createAdminRouter((req, res, next) => {
    req.user = { id: 'admin-1' };
    next();
  }, { pool }));

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      http.get({ port: server.address().port, path: '/api/admin/summary' }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => server.close(() => resolve({ status: res.statusCode, body })));
      }).on('error', (err) => server.close(() => reject(err)));
    });
  });
}

test('one admin summary request stays within the database pool', async () => {
  const pool = trackingPool();
  const res = await getSummary(pool);

  assert.equal(res.status, 200);
  assert.ok(pool.stats.total > 1, 'expected the summary to issue several queries');
  assert.ok(
    pool.stats.peak < configuredPoolMax(),
    'admin summary demanded ' + pool.stats.peak + ' simultaneous pool clients but the pool ' +
    'allows only ' + configuredPoolMax() + '; one admin refresh can starve the whole site'
  );
});

test('the admin summary fan-out leaves headroom for the rest of the site', async () => {
  const pool = trackingPool();
  await getSummary(pool);

  // Half the pool is the ceiling: the session store needs a client on nearly
  // every request, so the dashboard must not monopolise the pool even while
  // staying nominally under its limit.
  const headroomCeiling = Math.floor(configuredPoolMax() / 2);
  assert.ok(
    pool.stats.peak <= headroomCeiling,
    'admin summary peaked at ' + pool.stats.peak + ' simultaneous clients; expected at most ' +
    headroomCeiling + ' so unrelated requests can still acquire a connection'
  );
});

test('bounding the fan-out still returns the full dashboard payload', async () => {
  const res = await getSummary(trackingPool());
  const payload = JSON.parse(res.body);

  for (const key of ['counts', 'sales', 'discounts', 'recent_orders', 'recent_customers',
    'low_stock_variants', 'out_of_stock_variants']) {
    assert.ok(Object.prototype.hasOwnProperty.call(payload, key), 'missing "' + key + '" in summary payload');
  }
});
