'use strict';

// The public certificate index has to stay a verification resource and nothing
// more: /coas.html is reachable signed out, it lists only names that actually
// have a published COA, and it carries no price, no stock and no route into
// the gated catalogue. Individual published reports stay downloadable; that is
// covered by test/coas/coas.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');

const SERVER = read('server.js');
const COA_INDEX_SRC = read('services/coa-index.js');
const COAS_HTML = read('coas.html');

const { renderCoaIndex } = require(path.join(REPO, 'services', 'public-page.js'));
const { createCoaIndex } = require(path.join(REPO, 'services', 'coa-index.js'));

function fakePool(rows) {
  const calls = [];
  return {
    calls,
    query(text) {
      calls.push(text);
      return Promise.resolve({ rows });
    }
  };
}

test('/coas.html stays publicly reachable', () => {
  const start = SERVER.indexOf('const PUBLIC_HTML_PATHS = new Set([');
  assert.ok(start !== -1, 'PUBLIC_HTML_PATHS should still exist');
  const block = SERVER.slice(start, SERVER.indexOf(']);', start));
  assert.ok(block.includes("'/coas.html'"), '/coas.html must answer a signed-out request');
});

test('the index is built from published COAs, never from the catalogue', async () => {
  const pool = fakePool([{ name: 'Alpha Peptide', published_coa_count: 2 }]);
  const subjects = await createCoaIndex({ pool }).publishedSubjects();

  assert.deepEqual(subjects, [{ name: 'Alpha Peptide', publishedCoaCount: 2 }]);
  assert.equal(pool.calls.length, 1, 'one narrow query, not a catalogue load');

  const sql = pool.calls[0];
  assert.match(sql, /FROM coas c/, 'the COA table drives the index');
  assert.match(sql, /c\.status = 'published'/, 'only published certificates count');
  for (const column of ['price', 'stock_quantity', 'slug', 'image_url', 'sku', 'description']) {
    assert.ok(!sql.includes(column), 'the query must not read ' + column);
  }

  assert.ok(!COA_INDEX_SRC.includes('public-catalog'), 'the module must not use the catalogue service');
  assert.ok(!COA_INDEX_SRC.includes('listActive'), 'the module must not load the active catalogue');
});

test('a product with a published COA is listed; one without never is', async () => {
  const pool = fakePool([{ name: 'Alpha Peptide', published_coa_count: 1 }]);
  const html = renderCoaIndex({ subjects: await createCoaIndex({ pool }).publishedSubjects() });

  assert.ok(html.includes('Alpha Peptide'), 'a published certificate puts its product name on the page');
  assert.ok(!html.includes('Beta Peptide'), 'an active product with no published COA never appears');
  assert.ok(html.includes('1 published certificate'), 'the count comes from the certificate rows');
});

test('the rendered index carries no catalogue link, price or stock', () => {
  const html = renderCoaIndex({
    subjects: [
      { name: 'Alpha Peptide', publishedCoaCount: 2 },
      { name: 'Gamma Blend', publishedCoaCount: 1 }
    ]
  });

  assert.ok(!html.includes('<a '), 'the certificate index links nowhere');
  assert.ok(!html.includes('/products/'), 'no product-detail links');
  assert.ok(!html.includes('/shop'), 'no catalogue links');
  assert.doesNotMatch(html, /\$\s?\d/, 'no prices');
  assert.doesNotMatch(html, /in stock|out of stock|inventory|stock_quantity/i, 'no inventory status');
});

test('an empty index renders nothing at all', () => {
  assert.equal(renderCoaIndex({ subjects: [] }), '');
  assert.equal(renderCoaIndex({ subjects: undefined }), '');
});

test('the COA page itself links nowhere into the catalogue', () => {
  assert.ok(!COAS_HTML.includes('href="/shop'), 'coas.html must not link to the catalogue');
  assert.ok(!COAS_HTML.includes('href="/products/'), 'coas.html must not link to product pages');
});

test('the COA page never renders the catalogue server-side', () => {
  const start = SERVER.indexOf('async function getCoaIndexHtml()');
  assert.ok(start !== -1, 'getCoaIndexHtml should still exist');
  const block = SERVER.slice(start, SERVER.indexOf('\n}', start));

  assert.ok(block.includes('coaIndex.publishedSubjects()'), 'the page reads the certificate index');
  assert.ok(!block.includes('publicCatalog'), 'the page must not read the catalogue');
});
