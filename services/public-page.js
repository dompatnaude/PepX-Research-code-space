'use strict';

// ---------------------------------------------------------------------------
// Server-rendered HTML for the signed-out public catalogue.
//
// Pure functions: data in, HTML string out. No database, no session, no
// filesystem - which is what makes the SEO output (title, description, H1,
// canonical, Open Graph, JSON-LD) testable without booting the app.
//
// Content rule, enforced by construction: every visible fact on these pages
// comes from a column in the products / product_variants / coas tables. There
// is no template copy that asserts purity, testing, certification, efficacy,
// dosing, safety or regulatory status. Where a product has no description, the
// description block is omitted rather than filled - an empty field is not an
// invitation to write something.
//
// Every interpolated value is escaped. Product names and descriptions are
// admin-authored, and admin-authored is not the same as trusted.
// ---------------------------------------------------------------------------

const SITE_NAME = 'PepX Research';
const BRAND_SUFFIX = ' | ' + SITE_NAME;
const SHARE_IMAGE = '/assets/logo-pepx-navbar.png';
const META_DESCRIPTION_MAX = 155;
const RESEARCH_USE_NOTICE = 'For research use only, Not for human consumption.';

const INDEXABLE_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1';
const NOINDEX_ROBOTS = 'noindex, follow';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON-LD sits inside a <script>, so an HTML-escaped string would be wrong -
// the JSON has to stay parseable. Escape the three characters that matter as
// JSON unicode instead: the payload keeps its exact value, and nothing that
// looks like markup survives into the document. Google's structured-data
// guidance asks for < specifically.
function jsonLdBlock(data) {
  const json = JSON.stringify(data, null, 2)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026');
  return '<script type="application/ld+json">\n' + json + '\n</script>';
}

function collapse(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/** Trim to a word boundary so a description is never cut mid-word. */
function truncateForMeta(text, max = META_DESCRIPTION_MAX) {
  const flat = collapse(text);
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '') + '…';
}

function formatPrice(value) {
  if (value == null) return '';
  return '$' + Number(value).toFixed(2);
}

function priceLabel(product) {
  if (product.priceFrom == null) return '';
  if (product.priceTo != null && product.priceTo !== product.priceFrom) {
    return 'From ' + formatPrice(product.priceFrom);
  }
  return formatPrice(product.priceFrom);
}

function absolute(origin, path) {
  return String(origin).replace(/\/+$/, '') + path;
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

// --- SEO field builders -----------------------------------------------------

function buildShopSeo({ origin, products, categories, category = null }) {
  const count = products.length;

  if (category) {
    return {
      title: category.name + ' Research Compounds' + BRAND_SUFFIX,
      h1: category.name + ' Research Compounds',
      description: collapse(
        category.name + ' research compounds from ' + SITE_NAME + '. ' +
        count + ' ' + plural(count, 'product', 'products') + ' in this category. ' +
        RESEARCH_USE_NOTICE
      ),
      canonical: absolute(origin, category.path),
      robots: INDEXABLE_ROBOTS
    };
  }

  return {
    title: 'Research Compounds' + BRAND_SUFFIX,
    h1: 'Research Compounds',
    description: collapse(
      'Browse the ' + SITE_NAME + ' catalogue of ' + count + ' research ' +
      plural(count, 'compound', 'compounds') + ' across ' + categories.length + ' ' +
      plural(categories.length, 'category', 'categories') + '. ' + RESEARCH_USE_NOTICE
    ),
    canonical: absolute(origin, '/shop'),
    robots: INDEXABLE_ROBOTS
  };
}

function buildProductSeo({ origin, product, indexable }) {
  // With a description, the description is the meta description. Without one,
  // fall back to a statement of record built only from real columns - and the
  // page is noindex anyway, so this text is for humans and link previews.
  const description = product.description
    ? truncateForMeta(product.description)
    : collapse(
        product.name +
        (product.category ? ' — ' + product.category + ' research compound' : '') +
        ' from ' + SITE_NAME + '. ' +
        (product.variants.length
          ? 'Available in ' + product.variants.length + ' ' +
            plural(product.variants.length, 'size', 'sizes') + '. '
          : '') +
        RESEARCH_USE_NOTICE
      );

  return {
    title: product.name + BRAND_SUFFIX,
    h1: product.name,
    description,
    canonical: absolute(origin, product.path),
    robots: indexable ? INDEXABLE_ROBOTS : NOINDEX_ROBOTS
  };
}

// --- structured data --------------------------------------------------------

function breadcrumbList(origin, trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absolute(origin, item.path)
    }))
  };
}

