'use strict';

// Regression guard for the public-catalogue work.
//
// Opening /shop, /shop/:category and /products/:slug to anonymous visitors is
// meant to be strictly additive. These tests assert that the gates around
// everything private are still exactly where they were, so a later change
// cannot widen the public surface by accident while the SEO tests keep passing.
//
// They read server.js as source rather than booting the app: importing it opens
// a Postgres pool and a session store, which a unit test has no business doing.
// The live HTTP matrix is run separately and recorded in the pull request.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');

const SERVER = read('server.js');
const CATALOG = read('services/public-catalog.js');
const PAGE = read('services/public-page.js');

function publicHtmlPathsBlock() {
  const start = SERVER.indexOf('const PUBLIC_HTML_PATHS = new Set([');
  assert.ok(start !== -1, 'PUBLIC_HTML_PATHS should still exist');
  const end = SERVER.indexOf(']);', start);
  return SERVER.slice(start, end);
}

test('the gated pages are still absent from PUBLIC_HTML_PATHS', () => {
  const block = publicHtmlPathsBlock();
  for (const page of [
    '/shop.html', '/product.html', '/account.html', '/checkout.html',
    '/admin.html', '/order-confirmation.html', '/public-index.html'
  ]) {
    assert.ok(!block.includes("'" + page + "'"), page + ' must stay gated');
  }
});

