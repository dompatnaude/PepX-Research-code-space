'use strict';

// The admin Discount Codes "Delete" button used to archive rather than delete:
// any code with a redemption or an order attached was flipped to
// active = false + archived_at, and stayed in the admin list forever.
//
// It is now a real DELETE. promo_code_redemptions.promo_code_id was
// ON DELETE RESTRICT, which is what blocked it; migration 031 makes it
// ON DELETE SET NULL and adds a promo_code text snapshot to the redemption
// row, so the audit trail survives. Orders already stored promo_code,
// discount_amount and subtotal_before_discount as their own snapshot.
//
// Archive and Disable/Enable stay exactly as they were -- they are the
// reversible options. These tests pin the delete, the failure modes, and the
// integrity of the order and redemption history behind it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const createAdminPromosRouter = require('../../routes/admin-promos');

const REPO = path.join(__dirname, '..', '..');
const readSource = (...parts) => fs.readFileSync(path.join(REPO, ...parts), 'utf8');

function fixtureDb(overrides) {
  const opts = overrides || {};

  const db = {
    statements: [],
    promos: [
      { id: 3, code: 'SAVE10', active: true, archived_at: null },
      { id: 4, code: 'NEVERUSED', active: true, archived_at: null }
    ],
    redemptions: [
      { id: 1, promo_code_id: 3, promo_code: null, order_id: 100, discount_amount: '5.00' }
    ],
    orders: [
      { id: 100, promo_code_id: 3, promo_code: null, discount_amount: '5.00', subtotal_before_discount: '49.99', total: '44.99' },
      { id: 101, promo_code_id: null, promo_code: 'LEGACY', discount_amount: '1.00', subtotal_before_discount: '10.00', total: '9.00' }
    ]
  };

  function run(sql, params) {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    db.statements.push(text);
    const p = params || [];

    if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(text)) return { rows: [] };

    if (/SELECT role FROM users/i.test(text)) {
      return { rows: [{ role: 'admin' }] };
    }

    if (/SELECT id, code FROM promo_codes WHERE id/i.test(text)) {
      const row = db.promos.find((x) => x.id === p[0]);
      return { rows: row ? [{ id: row.id, code: row.code }] : [] };
    }

    if (/UPDATE promo_code_redemptions SET promo_code/i.test(text)) {
      for (const r of db.redemptions) {
        if (r.promo_code_id === p[0] && r.promo_code == null) r.promo_code = p[1];
      }
      return { rows: [] };
    }

    if (/UPDATE orders SET promo_code/i.test(text)) {
      for (const o of db.orders) {
        if (o.promo_code_id === p[0] && (o.promo_code == null || o.promo_code.trim() === '')) {
          o.promo_code = p[1];
        }
      }
      return { rows: [] };
    }

    if (/COUNT\(\*\)::int AS count FROM promo_code_redemptions WHERE promo_code_id/i.test(text)) {
      return { rows: [{ count: db.redemptions.filter((x) => x.promo_code_id === p[0]).length }] };
    }

    if (/COUNT\(\*\)::int AS count FROM orders WHERE promo_code_id/i.test(text)) {
      return { rows: [{ count: db.orders.filter((x) => x.promo_code_id === p[0]).length }] };
    }

    if (/^DELETE FROM promo_codes WHERE id/i.test(text)) {
      if (opts.deleteError) throw opts.deleteError;
      const index = db.promos.findIndex((x) => x.id === p[0]);
      if (index === -1) return { rows: [] };
      const [removed] = db.promos.splice(index, 1);
      // Referential actions installed by migration 031.
      for (const r of db.redemptions) {
        if (r.promo_code_id === removed.id) r.promo_code_id = null;
      }
      for (const o of db.orders) {
        if (o.promo_code_id === removed.id) o.promo_code_id = null;
      }
      return { rows: [{ id: removed.id, code: removed.code }] };
    }

    return { rows: [] };
  }

  db.query = async (sql, params) => run(sql, params);
  db.connect = async () => ({
    query: async (sql, params) => run(sql, params),
    release() {}
  });

  return db;
}