function productJsonLd({ origin, product }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url: absolute(origin, product.path),
    brand: { '@type': 'Organization', name: SITE_NAME, '@id': absolute(origin, '/#organization') }
  };

  // Only real values. No description is emitted when the column is empty.
  if (product.description) data.description = collapse(product.description);
  if (product.sku) data.sku = product.sku;
  if (product.category) data.category = product.category;
  if (product.imageUrl) data.image = absolute(origin, product.imageUrl);

  const availability = product.inStock
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';

  if (product.priceFrom != null) {
    if (product.priceTo != null && product.priceTo !== product.priceFrom) {
      data.offers = {
        '@type': 'AggregateOffer',
        priceCurrency: 'USD',
        lowPrice: Number(product.priceFrom).toFixed(2),
        highPrice: Number(product.priceTo).toFixed(2),
        offerCount: product.variants.length || 1,
        availability,
        url: absolute(origin, product.path)
      };
    } else {
      data.offers = {
        '@type': 'Offer',
        priceCurrency: 'USD',
        price: Number(product.priceFrom).toFixed(2),
        availability,
        url: absolute(origin, product.path)
      };
    }
  }

  return data;
}

function itemListJsonLd({ origin, products }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: products.length,
    itemListElement: products.map((product, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absolute(origin, product.path),
      name: product.name
    }))
  };
}

// --- shared shell -----------------------------------------------------------

function head({ seo, origin, ogType = 'website', jsonLd = [] }) {
  const url = seo.canonical;
  const image = absolute(origin, SHARE_IMAGE);
  return [
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">',
    '<title>' + escapeHtml(seo.title) + '</title>',
    '<meta name="description" content="' + escapeHtml(seo.description) + '">',
    '<link rel="canonical" href="' + escapeHtml(url) + '">',
    '<meta name="robots" content="' + escapeHtml(seo.robots) + '">',
    '<meta property="og:type" content="' + escapeHtml(ogType) + '">',
    '<meta property="og:site_name" content="' + escapeHtml(SITE_NAME) + '">',
    '<meta property="og:title" content="' + escapeHtml(seo.title) + '">',
    '<meta property="og:description" content="' + escapeHtml(seo.description) + '">',
    '<meta property="og:url" content="' + escapeHtml(url) + '">',
    '<meta property="og:image" content="' + escapeHtml(image) + '">',
    '<meta property="og:image:alt" content="' + escapeHtml(SITE_NAME) + '">',
    '<meta property="og:locale" content="en_US">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + escapeHtml(seo.title) + '">',
    '<meta name="twitter:description" content="' + escapeHtml(seo.description) + '">',
    '<meta name="twitter:image" content="' + escapeHtml(image) + '">',
    '<link rel="stylesheet" href="/styles.css">',
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png">',
    '<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">'
  ].concat(jsonLd.map(jsonLdBlock)).join('\n  ');
}

