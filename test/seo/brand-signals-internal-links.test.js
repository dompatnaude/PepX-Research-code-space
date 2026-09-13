'use strict';

// Brand signals and internal linking.
//
// The phase this covers is almost entirely about what a crawler is handed: an
// H1 that names the company, category controls that are links instead of
// buttons, featured products present in the HTML rather than fetched by a
// script the crawler is never served, and no public link that dead-ends in a
// login redirect. All of that is assertable from the markup and the renderers
// without booting the app - importing server.js would open a Postgres pool and
// a session store, which a unit test has no business doing.
//
// The live anonymous HTTP matrix is run separately and recorded in the pull
// request.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');

const INDEX = read('index.html');
const STYLES = read('styles.css');
const SERVER = read('server.js');
const COAS = read('coas.html');

const {
  renderFeaturedGrid,
  renderCoaIndex,
  coaPathForProduct,
  renderProductPage
} = require('../../services/public-page');

const CATEGORY_SLUGS = ['cellular', 'growth', 'metabolic', 'neuro', 'recovery', 'repair', 'support'];

// The public HTML pages a crawler can actually reach. Everything gated is
// deliberately absent.
const PUBLIC_PAGES = [
  'index.html', 'login.html', 'register.html', 'coas.html',
  'privacy-policy.html', 'terms-of-service.html', 'terms-conditions.html',
  'refund-policy.html', 'shipping-policy.html'
];

function product(over = {}) {
  return Object.assign({
    id: 7,
    slug: 'bpc-157',
    name: 'BPC-157',
    description: '',
    category: 'Repair',
    categorySlug: 'repair',
    sku: 'PX-BPC-5',
    imageUrl: '/assets/products/bpc-157.png',
    inStock: true,
    active: true,
    updatedAt: null,
    variants: [],
    priceFrom: 45,
    priceTo: 90,
    publishedCoaCount: 0,
    path: '/products/bpc-157'
  }, over);
}

// --- 1. homepage H1 ---------------------------------------------------------

test('the homepage H1 names the brand and what the site sells', () => {
  const h1s = INDEX.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g) || [];
  assert.equal(h1s.length, 1, 'a page should have exactly one H1');

  const text = h1s[0]
    .replace(/<[^>]+>/g, '')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&amp;/g, '&')
    .trim();

  assert.match(text, /PepX Research/, 'the H1 must identify the brand');
  assert.match(text, /Research (Peptides|Compounds)/i, 'the H1 must say what the site is');
  // The old H1 was the tagline alone, which told Google nothing.
  assert.doesNotMatch(text, /PUSH\. EXCEL\. PREVAIL\./);
});