function request(db, method, urlPath) {
  const app = express();
  app.use('/api/admin', createAdminPromosRouter((req, res, next) => {
    req.user = { id: 'admin-1' };
    next();
  }, { pool: db }));

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const req = http.request(
        { port: server.address().port, path: urlPath, method },
        (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => server.close(() => resolve({ status: res.statusCode, body })));
        }
      );
      req.on('error', (err) => server.close(() => reject(err)));
      req.end();
    });
  });
}

// --- successful deletion -----------------------------------------------------

test('deleting a discount code removes the row from the database', async () => {
  const db = fixtureDb();
  const res = await request(db, 'DELETE', '/api/admin/promos/3');

  assert.equal(res.status, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.deleted, true);
  assert.equal(payload.mode, 'hard_delete');
  assert.equal(payload.promo.code, 'SAVE10');
  assert.equal(db.promos.find((x) => x.id === 3), undefined,
    'the promo row must be gone, not archived');
});

test('a used code is deleted, not archived', async () => {
  const db = fixtureDb();
  await request(db, 'DELETE', '/api/admin/promos/3');

  assert.ok(db.statements.some((s) => /^DELETE FROM promo_codes/i.test(s)));
  assert.ok(!db.statements.some((s) => /UPDATE promo_codes\s+SET active = false/i.test(s)),
    'the delete path must not fall back to archiving');
  assert.ok(!db.statements.some((s) => /archived_at = COALESCE/i.test(s)),
    'the delete path must not set archived_at');
});

test('an unused code deletes too, and reports no history', async () => {
  const db = fixtureDb();
  const res = await request(db, 'DELETE', '/api/admin/promos/4');

  assert.equal(res.status, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.redemptions_preserved, 0);
  assert.equal(payload.orders_preserved, 0);
  assert.equal(db.promos.find((x) => x.id === 4), undefined);
});

test('the delete runs inside a transaction', async () => {
  const db = fixtureDb();
  await request(db, 'DELETE', '/api/admin/promos/3');

  assert.ok(db.statements.includes('BEGIN'));
  assert.ok(db.statements.includes('COMMIT'));
});

// --- failed deletion ---------------------------------------------------------

test('deleting a discount code that does not exist returns 404', async () => {
  const db = fixtureDb();
  const res = await request(db, 'DELETE', '/api/admin/promos/999');

  assert.equal(res.status, 404);
  assert.equal(JSON.parse(res.body).error, 'Discount code not found.');
  assert.ok(!db.statements.some((s) => /^DELETE FROM promo_codes/i.test(s)));
});

test('a non-numeric promo id is rejected before touching the database', async () => {
  const db = fixtureDb();
  const res = await request(db, 'DELETE', '/api/admin/promos/not-a-number');

  assert.equal(res.status, 400);
  assert.ok(!db.statements.some((s) => /^DELETE FROM promo_codes/i.test(s)));
});

test('a foreign key violation surfaces as 409, it does not silently archive the code', async () => {
  const fkError = new Error('violates foreign key constraint');
  fkError.code = '23503';

  const db = fixtureDb({ deleteError: fkError });
  const res = await request(db, 'DELETE', '/api/admin/promos/3');

  assert.equal(res.status, 409);
  assert.match(JSON.parse(res.body).error, /still referenced/i);

  const promo = db.promos.find((x) => x.id === 3);
  assert.ok(promo, 'the code must be left in place');
  assert.equal(promo.active, true, 'a failed delete must not disable the code');
  assert.equal(promo.archived_at, null, 'a failed delete must not archive the code');
  assert.ok(db.statements.includes('ROLLBACK'));
});

test('an unexpected database error returns 500 and leaves the code in place', async () => {
  const db = fixtureDb({ deleteError: new Error('connection reset') });
  const res = await request(db, 'DELETE', '/api/admin/promos/3');

  assert.equal(res.status, 500);
  assert.ok(db.promos.some((x) => x.id === 3));
});

// --- historical order integrity ---------------------------------------------

test('orders that used the code keep their totals and a record of the code', async () => {
  const db = fixtureDb();
  const before = db.orders.length;

  const res = await request(db, 'DELETE', '/api/admin/promos/3');
  assert.equal(JSON.parse(res.body).orders_preserved, 1);
  assert.equal(db.orders.length, before, 'no order may be removed by a promo delete');

  const order = db.orders.find((o) => o.id === 100);
  assert.equal(order.promo_code, 'SAVE10', 'the order keeps the code text it was placed with');
  assert.equal(order.discount_amount, '5.00', 'the discount applied is unchanged');
  assert.equal(order.subtotal_before_discount, '49.99');
  assert.equal(order.total, '44.99', 'the order total is unchanged');
  assert.equal(order.promo_code_id, null, 'only the pointer to the deleted code is cleared');
});