// Signed-out header. No cart or account controls: those are driven by
// script.js, which is served to signed-in visitors only.
function header(categories) {
  const dropdown = categories
    .map((c) => '<a href="' + escapeHtml(c.path) + '">' + escapeHtml(c.name) + '</a>')
    .join('');
  return [
    '<div class="notice-bar">' + escapeHtml(RESEARCH_USE_NOTICE) + '</div>',
    '<header><div class="container nav">',
    '<a href="/" class="logo" aria-label="' + escapeHtml(SITE_NAME) + '">',
    '<img src="' + SHARE_IMAGE + '" alt="' + escapeHtml(SITE_NAME) + '" class="logo-image" width="872" height="464">',
    '</a>',
    '<nav class="menu" id="site-menu">',
    '<a href="/">Home</a>',
    '<div class="menu-item"><a href="/shop" class="menu-link">Shop <span class="menu-caret">▼</span></a>',
    '<div class="menu-dropdown"><a href="/shop">All Products</a>' + dropdown + '</div></div>',
    '<a href="/coas.html">View COAs</a>',
    '<a href="/#faq">FAQ</a>',
    '<a href="/#about">About</a>',
    '<a href="/login.html">Log in</a>',
    '</nav>',
    '</div></header>'
  ].join('\n');
}

function breadcrumbNav(trail) {
  const parts = trail.map((item, i) =>
    i === trail.length - 1
      ? '<span aria-current="page">' + escapeHtml(item.name) + '</span>'
      : '<a href="' + escapeHtml(item.path) + '">' + escapeHtml(item.name) + '</a>'
  );
  return '<nav class="breadcrumbs" aria-label="Breadcrumb">' + parts.join(' <span aria-hidden="true">/</span> ') + '</nav>';
}

function footer(categories) {
  const catLinks = categories
    .map((c) => '<a class="footer-inline-link" href="' + escapeHtml(c.path) + '">' + escapeHtml(c.name) + '</a>')
    .join('');
  return [
    '<footer><div class="container">',
    '<div class="footer-top">',
    '<div class="footer-brand-contact">',
    '<div class="logo" aria-label="' + escapeHtml(SITE_NAME) + '"><img src="' + SHARE_IMAGE + '" alt="' + escapeHtml(SITE_NAME) + '" class="logo-image" width="872" height="464"></div>',
    '<div class="footer-contact"><h4>Contact Us</h4>',
    '<p class="footer-small"><a href="mailto:pepxaminos@gmail.com">pepxaminos@gmail.com</a></p>',
    '<address class="footer-small">PX Research LLC<br>11 Douglas Ave<br>Suite 253 #1184<br>Elgin, IL 60120<br>United States</address>',
    '</div></div>',
    '<div class="footer-link-columns">',
    '<div class="footer-quick-links"><h4>Catalogue</h4><div class="footer-link-list">',
    '<a class="footer-inline-link" href="/shop">All Products</a>' + catLinks,
    '<a class="footer-inline-link" href="/coas.html">Certificates of Analysis</a>',
    '</div></div>',
    '<div class="footer-policies" aria-label="Footer Policies"><h4>Policies</h4><div class="footer-link-list">',
    '<a class="footer-inline-link" href="/shipping-policy.html">Shipping Policy</a>',
    '<a class="footer-inline-link" href="/refund-policy.html">Refund Policy</a>',
    '<a class="footer-inline-link" href="/privacy-policy.html">Privacy Policy</a>',
    '<a class="footer-inline-link" href="/terms-conditions.html">Terms &amp; Conditions</a>',
    '</div></div>',
    '</div></div>',
    '<p class="footer-small">' + escapeHtml(RESEARCH_USE_NOTICE) + '</p>',
    '</div></footer>'
  ].join('\n');
}