test('nothing mutates PUBLIC_HTML_PATHS at runtime', () => {
  assert.doesNotMatch(SERVER, /PUBLIC_HTML_PATHS\s*\.\s*(add|delete|clear)\s*\(/);
});

test('the HTML auth gate still redirects non-public pages to login', () => {
  assert.match(SERVER, /if \(PUBLIC_HTML_PATHS\.has\(req\.path\)\) \{\s*return next\(\);/);
  assert.match(SERVER, /if \(!\(await hydrateAuthenticatedUser\(req\)\)\) \{\s*return res\.redirect\(buildLoginRedirectTarget\(req\)\);/);
});

test('every private API router still carries its auth middleware', () => {
  for (const mount of [
    'app.use("/api/products", requireApiAuth, productsRouter)',
    'app.use("/api/cart", requireApiAuth,',
    'app.use("/api/orders", requireApiAuth,',
    "app.use('/api/checkout/shipping', requireApiAuth,",
    "app.use('/api/checkout/card', requireApiAuth,"
  ]) {
    assert.ok(SERVER.includes(mount), 'missing or altered: ' + mount);
  }
  for (const adminMount of [
    "createAdminProductsRouter(requireAuth)",
    "createAdminVariantsRouter(requireAuth)",
    "createAdminPromosRouter(requireAuth)",
    "createAdminCoasRouter(requireAuth)",
    "createAdminRouter(requireAuth)"
  ]) {
    assert.ok(SERVER.includes(adminMount), 'admin router lost its auth: ' + adminMount);
  }
  assert.match(SERVER, /app\.use\('\/api\/\*', \(req, res\) => \{[\s\S]*?404/);
});

test('the signed-in storefront bundle is still refused to anonymous requests', () => {
  assert.match(
    SERVER,
    /req\.path === '\/script\.js' && !\(await hydrateAuthenticatedUser\(req\)\)[\s\S]{0,80}status\(404\)/
  );
});

test('robots.txt still keeps private areas out of the crawl', () => {
  for (const rule of [
    'Disallow: /api/', 'Disallow: /auth/', 'Disallow: /uploads/',
    'Disallow: /account.html', 'Disallow: /checkout.html',
    'Disallow: /forgot-password.html', 'Disallow: /reset-password.html',
    'Disallow: /admin.html', 'Disallow: /*?returnTo='
  ]) {
    assert.ok(SERVER.includes("'" + rule + "'"), 'robots.txt lost: ' + rule);
  }
});

test('the public catalogue routes hand signed-in visitors back to the existing app', () => {
  for (const route of ["app.get('/shop',", "app.get('/shop/:category',", "app.get('/products/:slug',"]) {
    assert.ok(SERVER.includes(route), 'missing public route: ' + route);
  }
  assert.match(SERVER, /sendSignedInRedirect\(res, '\/shop\.html'\)/);
  assert.match(SERVER, /sendSignedInRedirect\(res, '\/shop\.html\?category='/);
  assert.match(SERVER, /sendSignedInRedirect\(res, '\/product\.html\?product='/);
});

test('the public routes are registered before the alias handler and the HTML gate', () => {
  const shopAt = SERVER.indexOf("app.get('/shop',");
  const aliasAt = SERVER.indexOf('app.get(Object.keys(PAGE_ALIASES)');
  const gateAt = SERVER.indexOf('if (PUBLIC_HTML_PATHS.has(req.path))');
  assert.ok(shopAt !== -1 && aliasAt !== -1 && gateAt !== -1);
  assert.ok(shopAt < aliasAt, 'public routes must run before the /shop alias redirect');
  assert.ok(shopAt < gateAt, 'public routes must run before the HTML auth gate');
});

test('the public branch is on session state, never on user-agent', () => {
  const start = SERVER.indexOf("app.get('/shop',");
  const end = SERVER.indexOf('app.get(Object.keys(PAGE_ALIASES)');
  const block = SERVER.slice(start, end);
  assert.doesNotMatch(block, /user-agent|userAgent|googlebot/i,
    'serving crawlers something different from humans is cloaking');
  assert.match(block, /hydrateAuthenticatedUser\(req\)/);
});

test('the public catalogue layer is read-only and session-blind', () => {
  assert.doesNotMatch(CATALOG, /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER)\b/i);
  assert.doesNotMatch(CATALOG, /req\.(session|user|cookies|headers)/);
  for (const table of ['users', 'orders', 'order_items', 'cart', 'cart_items', 'sessions', 'user_addresses', 'promo']) {
    assert.doesNotMatch(CATALOG, new RegExp('FROM\\s+' + table + '\\b', 'i'), 'must not read ' + table);
  }
});

test('the renderer is pure - no request, session or filesystem access', () => {
  assert.doesNotMatch(PAGE, /req\.|res\.|require\('fs'\)|require\("fs"\)|process\.env/);
});

test('product images are public but nothing else about assets changed', () => {
  assert.doesNotMatch(SERVER, /startsWith\('\/assets\/products\/'\)/,
    'the anonymous 404 on product images should be gone');
  assert.ok(SERVER.includes("const { classifyStaticRequest } = require('./services/static-exposure-policy')"),
    'the static exposure policy from PR #14 must stay wired in');
});

test('the sitemap only ever announces content-eligible product URLs', () => {
  assert.match(SERVER, /publicCatalog\.indexableProducts\(\)/);
  assert.doesNotMatch(SERVER, /publicCatalog\.listActive\(\)[\s\S]{0,200}sitemapEntry/,
    'the sitemap must not be built from the full product list');
  assert.match(CATALOG, /function isIndexable\(product\)/);
});

test('the sitemap stays focused on the pages meant to earn traffic', () => {
  const start = SERVER.indexOf('const STATIC_SITEMAP_PATHS = [');
  const block = SERVER.slice(start, SERVER.indexOf('];', start));

  for (const wanted of ['/', '/shop', '/coas.html']) {
    assert.ok(block.includes("'" + wanted + "'"), 'sitemap should list ' + wanted);
  }
  for (const excluded of [
    '/shipping-policy.html', '/privacy-policy.html', '/refund-policy.html',
    '/terms-conditions.html', '/terms-of-service.html'
  ]) {
    assert.ok(!block.includes("'" + excluded + "'"), 'sitemap should not list ' + excluded);
  }
  for (const never of ['/shop.html', '/product.html', '/account.html', '/checkout.html', '/admin.html', '/login.html']) {
    assert.ok(!block.includes("'" + never + "'"), 'sitemap must never list ' + never);
  }
});