test('the redemption audit trail survives with the code text snapshotted', async () => {
  const db = fixtureDb();
  const res = await request(db, 'DELETE', '/api/admin/promos/3');

  assert.equal(JSON.parse(res.body).redemptions_preserved, 1);
  assert.equal(db.redemptions.length, 1, 'the redemption row must not be deleted');

  const redemption = db.redemptions[0];
  assert.equal(redemption.promo_code, 'SAVE10');
  assert.equal(redemption.discount_amount, '5.00');
  assert.equal(redemption.order_id, 100);
  assert.equal(redemption.promo_code_id, null);
});

test('orders that used a different code are untouched', async () => {
  const db = fixtureDb();
  await request(db, 'DELETE', '/api/admin/promos/3');

  const other = db.orders.find((o) => o.id === 101);
  assert.equal(other.promo_code, 'LEGACY');
  assert.equal(other.total, '9.00');
});

// --- the soft options are still there ---------------------------------------

test('Disable/Enable and Archive remain as separate soft options', () => {
  const source = readSource('routes', 'admin-promos.js');
  assert.match(source, /router\.put\("\/promos\/:id"/,
    'the update endpoint that toggles active and archives must stay');
  assert.match(source, /archived_at = \$11/,
    'archiving must still be reachable through the update endpoint');

  const adminJs = readSource('admin.js');
  assert.match(adminJs, /data-promo-action="toggle"/, 'the Disable/Enable button must stay');
  assert.match(adminJs, /data-promo-action="archive"/, 'the Archive button must stay');
});

test('no archive fallback remains in the DELETE handler', () => {
  const source = readSource('routes', 'admin-promos.js');
  const start = source.indexOf('router.delete("/promos/:id"');
  const handler = source.slice(start, source.indexOf('return router;', start));

  assert.ok(handler.length > 0);
  assert.doesNotMatch(handler, /mode: "archived"/,
    'Delete must not report an archived outcome any more');
  assert.doesNotMatch(handler, /SET\s+active = false/,
    'Delete must not use the disabled/inactive status');
  assert.match(handler, /DELETE FROM promo_codes WHERE id = \$1/,
    'Delete must perform a database DELETE');
});

// --- schema ------------------------------------------------------------------

test('the migration relaxes the foreign key that used to block the delete', () => {
  const sql = readSource('db', 'migrations', '031_admin_hard_delete.sql');

  assert.match(sql, /ALTER TABLE promo_code_redemptions[\s\S]*?FOREIGN KEY \(promo_code_id\) REFERENCES promo_codes\(id\) ON DELETE SET NULL/,
    'promo_code_redemptions must reference promo_codes with ON DELETE SET NULL');
  assert.match(sql, /ALTER TABLE promo_code_redemptions\s+ADD COLUMN IF NOT EXISTS promo_code/,
    'the redemption row needs its own copy of the code text');
});

// --- frontend ----------------------------------------------------------------

test('the admin panel confirms before a permanent discount code delete', () => {
  const source = readSource('admin.js');
  assert.match(source, /function deletePromo\(id\) \{\s*if \(!window\.confirm\(PERMANENT_DELETE_CONFIRM\)\)/,
    'deletePromo must prompt before deleting');
  assert.doesNotMatch(source, /it will be archived instead/i,
    'the old "archived instead" prompt must be gone');
});

test('the admin panel drops the discount code row after a successful delete', () => {
  const source = readSource('admin.js');
  const fn = source.slice(source.indexOf('function deletePromo(id)'));
  const body = fn.slice(0, fn.indexOf('\n  function ', 10));

  assert.match(body, /state\.promos = \(state\.promos \|\| \[\]\)\.filter/,
    'the deleted code must be removed from local state');
  assert.match(body, /renderPromoTable\(\)/, 'the table must be re-rendered');
  assert.match(body, /loadPromos\(\)/, 'the list must also refresh from the server');
});