function document_({ seo, origin, ogType, jsonLd, categories, body }) {
  return [
    '<!DOCTYPE html>',
    '<html lang="en" class="pepx-public">',
    '<head>',
    '  ' + head({ seo, origin, ogType, jsonLd }),
    '</head>',
    '<body>',
    header(categories),
    body,
    footer(categories),
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

// --- cards ------------------------------------------------------------------

function productCard(product) {
  const price = priceLabel(product);
  const media = product.imageUrl
    ? '<img class="product-card-image" src="' + escapeHtml(product.imageUrl) + '" alt="' + escapeHtml(product.name) + '" loading="lazy" decoding="async">'
    : '<div class="product-card-orb" aria-hidden="true"></div>';

  return [
    '<article class="card product-card">',
    '<a class="product-card-link" href="' + escapeHtml(product.path) + '">',
    media,
    '<h3 class="product-card-title">' + escapeHtml(product.name) + '</h3>',
    '</a>',
    product.category ? '<p class="tag">' + escapeHtml(product.category) + '</p>' : '',
    price ? '<p class="product-card-price">' + escapeHtml(price) + '</p>' : '',
    '<p class="product-card-stock">' + (product.inStock ? 'In stock' : 'Out of stock') + '</p>',
    '<a class="btn ghost" href="' + escapeHtml(product.path) + '">View details</a>',
    '</article>'
  ].filter(Boolean).join('\n');
}

// --- pages ------------------------------------------------------------------

function renderShopPage({ origin, products, categories, category = null }) {
  const seo = buildShopSeo({ origin, products, categories, category });

  const trail = [{ name: 'Home', path: '/' }, { name: 'Research Compounds', path: '/shop' }];
  if (category) trail.push({ name: category.name, path: category.path });

  const chips = [{ name: 'All', path: '/shop', active: !category }]
    .concat(categories.map((c) => ({ name: c.name, path: c.path, active: !!category && c.slug === category.slug })))
    .map((c) =>
      '<a class="pill' + (c.active ? ' pill-active' : '') + '" href="' + escapeHtml(c.path) + '"' +
      (c.active ? ' aria-current="page"' : '') + '>' + escapeHtml(c.name) + '</a>'
    ).join('');

  const body = [
    '<main class="container page-shop">',
    breadcrumbNav(trail),
    '<h1>' + escapeHtml(seo.h1) + '</h1>',
    '<p class="sub">' + escapeHtml(seo.description) + '</p>',
    '<nav class="category-strip" aria-label="Product categories">' + chips + '</nav>',
    products.length
      ? '<div class="grid grid-shop">\n' + products.map(productCard).join('\n') + '\n</div>'
      : '<p class="sub">No products are listed in this category right now.</p>',
    '<section class="shop-access">',
    '<h2>Ordering</h2>',
    '<p>Ordering is available to registered account holders. <a href="/login.html">Log in</a> or <a href="/register.html">create an account</a> to place an order.</p>',
    '</section>',
    '</main>'
  ].join('\n');

  return document_({
    seo,
    origin,
    ogType: 'website',
    jsonLd: [
      breadcrumbList(origin, trail),
      itemListJsonLd({ origin, products })
    ],
    categories,
    body
  });
}

function renderProductPage({ origin, product, related = [], categories, indexable }) {
  const seo = buildProductSeo({ origin, product, indexable });

  const trail = [{ name: 'Home', path: '/' }, { name: 'Research Compounds', path: '/shop' }];
  if (product.category) trail.push({ name: product.category, path: '/shop/' + product.categorySlug });
  trail.push({ name: product.name, path: product.path });

  const media = product.imageUrl
    ? '<img src="' + escapeHtml(product.imageUrl) + '" alt="' + escapeHtml(product.name) + '" width="600" height="600" decoding="async">'
    : '<div class="product-detail-orb" aria-hidden="true"></div>';

  // Specification rows are built from columns, never from template prose.
  const rows = [];
  if (product.category) rows.push(['Category', product.category]);
  if (product.sku) rows.push(['SKU', product.sku]);
  if (product.variants.length) {
    rows.push([
      plural(product.variants.length, 'Size', 'Sizes'),
      product.variants.map((v) => v.name + (v.price != null ? ' — ' + formatPrice(v.price) : '')).join(', ')
    ]);
  }
  rows.push(['Availability', product.inStock ? 'In stock' : 'Out of stock']);

  const specTable = '<table class="product-spec"><tbody>' + rows.map(
    ([k, v]) => '<tr><th scope="row">' + escapeHtml(k) + '</th><td>' + escapeHtml(v) + '</td></tr>'
  ).join('') + '</tbody></table>';

  const descriptionBlock = product.description
    ? '<section class="product-detail-description"><h2>Product details</h2>' +
      collapse(product.description)
        .split(/(?:\r?\n){2,}/)
        .map((para) => '<p>' + escapeHtml(para) + '</p>')
        .join('') +
      '</section>'
    : '';

  // Only shown when published COA records actually exist for this product.
  const coaBlock = product.publishedCoaCount > 0
    ? '<section class="product-detail-coa"><h2>Certificates of analysis</h2>' +
      '<p>' + product.publishedCoaCount + ' published ' +
      plural(product.publishedCoaCount, 'certificate of analysis', 'certificates of analysis') +
      ' for this product. <a href="/coas.html">View certificates of analysis</a>.</p></section>'
    : '';

  const relatedBlock = related.length
    ? '<section class="product-detail-related"><h2>More in ' + escapeHtml(product.category || 'the catalogue') + '</h2>' +
      '<div class="grid grid-shop">' + related.map(productCard).join('\n') + '</div></section>'
    : '';

  const price = priceLabel(product);

  const body = [
    '<main class="container page-product">',
    breadcrumbNav(trail),
    '<section class="product-detail-shell">',
    '<div class="product-detail-media">' + media + '</div>',
    '<div class="product-detail-copy">',
    product.category
      ? '<a class="tag" href="/shop/' + escapeHtml(product.categorySlug) + '">' + escapeHtml(product.category) + '</a>'
      : '',
    '<h1>' + escapeHtml(seo.h1) + '</h1>',
    price ? '<p class="product-detail-price">' + escapeHtml(price) + '</p>' : '',
    specTable,
    '<div class="product-detail-actions">',
    '<a class="btn primary" href="/login.html">Log in to order</a>',
    '<a class="btn ghost" href="/register.html">Create an account</a>',
    '</div>',
    '<p class="footer-small">' + escapeHtml(RESEARCH_USE_NOTICE) + '</p>',
    '</div>',
    '</section>',
    descriptionBlock,
    coaBlock,
    relatedBlock,
    '</main>'
  ].filter(Boolean).join('\n');

  return document_({
    seo,
    origin,
    ogType: 'product',
    jsonLd: [
      breadcrumbList(origin, trail),
      productJsonLd({ origin, product })
    ],
    categories,
    body
  });
}

function renderNotFoundPage({ origin, categories = [] }) {
  const seo = {
    title: 'Page not found' + BRAND_SUFFIX,
    h1: 'Page not found',
    description: 'That page does not exist. Browse the ' + SITE_NAME + ' catalogue instead.',
    canonical: absolute(origin, '/shop'),
    robots: NOINDEX_ROBOTS
  };
  const body = [
    '<main class="container page-shop">',
    '<h1>' + escapeHtml(seo.h1) + '</h1>',
    '<p class="sub">That page does not exist. <a href="/shop">Browse all research compounds</a>.</p>',
    '</main>'
  ].join('\n');
  return document_({ seo, origin, ogType: 'website', jsonLd: [], categories, body });
}

module.exports = {
  renderShopPage,
  renderProductPage,
  renderNotFoundPage,
  buildShopSeo,
  buildProductSeo,
  productJsonLd,
  itemListJsonLd,
  breadcrumbList,
  escapeHtml,
  truncateForMeta,
  priceLabel,
  SITE_NAME,
  META_DESCRIPTION_MAX,
  INDEXABLE_ROBOTS,
  NOINDEX_ROBOTS
};
