'use strict';

// The public catalogue pages are the only pages on this site Google can read
// for a compound query, so their SEO output is pinned here: title, meta
// description, H1, canonical, robots, Open Graph and JSON-LD.
//
// Two rules get the most attention, because they are the ones a future change
// could quietly break:
//
//   1. Indexability follows content. A product with no description renders and
//      stays linked, but is noindex and absent from the sitemap.
//   2. Nothing on the page is invented. Every visible fact traces to a column,
//      and the template asserts nothing about purity, testing, certification,
//      dosing, safety or efficacy.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isIndexable,
  slugifyCategory,
  buildPriceRange,
  groupCategories,
  MIN_INDEXABLE_DESCRIPTION_CHARS
} = require('../../services/public-catalog');

const {
  renderShopPage,
  renderProductPage,
  buildShopSeo,
  buildProductSeo,
  productJsonLd,
  truncateForMeta,
  INDEXABLE_ROBOTS,
  NOINDEX_ROBOTS
} = require('../../services/public-page');

const ORIGIN = 'https://pepxresearch.com';

const DESCRIBED_COPY =
  'BPC-157 is supplied as a lyophilised powder in sealed vials. Each vial is ' +
  'labelled with its batch identifier and net peptide content. Store sealed ' +
  'vials in a freezer and keep reconstituted material refrigerated.';

function product(overrides = {}) {
  return Object.assign({
    id: 14,
    slug: 'bpc-157',
    name: 'BPC-157',
    description: '',
    category: 'Repair',
    categorySlug: 'repair',
    sku: 'PX-BPC157',
    imageUrl: '/assets/products/bpc-157.png',
    inStock: true,
    active: true,
    updatedAt: '2026-08-02T10:00:00.000Z',
    variants: [
      { name: '5mg', price: 34.99, inStock: true },
      { name: '10mg', price: 54.99, inStock: true }
    ],
    priceFrom: 34.99,
    priceTo: 54.99,
    publishedCoaCount: 0,
    path: '/products/bpc-157'
  }, overrides);
}

const CATEGORIES = [
  { name: 'Cellular', slug: 'cellular', count: 4, indexableCount: 0, path: '/shop/cellular' },
  { name: 'Repair', slug: 'repair', count: 2, indexableCount: 1, path: '/shop/repair' }
];

function mainOf(html) {
  const m = html.match(/<main[\s\S]*?<\/main>/);
  assert.ok(m, 'page should have a <main> region');
  return m[0];
}

test('indexability follows the presence of real description copy', () => {
  assert.equal(isIndexable(product({ description: DESCRIBED_COPY })), true);
  assert.equal(isIndexable(product({ description: '' })), false);
  assert.equal(isIndexable(product({ description: '   ' })), false);
  assert.equal(isIndexable(product({ description: 'x'.repeat(MIN_INDEXABLE_DESCRIPTION_CHARS - 1) })), false);
  assert.equal(isIndexable(product({ description: 'x'.repeat(MIN_INDEXABLE_DESCRIPTION_CHARS) })), true);
  assert.equal(isIndexable(product({ description: DESCRIBED_COPY, active: false })), false);
});

test('category slugs are URL-safe and stable', () => {
  assert.equal(slugifyCategory('Growth'), 'growth');
  assert.equal(slugifyCategory('Metabolic'), 'metabolic');
  assert.equal(slugifyCategory('  Cellular  '), 'cellular');
  assert.equal(slugifyCategory('Repair & Recovery'), 'repair-recovery');
  assert.equal(slugifyCategory(null), '');
});

test('price range spans base price and every active variant', () => {
  assert.deepEqual(buildPriceRange(40, [{ price: 34.99 }, { price: 54.99 }]), { from: 34.99, to: 54.99 });
  assert.deepEqual(buildPriceRange(null, [{ price: 20 }]), { from: 20, to: 20 });
  assert.deepEqual(buildPriceRange(null, []), { from: null, to: null });
});

test('category grouping counts total and indexable products separately', () => {
  const groups = groupCategories([
    product({ slug: 'a', category: 'Repair', categorySlug: 'repair', description: DESCRIBED_COPY }),
    product({ slug: 'b', category: 'Repair', categorySlug: 'repair', description: '' }),
    product({ slug: 'c', category: 'Growth', categorySlug: 'growth', description: '' })
  ]);
  const repair = groups.find((g) => g.slug === 'repair');
  assert.equal(repair.count, 2);
  assert.equal(repair.indexableCount, 1);
  assert.equal(repair.path, '/shop/repair');
});

