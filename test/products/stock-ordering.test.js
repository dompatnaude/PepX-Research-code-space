// Storefront stock ordering.
//
// GET /api/products has to hand the storefront its products with the in-stock
// ones first and the sold-out ones last, keeping the created_at DESC order the
// SQL already establishes inside each of those two groups, and without hiding
// or duplicating anything. "Sold out" here is the route's own effective stock
// number -- the sum of a product's variant stock when it has variants -- so a
// product whose stock lives entirely on its variants must not sink.
//
// The last two tests pin the client half: script.js re-applies the same rule
// after a shopper picks a sort, so a price sort cannot float sold-out items
// back to the top of the shop grid.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const express = require('express');

const REPO = path.join(__dirname, '..', '..');
const CONNECTION_PATH = require.resolve(path.join(REPO, 'db', 'connection.js'));
const ROUTER_PATH = require.resolve(path.join(REPO, 'routes', 'products.js'));
const SCRIPT_PATH = path.join(REPO, 'script.js');

// Stand-in for the pg pool. It answers the two queries the products route
// makes and returns rows in the order the fixture lists them, which is what
// ORDER BY created_at DESC would produce.
function fixturePool(fixture) {
  return {
    query: async (text, params) => {
      if (/FROM\s+product_variants/i.test(text)) {
        const ids = new Set((params && params[0] ? params[0] : []).map(Number));
        return { rows: (fixture.variants || []).filter((v) => ids.has(Number(v.product_id))) };
      }
      if (/FROM\s+products/i.test(text)) {
        return { rows: (fixture.products || []).filter((p) => p.active !== false) };
      }
      throw new Error('unexpected query: ' + text);
    },
  };
}

function loadRouter(fixture) {
  require.cache[CONNECTION_PATH] = {
    id: CONNECTION_PATH,
    filename: CONNECTION_PATH,
    loaded: true,
    exports: fixturePool(fixture),
  };
  delete require.cache[ROUTER_PATH];
  return require(ROUTER_PATH);
}

async function getProducts(fixture) {
  const app = express();
  app.use('/api/products', loadRouter(fixture));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const res = await fetch('http://127.0.0.1:' + port + '/api/products');
    assert.equal(res.status, 200);
    return await res.json();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function product(id, name, stock) {
  return {
    id,
    name,
    slug: name.toLowerCase(),
    description: '',
    price: '10.00',
    image_url: null,
    sku: 'SKU-' + id,
    stock_quantity: stock,
    category: 'PEPTIDES',
    active: true,
    created_at: '2026-01-0' + id,
  };
}

// A, B, C, D as the catalog already orders them (created_at DESC).
function catalog(bStock) {
  return {
    products: [product(1, 'A', 5), product(2, 'B', bStock), product(3, 'C', 7), product(4, 'D', 2)],
    variants: [],
  };
}

function names(rows) {
  return rows.map((row) => row.name);
}

test('sold-out products sink below the in-stock ones without reshuffling the rest', async () => {
  const rows = await getProducts(catalog(0));
  assert.deepEqual(names(rows), ['A', 'C', 'D', 'B']);
});

test('every product is still returned, exactly once', async () => {
  const rows = await getProducts(catalog(0));
  assert.equal(rows.length, 4);
  assert.deepEqual([...names(rows)].sort(), ['A', 'B', 'C', 'D']);
});

test('a sold-out product stays visible and keeps its sold-out fields', async () => {
  const rows = await getProducts(catalog(0));
  const last = rows[rows.length - 1];
  assert.equal(last.name, 'B');
  assert.equal(last.stock_quantity, 0);
  assert.equal(last.stock_status, 'sold_out');
  assert.equal(last.stock_message, 'SOLD OUT');
});

test('restocking moves a product back up to where it was', async () => {
  const rows = await getProducts(catalog(12));
  assert.deepEqual(names(rows), ['A', 'B', 'C', 'D']);
  assert.equal(rows[1].stock_status, 'in_stock');
});

test('negative stock counts as sold out', async () => {
  const rows = await getProducts(catalog(-3));
  assert.deepEqual(names(rows), ['A', 'C', 'D', 'B']);
  assert.equal(rows[3].stock_quantity, 0);
});

test('a product whose stock lives on its variants is treated as in stock', async () => {
  const rows = await getProducts({
    products: [product(1, 'A', 5), product(2, 'B', 0), product(3, 'C', 0), product(4, 'D', 2)],
    variants: [
      { id: 10, product_id: 2, name: '5mg', price: '10.00', stock_quantity: 4 },
      { id: 11, product_id: 3, name: '5mg', price: '10.00', stock_quantity: 0 },
    ],
  });
  assert.deepEqual(names(rows), ['A', 'B', 'D', 'C']);
  assert.equal(rows.find((row) => row.name === 'B').stock_quantity, 4);
});

test('a fully sold-out catalog comes back intact rather than empty', async () => {
  const rows = await getProducts({ products: [product(1, 'A', 0), product(2, 'B', 0)], variants: [] });
  assert.deepEqual(names(rows), ['A', 'B']);
});

// The shop grid re-applies the same rule after a shopper-chosen sort, so lift
// that helper straight out of script.js and exercise it on its own.
function loadClientSorter() {
  const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const match = src.match(/^function sortProductsInStockFirst\(products\)\{[\s\S]*?^\}/m);
  assert.ok(match, 'sortProductsInStockFirst is missing from script.js');
  const sandbox = { isProductSoldOut: (p) => Number(p.stock_quantity) <= 0 };
  vm.createContext(sandbox);
  vm.runInContext(match[0], sandbox);
  return sandbox.sortProductsInStockFirst;
}

test('script.js keeps sold-out products last even after a price sort', () => {
  const sortProductsInStockFirst = loadClientSorter();
  const priceSorted = [
    { name: 'cheap-soldout', stock_quantity: 0 },
    { name: 'cheap', stock_quantity: 3 },
    { name: 'mid-soldout', stock_quantity: 0 },
    { name: 'pricey', stock_quantity: 1 },
  ];
  const out = sortProductsInStockFirst(priceSorted);
  assert.deepEqual([...names(out)], ['cheap', 'pricey', 'cheap-soldout', 'mid-soldout']);
  assert.equal(out.length, priceSorted.length);
});

test('renderProducts applies the partition before it paints the grid', () => {
  const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const body = src.slice(src.indexOf('function renderProducts(filter){'));
  const sortAt = body.indexOf('visible = sortProductsInStockFirst(visible);');
  const renderAt = body.indexOf('renderProductCards(visible');
  assert.ok(sortAt > -1, 'renderProducts does not apply the stock partition');
  assert.ok(renderAt > -1, 'renderProducts no longer renders through renderProductCards');
  assert.ok(sortAt < renderAt, 'the stock partition has to run before the grid is rendered');
});