test('the tagline is preserved as visible supporting brand copy', () => {
  assert.match(INDEX, /<p class="hero-tagline">PUSH\. EXCEL\. PREVAIL\.<\/p>/);
  // Preserved visually means styled, not merely present.
  assert.match(STYLES, /\.hero \.hero-tagline\{/);
  // And never hidden from the signed-out page.
  const hideRule = STYLES.slice(STYLES.indexOf('html.pepx-public .hero-best,'));
  assert.doesNotMatch(hideRule.slice(0, 400), /hero-tagline/);
});

// --- 2. category controls are crawlable links -------------------------------

test('every homepage category control is an anchor to its public route', () => {
  const strip = INDEX.slice(
    INDEX.indexOf('<div class="category-strip featured-category-strip"'),
    INDEX.indexOf('<h2>Featured Research Peptides</h2>')
  );
  assert.ok(strip.length > 0, 'the category strip should still be on the page');

  // No <button> left in the strip: a button is not a link Google can follow.
  assert.doesNotMatch(strip, /<button/);

  for (const slug of CATEGORY_SLUGS) {
    assert.ok(strip.includes('href="/shop/' + slug + '"'), 'strip is missing /shop/' + slug);
  }
  assert.ok(strip.includes('href="/shop"'), 'strip is missing the all-products link');
});

test('the signed-in category filter still has the hook script.js reads', () => {
  const strip = INDEX.slice(
    INDEX.indexOf('<div class="category-strip featured-category-strip"'),
    INDEX.indexOf('<h2>Featured Research Peptides</h2>')
  );
  // script.js binds on '.featured-category-strip .pill' and reads data-filter.
  // Keeping both on the anchors means signed-in filtering is untouched.
  const pills = strip.match(/<a class="pill"[^>]*>/g) || [];
  assert.equal(pills.length, CATEGORY_SLUGS.length + 1);
  for (const pill of pills) assert.match(pill, /data-filter="/);

  const script = read('script.js');
  assert.match(script, /\.featured-category-strip \.pill/,
    'the signed-in handler must still be bound to these elements');
});

test('anchors styled as pills do not read as links', () => {
  assert.match(STYLES, /a\.pill\{text-decoration:none;\}/);
});

// --- 3. server-rendered featured products -----------------------------------

test('the signed-out homepage no longer hides the featured grid or the strip', () => {
  const start = STYLES.indexOf('html.pepx-public .hero-best,');
  const rule = STYLES.slice(start, STYLES.indexOf('display:none;}', start));
  for (const gone of ['#productGrid', '.featured-category-strip', '.featured-category-title']) {
    assert.ok(!rule.includes(gone), gone + ' must no longer be hidden from signed-out visitors');
  }
  // The sections that genuinely need script.js are still hidden.
  for (const kept of ['.hero-best', '.review-collage', '#reviews']) {
    assert.ok(rule.includes(kept), kept + ' still has no content without script.js');
  }
});

test('renderFeaturedGrid emits crawlable product links and nothing invented', () => {
  const html = renderFeaturedGrid({
    products: [
      product({ id: 1, slug: 'ipamorelin', name: 'Ipamorelin', path: '/products/ipamorelin' }),
      product({ id: 2, slug: 'tb-500', name: 'TB-500', path: '/products/tb-500' })
    ]
  });
  assert.match(html, /href="\/products\/ipamorelin"/);
  assert.match(html, /href="\/products\/tb-500"/);
  assert.match(html, />Ipamorelin</);
  // No cart controls: the signed-out page cannot add to a cart.
  assert.doesNotMatch(html, /add-btn|addToCart|data-add/);
  // It returns cards only - server.js supplies the surrounding grid <div>.
  assert.doesNotMatch(html.trim(), /^<div/);
});

test('the featured selection is deterministic, so the crawled HTML is stable', () => {
  const products = [
    product({ id: 1, slug: 'zeta', name: 'Zeta', inStock: true, path: '/products/zeta' }),
    product({ id: 2, slug: 'alpha', name: 'Alpha', inStock: false, path: '/products/alpha' }),
    product({ id: 3, slug: 'beta', name: 'Beta', inStock: true, path: '/products/beta' })
  ];
  const first = renderFeaturedGrid({ products });
  const again = renderFeaturedGrid({ products: products.slice().reverse() });
  assert.equal(first, again, 'two fetches must produce identical HTML');
  // In stock first, then alphabetical.
  assert.ok(first.indexOf('/products/beta') < first.indexOf('/products/zeta'));
  assert.ok(first.indexOf('/products/zeta') < first.indexOf('/products/alpha'));
});

test('renderFeaturedGrid is honest about an empty catalogue', () => {
  assert.equal(renderFeaturedGrid({ products: [] }), '');
  assert.equal(renderFeaturedGrid({ products: null }), '');
});

test('the homepage route injects the cards into the existing grid', () => {
  assert.match(SERVER, /const FEATURED_GRID_MARKER = '<div class="grid" id="productGrid"><\/div>';/);
  assert.ok(INDEX.includes('<div class="grid" id="productGrid"></div>'),
    'index.html must still carry the marker server.js splits on');
  assert.match(SERVER, /INDEX_HTML_PUBLIC_HEAD \+ grid \+ INDEX_HTML_PUBLIC_TAIL/);
});

test('a database failure degrades the homepage instead of breaking it', () => {
  const start = SERVER.indexOf("app.get(['/', '/index.html']");
  const block = SERVER.slice(start, SERVER.indexOf('// ---', start));
  // Missing markers -> the PR #15 page. A failed query -> the page without cards.
  assert.match(block, /if \(INDEX_HTML_PUBLIC_HEAD === null\)[\s\S]{0,160}send\(INDEX_HTML_PUBLIC\)/);
  assert.match(block, /catch \(error\) \{[\s\S]{0,300}\}\s*\n\s*res\.type\('html'\)/);
});

test('the signed-out homepage still varies on cookie and signed-in visitors still get the file', () => {
  const start = SERVER.indexOf("app.get(['/', '/index.html']");
  const block = SERVER.slice(start, SERVER.indexOf('// ---', start));
  assert.match(block, /req\.user \|\| \(req\.session && req\.session\.userId\)[\s\S]{0,120}sendFile\(INDEX_HTML_PATH\)/);
  assert.match(block, /res\.set\('Vary', 'Cookie'\)/);
  assert.doesNotMatch(block, /user-agent|userAgent|googlebot/i, 'branching on the crawler would be cloaking');
});

// --- 4. no public link walks into a login redirect --------------------------

test('no public page links to the gated storefront pages', () => {
  const gated = /href="[^"]*(?:^|\/)?(?:shop|product)\.html/;
  for (const page of PUBLIC_PAGES) {
    const html = read(page);
    const hits = (html.match(/href="[^"]*"/g) || []).filter((h) => gated.test(h));
    assert.deepEqual(hits, [], page + ' still links to a gated storefront page: ' + hits.join(', '));
  }
});

test('the links that remain to private pages are the signed-in ones, and are robots-disallowed', () => {
  // index.html keeps My Account and the cart for signed-in visitors; both are
  // display:none for signed-out visitors and Disallow'd for crawlers.
  for (const marker of [
    '<a href="account.html" class="auth-in-only">',
    'class="icon-btn cart-btn auth-in-only"'
  ]) {
    assert.ok(INDEX.includes(marker), 'the signed-in storefront lost: ' + marker);
  }
  assert.match(STYLES, /html\.pepx-public \.auth-in-only \{ display: none !important; \}/);
  for (const rule of ['Disallow: /account.html', 'Disallow: /checkout.html',
    'Disallow: /shop.html', 'Disallow: /product.html']) {
    assert.ok(SERVER.includes("'" + rule + "'"), 'robots.txt is missing: ' + rule);
  }
});

test('the hero and featured calls to action point at public routes', () => {
  const hero = INDEX.slice(INDEX.indexOf('<div class="btns">'), INDEX.indexOf('<div class="stats">'));
  assert.match(hero, /href="\/shop"/);
  assert.match(hero, /href="\/coas.html"/);
  // The old CTA carried a returnTo parameter, which robots.txt disallows.
  assert.doesNotMatch(INDEX, /returnTo=/);
});

// --- 5. footer internal links ----------------------------------------------

test('the homepage footer links Shop and Certificates of Analysis', () => {
  const footer = INDEX.slice(INDEX.indexOf('<div class="footer-quick-links">'), INDEX.indexOf('</footer>'));
  assert.match(footer, /href="\/shop">Shop</);
  assert.match(footer, /href="\/coas\.html">Certificates of Analysis</);
});

test('the rendered public pages carry the same two footer links', () => {
  const PAGE = read('services/public-page.js');
  assert.match(PAGE, /href="\/shop">All Products</);
  assert.match(PAGE, /href="\/coas\.html">Certificates of Analysis</);
});

// --- 6. bidirectional product <-> COA linking -------------------------------

test('a product page deep-links to its own certificates', () => {
  assert.equal(coaPathForProduct(product({ id: 42 })), '/coas.html?product_id=42');
  const html = renderProductPage({
    origin: 'https://pepxresearch.com',
    product: product({ id: 42, publishedCoaCount: 2 }),
    categories: [],
    indexable: false
  });
  assert.match(html, /href="\/coas\.html\?product_id=42"/);
  assert.match(html, /certificates of analysis/i);
});

test('a product with no published certificate claims none', () => {
  const html = renderProductPage({
    origin: 'https://pepxresearch.com',
    product: product({ publishedCoaCount: 0 }),
    categories: [],
    indexable: false
  });
  assert.doesNotMatch(html, /product_id=/);
  assert.doesNotMatch(html, /product-detail-coa/);
});

test('coas.js still reads the query parameter the deep link uses', () => {
  assert.match(read('coas.js'), /get\('product_id'\)/);
});

test('renderCoaIndex links back to only the products that have a certificate', () => {
  const html = renderCoaIndex({
    products: [
      product({ id: 1, slug: 'tb-500', name: 'TB-500', path: '/products/tb-500', publishedCoaCount: 3 }),
      product({ id: 2, slug: 'no-coa', name: 'No COA', path: '/products/no-coa', publishedCoaCount: 0 })
    ]
  });
  assert.match(html, /href="\/products\/tb-500"/);
  assert.doesNotMatch(html, /no-coa/);
  assert.match(html, /3 published certificates/);
  // It must not imply coverage the site does not have.
  assert.match(html, /coverage varies by product and batch/);
  assert.doesNotMatch(html, /every (batch|product)/i);
});

test('renderCoaIndex emits nothing when no certificate is published', () => {
  assert.equal(renderCoaIndex({ products: [product({ publishedCoaCount: 0 })] }), '');
  assert.equal(renderCoaIndex({ products: [] }), '');
});

test('the /coas.html route injects that list above the client-rendered grid', () => {
  assert.match(SERVER, /app\.get\('\/coas\.html', async \(req, res, next\) => \{/);
  assert.match(SERVER, /const COAS_INDEX_MARKER = '\\n    <section class="section section-shop">';/);
  assert.ok(COAS.includes('\n    <section class="section section-shop">'),
    'coas.html must still carry the injection point');
  // Unreadable file, missing marker or a failed query all fall through to the
  // static file rather than erroring.
  const block = SERVER.slice(SERVER.indexOf("app.get('/coas.html'"));
  assert.match(block.slice(0, 700), /if \(COAS_HTML_HEAD === null\) return next\(\);/);
  assert.match(block.slice(0, 700), /if \(!block\) return next\(\);/);
});

test('the coas.html route is registered above the HTML auth gate and express.static', () => {
  const coasAt = SERVER.indexOf("app.get('/coas.html'");
  const gateAt = SERVER.indexOf('if (PUBLIC_HTML_PATHS.has(req.path))');
  const staticAt = SERVER.indexOf('return serveStaticAssets(req, res, next)');
  assert.ok(coasAt !== -1 && gateAt !== -1 && staticAt !== -1);
  assert.ok(coasAt < gateAt, 'the route must answer before the auth gate');
  assert.ok(coasAt < staticAt, 'the route must answer before express.static');
});

// --- 7. noindex on the account-gateway pages --------------------------------

test('login and register are noindex, follow', () => {
  for (const page of ['login.html', 'register.html']) {
    const html = read(page);
    assert.match(html, /<meta name="robots" content="noindex, follow">/, page + ' must be noindex');
    assert.doesNotMatch(html, /content="index, follow/, page + ' still advertises itself as indexable');
    // follow, not nofollow: these pages link onwards and that equity should flow.
    assert.doesNotMatch(html, /nofollow/);
  }
});

test('the noindex pages are not in the sitemap', () => {
  const block = SERVER.slice(
    SERVER.indexOf('const STATIC_SITEMAP_PATHS = ['),
    SERVER.indexOf('];', SERVER.indexOf('const STATIC_SITEMAP_PATHS = ['))
  );
  for (const page of ['/login.html', '/register.html']) {
    assert.ok(!block.includes("'" + page + "'"), 'sitemap must not list ' + page);
  }
});

// --- 9. FAQPage structured data --------------------------------------------

test('the homepage carries FAQPage markup that matches the visible answers', () => {
  const blocks = INDEX.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  const parsed = blocks.map((b) =>
    JSON.parse(b.replace(/^<script type="application\/ld\+json">/, '').replace(/<\/script>$/, ''))
  );
  const faq = parsed.find((d) => d['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage JSON-LD should be present');

  // Every rendered .qa block on the page, and nothing else.
  const qa = [...INDEX.matchAll(/<div class="qa"><div class="q">([\s\S]*?)<span class="ico">/g)]
    .map((m) => m[1].trim());
  assert.ok(qa.length >= 4);
  assert.equal(faq.mainEntity.length, qa.length,
    'the markup must cover exactly the questions on the page');

  const marked = faq.mainEntity.map((q) => q.name);
  for (const question of qa) {
    assert.ok(marked.includes(question), 'FAQPage is missing the visible question: ' + question);
  }

  for (const entry of faq.mainEntity) {
    assert.equal(entry['@type'], 'Question');
    assert.equal(entry.acceptedAnswer['@type'], 'Answer');
    assert.ok(entry.acceptedAnswer.text.length > 20);
    // The answer text is the visible answer, stripped of markup - never HTML
    // the crawler would have to parse, and never copy that is not on the page.
    assert.doesNotMatch(entry.acceptedAnswer.text, /<[a-z/]/i);
    const visible = INDEX.slice(INDEX.indexOf('<div class="faq">'));
    const firstWords = entry.acceptedAnswer.text.split(' ').slice(0, 6).join(' ');
    assert.ok(visible.includes(firstWords),
      'answer text is not on the page: ' + firstWords);
  }
});

test('the FAQ markup does not smuggle in claims the page walked back', () => {
  const faqBlock = INDEX.slice(INDEX.indexOf('"@type": "FAQPage"'));
  assert.doesNotMatch(faqBlock.slice(0, 4000), /every batch is independently lab/i);
  assert.match(faqBlock.slice(0, 4000), /coverage varies by product and batch/);
});

// --- accuracy of the COA page's own metadata -------------------------------

test('coas.html no longer claims every batch is tested', () => {
  assert.doesNotMatch(COAS, /Every batch is independently lab tested/i);
  const desc = COAS.match(/<meta name="description" content="([^"]+)">/);
  assert.ok(desc, 'coas.html should still have a meta description');
  assert.ok(desc[1].length <= 160, 'meta description is ' + desc[1].length + ' chars');
});
