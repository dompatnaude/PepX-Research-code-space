'use strict';

// The admin Products "Delete" button used to run
//   UPDATE products SET active = false
// which hid the product from the storefront but left it sitting in the admin
// list forever, with no way to ever remove it.
//
// It is now a real DELETE. The reason it could not be one before is
// order_items.product_id -> products(id), which had no ON DELETE action and so
// rejected the delete outright. Migration 031 turns that into ON DELETE SET
// NULL, which is safe here because order_items already carries its own
// snapshot of the line (name, price, quantity, variant_name, variant_price) --
// nothing about a historical order is read through that foreign key.
//
// These tests pin three things: the delete really deletes, a failed delete
// stays a failure instead of quietly falling back to disabling the row, and
// historical order rows keep every figure they were placed with.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const createAdminProductsRouter = require('../../routes/admin-products');

const REPO = path.join(__dirname, '..', '..');
const readSource = (...parts) => fs.readFileSync(path.join(REPO, ...parts), 'utf8');

// An in-memory stand-in for Postgres that enforces the referential actions the
// migration installs: deleting a product nulls order_items.product_id and
// coas.product_id, and cascades cart_items away.
function fixtureDb(overrides) {
  const opts = overrides || {};

  const db = {
    statements: [],
    products: [
      { id: 7, name: 'Test Peptide 5mg', slug: 'test-peptide-5mg', active: true },
      { id: 8, name: 'Never Ordered', slug: 'never-ordered', active: false }
    ],
    orderItems: [
      { id: 1, order_id: 100, product_id: 7, name: 'Test Peptide 5mg', price: '49.99', quantity: 2 },
      { id: 2, order_id: 101, product_id: 7, name: null, price: '49.99', quantity: 1 },
      { id: 3, order_id: 101, product_id: 9, name: 'Unrelated', price: '10.00', quantity: 1 }
    ],
    coas: [
      { id: 55, product_id: 7, product_name: null, product_slug: null, status: 'published' }
    ],
    cartItems: [
      { id: 900, cart_id: 1, product_id: 7 }
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

    if (/SELECT id, name, slug FROM products WHERE id/i.test(text)) {
      const row = db.products.find((x) => x.id === p[0]);
      return { rows: row ? [row] : [] };
    }

    if (/UPDATE order_items SET name/i.test(text)) {
      for (const item of db.orderItems) {
        if (item.product_id === p[0] && (item.name == null || item.name.trim() === '')) {
          item.name = p[1];
        }
      }
      return { rows: [] };
    }

    if (/UPDATE coas SET product_name/i.test(text)) {
      for (const coa of db.coas) {
        if (coa.product_id === p[0]) {
          coa.product_name = coa.product_name == null ? p[1] : coa.product_name;
          coa.product_slug = coa.product_slug == null ? p[2] : coa.product_slug;
        }
      }
      return { rows: [] };
    }

    if (/COUNT\(\*\)::int AS count FROM order_items WHERE product_id/i.test(text)) {
      return { rows: [{ count: db.orderItems.filter((x) => x.product_id === p[0]).length }] };
    }

    if (/COUNT\(\*\)::int AS count FROM coas WHERE product_id/i.test(text)) {
      return { rows: [{ count: db.coas.filter((x) => x.product_id === p[0]).length }] };
    }

    if (/^DELETE FROM products WHERE id/i.test(text)) {
      if (opts.deleteError) throw opts.deleteError;
      const index = db.products.findIndex((x) => x.id === p[0]);
      if (index === -1) return { rows: [] };
      const [removed] = db.products.splice(index, 1);
      // Referential actions installed by migration 031.
      for (const item of db.orderItems) {
        if (item.product_id === removed.id) item.product_id = null;
      }
      for (const coa of db.coas) {
        if (coa.product_id === removed.id) coa.product_id = null;
      }
      db.cartItems = db.cartItems.filter((x) => x.product_id !== removed.id);
      return { rows: [{ id: removed.id, name: removed.name, slug: removed.slug }] };
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
  app.use('/api/admin/products', createAdminProductsRouter((req, res, next) => {
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

test('deleting a product removes the row from the database', async () => {
  const db = fixtureDb();
  const res = await request(db, 'DELETE', '/api/admin/products/7');

  assert.equal(res.status, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.deleted, true);
  assert.equal(payload.mode, 'hard_delete');
  assert.equal(payload.product.id, 7);
  assert.equal(db.products.find((p) => p.id === 7), undefined,
    'the product row must be gone, not flagged inactive');
});

test('the delete route issues a DELETE, never an UPDATE ... SET active = false', async () => {
  const db = fixtureDb();
  await request(db, 'DELETE', '/api/admin/products/7');

  assert.ok(db.statements.some((s) => /^DELETE FROM products/i.test(s)),
    'a real DELETE statement must be issued');
  assert.ok(!db.statements.some((s) => /UPDATE products SET active = false/i.test(s)),
    'the delete path must not soft-disable the product');
});

test('the delete runs inside a transaction', async () => {
  const db = fixtureDb();
  await request(db, 'DELETE', '/api/admin/products/7');

  assert.ok(db.statements.includes('BEGIN'));
  assert.ok(db.statements.includes('COMMIT'));
  assert.ok(db.statements.indexOf('BEGIN') < db.statements.findIndex((s) => /^DELETE FROM products/i.test(s)));
});

test('a deleted product is gone from the storefront because the row is gone', () => {
  // The public catalog reads WHERE active = true from `products`. A deleted row
  // matches nothing, so removal from the customer-facing site is automatic.
  const source = readSource('routes', 'products.js');
  assert.match(source, /FROM products\s+WHERE active = true/,
    'the public catalog must still filter on active, so a deleted row cannot appear');
});

test('a product with no history at all still deletes', async () => {
  const db = fixtureDb();
  const res = await request(db, 'DELETE', '/api/admin/products/8');

  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).order_items_preserved, 0);
  assert.equal(db.products.find((p) => p.id === 8), undefined);
});

// --- failed deletion ---------------------------------------------------------

test('deleting a product that does not exist returns 404', async () => {
  const db = fixtureDb();
  const res = await request(db, 'DELETE', '/api/admin/products/4242');

  assert.equal(res.status, 404);
  assert.equal(JSON.parse(res.body).error, 'Product not found');
  assert.ok(!db.statements.some((s) => /^DELETE FROM products/i.test(s)),
    'no delete should be attempted for a missing product');
});

test('a non-numeric product id is rejected before touching the database', async () => {
  const db = fixtureDb();
  const res = await request(db, 'DELETE', '/api/admin/products/abc');

  assert.equal(res.status, 400);
  assert.ok(!db.statements.some((s) => /^DELETE FROM products/i.test(s)));
});

test('a foreign key violation surfaces as 409, it does not silently disable the product', async () => {
  const fkError = new Error('update or delete on table "products" violates foreign key constraint');
  fkError.code = '23503';

  const db = fixtureDb({ deleteError: fkError });
  const res = await request(db, 'DELETE', '/api/admin/products/7');

  assert.equal(res.status, 409);
  assert.match(JSON.parse(res.body).error, /still referenced/i);
  assert.ok(db.products.some((p) => p.id === 7), 'the product must be left untouched');
  assert.ok(db.products.find((p) => p.id === 7).active === true,
    'a failed delete must not fall back to flipping active to false');
  assert.ok(db.statements.includes('ROLLBACK'), 'the transaction must roll back');
});

test('an unexpected database error returns 500 and leaves the product in place', async () => {
  const db = fixtureDb({ deleteError: new Error('connection reset') });
  const res = await request(db, 'DELETE', '/api/admin/products/7');

  assert.equal(res.status, 500);
  assert.ok(db.products.some((p) => p.id === 7));
});

// --- historical order integrity ---------------------------------------------

test('historical order lines survive the delete with their figures intact', async () => {
  const db = fixtureDb();
  const before = db.orderItems.filter((i) => i.order_id === 100 || i.order_id === 101).length;

  await request(db, 'DELETE', '/api/admin/products/7');

  const after = db.orderItems.filter((i) => i.order_id === 100 || i.order_id === 101);
  assert.equal(after.length, before, 'no order line may be removed by a product delete');

  const line = db.orderItems.find((i) => i.id === 1);
  assert.equal(line.name, 'Test Peptide 5mg', 'the line item keeps its own product name');
  assert.equal(line.price, '49.99', 'the price paid is unchanged');
  assert.equal(line.quantity, 2, 'the quantity ordered is unchanged');
  assert.equal(line.product_id, null, 'only the catalog pointer is cleared');
});

test('a line item with no name snapshot is backfilled before the product goes away', async () => {
  const db = fixtureDb();
  await request(db, 'DELETE', '/api/admin/products/7');

  const line = db.orderItems.find((i) => i.id === 2);
  assert.equal(line.name, 'Test Peptide 5mg',
    'a legacy line that relied on the join must be given the product name before the link is cut');
  assert.equal(line.product_id, null);
});

test('order lines belonging to other products are not touched', async () => {
  const db = fixtureDb();
  await request(db, 'DELETE', '/api/admin/products/7');

  const other = db.orderItems.find((i) => i.id === 3);
  assert.equal(other.product_id, 9);
  assert.equal(other.name, 'Unrelated');
});

test('COA records are detached and keep a snapshot of the product they were issued for', async () => {
  const db = fixtureDb();
  const res = await request(db, 'DELETE', '/api/admin/products/7');

  assert.equal(JSON.parse(res.body).coas_detached, 1);
  const coa = db.coas.find((c) => c.id === 55);
  assert.ok(coa, 'the compliance record must survive');
  assert.equal(coa.product_id, null);
  assert.equal(coa.product_name, 'Test Peptide 5mg');
  assert.equal(coa.product_slug, 'test-peptide-5mg');
});

test('live cart rows referencing the product are cascaded away', async () => {
  const db = fixtureDb();
  await request(db, 'DELETE', '/api/admin/products/7');
  assert.equal(db.cartItems.length, 0);
});

// --- the soft option is still there -----------------------------------------

test('Disable/Enable remains as a separate soft option', () => {
  const source = readSource('routes', 'admin-products.js');
  assert.match(source, /router\.put\('\/:id\/status'/,
    'the status endpoint that soft-disables a product must stay');
  assert.match(source, /UPDATE products SET active = \$1/,
    'the status endpoint must still flip the active flag');
});

test('no soft-disable remains in the DELETE handler', () => {
  const source = readSource('routes', 'admin-products.js');
  const deleteHandler = source.slice(
    source.indexOf("router.delete('/:id'"),
    source.indexOf("router.put('/:id/status'")
  );

  assert.ok(deleteHandler.length > 0);
  assert.doesNotMatch(deleteHandler, /UPDATE products SET active = false/,
    'Delete must not use the disabled/inactive status any more');
  assert.match(deleteHandler, /DELETE FROM products WHERE id = \$1/,
    'Delete must perform a database DELETE');
});

// --- schema ------------------------------------------------------------------

test('the migration relaxes the foreign keys that used to block the delete', () => {
  const sql = readSource('db', 'migrations', '031_admin_hard_delete.sql');

  assert.match(sql, /ALTER TABLE order_items[\s\S]*?FOREIGN KEY \(product_id\) REFERENCES products\(id\) ON DELETE SET NULL/,
    'order_items must reference products with ON DELETE SET NULL');
  assert.match(sql, /ALTER TABLE coas[\s\S]*?FOREIGN KEY \(product_id\) REFERENCES products\(id\) ON DELETE SET NULL/,
    'coas must reference products with ON DELETE SET NULL');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS product_name/,
    'coas needs a product name snapshot so a detached record is still readable');
});

// --- frontend ----------------------------------------------------------------

test('the admin panel confirms before a permanent product delete', () => {
  const source = readSource('admin.js');
  assert.match(source,
    /Are you sure you want to permanently delete this item\? This cannot be undone\./,
    'the permanent delete confirmation copy must be present');
  assert.match(source, /function removeProduct\(id\) \{\s*if \(!window\.confirm\(PERMANENT_DELETE_CONFIRM\)\)/,
    'removeProduct must prompt before deleting');
});

test('the admin panel drops the product row after a successful delete', () => {
  const source = readSource('admin.js');
  const fn = source.slice(source.indexOf('function removeProduct(id)'));
  const body = fn.slice(0, fn.indexOf('\n  function ', 10));

  assert.match(body, /state\.products = \(state\.products \|\| \[\]\)\.filter/,
    'the deleted product must be removed from local state');
  assert.match(body, /renderProductTable\(\)/, 'the table must be re-rendered');
  assert.match(body, /loadProducts\(\)/, 'the list must also refresh from the server');
  assert.doesNotMatch(body, /Product disabled/,
    'the success toast must not claim the product was merely disabled');
});