test('/shop generates a unique title, description, H1 and canonical', () => {
  const seo = buildShopSeo({ origin: ORIGIN, products: [product(), product({ slug: 'ghk-cu' })], categories: CATEGORIES });
  assert.equal(seo.title, 'Research Compounds | PepX Research');
  assert.equal(seo.h1, 'Research Compounds');
  assert.equal(seo.canonical, 'https://pepxresearch.com/shop');
  assert.equal(seo.robots, INDEXABLE_ROBOTS);
  assert.match(seo.description, /2 research compounds across 2 categories/);
  assert.ok(seo.description.length <= 200, 'shop description should stay compact');
});

test('/shop/:category generates its own title, H1 and canonical', () => {
  const category = CATEGORIES[1];
  const seo = buildShopSeo({ origin: ORIGIN, products: [product()], categories: CATEGORIES, category });
  assert.equal(seo.title, 'Repair Research Compounds | PepX Research');
  assert.equal(seo.h1, 'Repair Research Compounds');
  assert.equal(seo.canonical, 'https://pepxresearch.com/shop/repair');
});

test('a described product page is indexable and uses its own copy as the description', () => {
  const p = product({ description: DESCRIBED_COPY });
  const seo = buildProductSeo({ origin: ORIGIN, product: p, indexable: true });
  assert.equal(seo.title, 'BPC-157 | PepX Research');
  assert.equal(seo.h1, 'BPC-157');
  assert.equal(seo.canonical, 'https://pepxresearch.com/products/bpc-157');
  assert.equal(seo.robots, INDEXABLE_ROBOTS);
  assert.ok(DESCRIBED_COPY.startsWith(seo.description.replace(/…$/, '')),
    'meta description should be the product copy, trimmed');
  assert.ok(seo.description.length <= 156);
});

test('an undescribed product page is noindex', () => {
  const seo = buildProductSeo({ origin: ORIGIN, product: product(), indexable: false });
  assert.equal(seo.robots, NOINDEX_ROBOTS);
  assert.equal(seo.canonical, 'https://pepxresearch.com/products/bpc-157');
});

test('meta descriptions are trimmed on a word boundary', () => {
  const source = 'one two three four five six seven eight nine ten';
  const out = truncateForMeta(source, 20);
  assert.ok(out.length <= 20, out);
  assert.match(out, /…$/, 'a trimmed description should say it was trimmed');

  const kept = out.replace(/…$/, '');
  assert.ok(source.startsWith(kept), kept);
  const next = source.charAt(kept.length);
  assert.ok(next === '' || next === ' ', 'cut landed mid-word: ' + JSON.stringify(kept));
});

test('Product JSON-LD carries only real values', () => {
  const data = productJsonLd({ origin: ORIGIN, product: product({ description: DESCRIBED_COPY }) });
  assert.equal(data['@type'], 'Product');
  assert.equal(data.name, 'BPC-157');
  assert.equal(data.sku, 'PX-BPC157');
  assert.equal(data.url, 'https://pepxresearch.com/products/bpc-157');
  assert.equal(data.offers['@type'], 'AggregateOffer');
  assert.equal(data.offers.lowPrice, '34.99');
  assert.equal(data.offers.highPrice, '54.99');
  assert.equal(data.offers.availability, 'https://schema.org/InStock');
});

test('Product JSON-LD omits description rather than inventing one', () => {
  const data = productJsonLd({ origin: ORIGIN, product: product({ description: '' }) });
  assert.ok(!('description' in data), 'no description key when the column is empty');
});

test('a single-priced product gets a plain Offer, out of stock is reported honestly', () => {
  const data = productJsonLd({
    origin: ORIGIN,
    product: product({ variants: [{ name: '5mg', price: 34.99 }], priceFrom: 34.99, priceTo: 34.99, inStock: false })
  });
  assert.equal(data.offers['@type'], 'Offer');
  assert.equal(data.offers.price, '34.99');
  assert.equal(data.offers.availability, 'https://schema.org/OutOfStock');
});

test('JSON-LD stays valid JSON and never leaks markup into the document', () => {
  const html = renderProductPage({
    origin: ORIGIN,
    product: product({ name: 'A & B', description: 'Contains < and > and & ' + 'x'.repeat(120) }),
    related: [],
    categories: CATEGORIES,
    indexable: true
  });
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)].map((m) => m[1]);
  assert.equal(blocks.length, 2);
  for (const block of blocks) {
    assert.doesNotMatch(block, /[<>&]/, 'raw markup characters must not survive into the script block');
    JSON.parse(block);
  }
  assert.equal(JSON.parse(blocks[1]).name, 'A & B', 'the value must round-trip exactly');
});

test('/shop renders one linked card per product plus ItemList and breadcrumbs', () => {
  const products = [product(), product({ id: 9, slug: 'ghk-cu', name: 'GHK-Cu', category: 'Cellular', categorySlug: 'cellular', path: '/products/ghk-cu' })];
  const html = renderShopPage({ origin: ORIGIN, products, categories: CATEGORIES });

  assert.match(html, /<title>Research Compounds \| PepX Research<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/pepxresearch\.com\/shop">/);
  assert.match(html, /<h1>Research Compounds<\/h1>/);
  assert.match(html, /href="\/products\/bpc-157"/);
  assert.match(html, /href="\/products\/ghk-cu"/);
  assert.match(html, /href="\/shop\/cellular"/);
  assert.match(html, /"@type": "ItemList"/);
  assert.match(html, /"@type": "BreadcrumbList"/);
  assert.match(html, /twitter:card" content="summary_large_image"/);
  assert.match(html, /<html lang="en"/);
});

test('a product page renders specs, price and a login CTA, and never a cart control', () => {
  const html = renderProductPage({
    origin: ORIGIN,
    product: product({ description: DESCRIBED_COPY }),
    related: [],
    categories: CATEGORIES,
    indexable: true
  });

  assert.match(html, /<h1>BPC-157<\/h1>/);
  assert.match(html, /<title>BPC-157 \| PepX Research<\/title>/);
  assert.match(html, /From \$34\.99/);
  assert.match(html, /5mg — \$34\.99, 10mg — \$54\.99/);
  assert.match(html, /Log in to order/);
  assert.match(html, /"@type": "Product"/);
  assert.doesNotMatch(html, /addToCart|id="cartBtn"|Add to Cart/i);
  assert.doesNotMatch(html, /script\.js/, 'the signed-in storefront bundle must not be referenced');
});

test('an undescribed product page omits the details section entirely', () => {
  const html = renderProductPage({
    origin: ORIGIN, product: product({ description: '' }), related: [], categories: CATEGORIES, indexable: false
  });
  assert.doesNotMatch(html, /Product details/);
  assert.match(html, /content="noindex, follow"/);
  assert.match(html, /<h1>BPC-157<\/h1>/);
});

test('COA wording appears only when published COA records exist', () => {
  const without = mainOf(renderProductPage({
    origin: ORIGIN, product: product({ publishedCoaCount: 0 }), related: [], categories: CATEGORIES, indexable: false
  }));
  assert.doesNotMatch(without, /certificate/i);

  const with2 = mainOf(renderProductPage({
    origin: ORIGIN, product: product({ publishedCoaCount: 2 }), related: [], categories: CATEGORIES, indexable: false
  }));
  assert.match(with2, /2 published certificates of analysis/);
});

test('the template makes no claim the database does not support', () => {
  const html = mainOf(renderProductPage({
    origin: ORIGIN, product: product({ description: '' }), related: [], categories: CATEGORIES, indexable: false
  }));

  for (const word of [
    'purity', 'certificate', 'certified', 'tested', 'lab-tested', 'sterile', 'GMP',
    'therapeutic', 'treat', 'cure', 'efficacy', 'dosage', 'dosing', 'safe for',
    'FDA', 'approved', 'pharmaceutical grade'
  ]) {
    assert.doesNotMatch(html, new RegExp(word, 'i'), 'unsupported claim in template: ' + word);
  }
});

test('product fields are escaped, not interpolated raw', () => {
  const html = renderProductPage({
    origin: ORIGIN,
    product: product({
      name: 'BPC-157 <script>alert(1)</script>',
      description: 'Ampersand & "quotes" and <b>markup</b> ' + 'x'.repeat(120),
      sku: '"><img src=x onerror=alert(1)>'
    }),
    related: [],
    categories: CATEGORIES,
    indexable: true
  });

  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<img[^>]*onerror/i, 'SKU escaped into an executable attribute');
  assert.doesNotMatch(html, /<\/?b>/, 'markup inside a description must not survive as markup');
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('related products link sideways within the category', () => {
  const html = renderProductPage({
    origin: ORIGIN,
    product: product(),
    related: [product({ id: 2, slug: 'tb-500', name: 'TB-500', path: '/products/tb-500' })],
    categories: CATEGORIES,
    indexable: false
  });
  assert.match(html, /More in Repair/);
  assert.match(html, /href="\/products\/tb-500"/);
});
