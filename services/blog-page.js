'use strict';

// ---------------------------------------------------------------------------
// Server-rendered blog pages: /blog and /blog/<slug>.
//
// Pure renderer, like services/public-page.js: no request, no session, no
// database, no filesystem. It is handed article objects from content/blog and
// returns a complete HTML document.
//
// Article bodies are structured blocks, never HTML strings. Every value that
// reaches the output goes through escapeHtml(), and the only markup an article
// can produce is the fixed set of tags below, so a typo - or a paste - in a
// content file cannot inject script into a page.
// ---------------------------------------------------------------------------

const {
  escapeHtml, truncateForMeta, document_, breadcrumbNav, absolute,
  SITE_NAME, BRAND_SUFFIX, SHARE_IMAGE, RESEARCH_USE_NOTICE,
  INDEXABLE_ROBOTS, NOINDEX_ROBOTS
} = require('./public-page');

const BLOG_PATH = '/blog';
const BLOG_TITLE = 'PepX Research Blog';
const BLOG_TAGLINE = 'PUSH. EXCEL. PREVAIL.';
const BLOG_SUBTITLE = 'Research Education. Testing. Quality.';
const BLOG_INTRO =
  'Educational resources on research compounds, analytical testing, quality standards ' +
  'and updates from PepX Research. Written for a better informed research community.';
const BLOG_DESCRIPTION =
  'Educational articles from PepX Research on research compounds, analytical testing ' +
  'methods, certificates of analysis and quality standards.';

// An article may link inside this site and nowhere else. Off-site links, and
// the gated storefront pages that answer signed-out visitors with a login
// redirect, are rendered as plain text rather than as a link.
// One leading slash only: "//example.com" is protocol-relative and off-site.
const INTERNAL_HREF = /^\/(?!\/)[A-Za-z0-9\-._~/]*(?:\?[A-Za-z0-9\-._~/=&%]*)?(?:#[A-Za-z0-9\-_]*)?$/;
const GATED_HREF = /^\/(?:shop|product|account|checkout|admin|order-confirmation|public-index)\.html\b/i;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** "2026-09-10" -> "Sep 10, 2026". Parsed by parts: no timezone can shift it. */
function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  return MONTHS[Number(m[2]) - 1] + ' ' + Number(m[3]) + ', ' + m[1];
}

// --- inline and block rendering ---------------------------------------------

function inline(nodes) {
  const list = Array.isArray(nodes) ? nodes : [nodes];
  return list.map((node) => {
    if (typeof node === 'string') return escapeHtml(node);
    if (!node || typeof node !== 'object' || typeof node.text !== 'string') return '';
    const text = escapeHtml(node.text);
    if (node.href && INTERNAL_HREF.test(node.href) && !GATED_HREF.test(node.href)) {
      return '<a href="' + escapeHtml(node.href) + '">' + text + '</a>';
    }
    if (node.strong) return '<strong>' + text + '</strong>';
    return text;
  }).join('');
}

function block(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return '';
  if (b.h2 != null) return '<h2>' + inline(b.h2) + '</h2>';
  if (b.h3 != null) return '<h3>' + inline(b.h3) + '</h3>';
  if (b.p != null) return '<p>' + inline(b.p) + '</p>';
  if (b.note != null) return '<p class="article-note">' + inline(b.note) + '</p>';
  if (Array.isArray(b.ul)) return '<ul>' + b.ul.map((i) => '<li>' + inline(i) + '</li>').join('') + '</ul>';
  if (Array.isArray(b.ol)) return '<ol>' + b.ol.map((i) => '<li>' + inline(i) + '</li>').join('') + '</ol>';
  return '';
}

/** The article body as HTML. Unknown block shapes render as nothing. */
function renderBody(body) {
  return (body || []).map(block).filter(Boolean).join('\n');
}

/** Plain text of a body, for length checks and tests. Never used as markup. */
function bodyText(body) {
  const flat = (nodes) => (Array.isArray(nodes) ? nodes : [nodes])
    .map((x) => (typeof x === 'string' ? x : (x && x.text) || '')).join('');
  return (body || []).map((b) => {
    if (Array.isArray(b.ul)) return b.ul.map(flat).join(' ');
    if (Array.isArray(b.ol)) return b.ol.map(flat).join(' ');
    return flat(b.h2 != null ? b.h2 : b.h3 != null ? b.h3 : b.p != null ? b.p : b.note);
  }).join(' ').replace(/\s+/g, ' ').trim();
}

// --- SEO --------------------------------------------------------------------

function articleSeo({ origin, article }) {
  const indexable = article.status === 'published' && article.noindex !== true;
  return {
    title: article.metaTitle || (article.title + BRAND_SUFFIX),
    h1: article.title,
    description: truncateForMeta(article.metaDescription || article.excerpt),
    canonical: absolute(origin, article.path || (BLOG_PATH + '/' + article.slug)),
    robots: indexable ? INDEXABLE_ROBOTS : NOINDEX_ROBOTS
  };
}

function blogIndexSeo({ origin }) {
  return {
    title: BLOG_TITLE + ' | Research Compound Education',
    h1: BLOG_TITLE,
    description: truncateForMeta(BLOG_DESCRIPTION),
    canonical: absolute(origin, BLOG_PATH),
    robots: INDEXABLE_ROBOTS
  };
}

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

/**
 * BlogPosting for one article. Author and publisher are the organisation:
 * there is no named byline on these articles and inventing one would be a
 * fabricated credential.
 */
function articleJsonLd({ origin, article, seo }) {
  const org = {
    '@type': 'Organization',
    name: SITE_NAME,
    url: absolute(origin, '/'),
    logo: { '@type': 'ImageObject', url: absolute(origin, SHARE_IMAGE) }
  };
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: seo.description,
    datePublished: article.datePublished,
    dateModified: article.dateUpdated || article.datePublished,
    author: org,
    publisher: org,
    mainEntityOfPage: { '@type': 'WebPage', '@id': seo.canonical },
    url: seo.canonical,
    image: absolute(origin, SHARE_IMAGE),
    inLanguage: 'en-US'
  };
  if (article.category) data.articleSection = article.category;
  return data;
}

function blogJsonLd({ origin, articles }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    url: absolute(origin, BLOG_PATH),
    publisher: { '@type': 'Organization', name: SITE_NAME, url: absolute(origin, '/') },
    inLanguage: 'en-US',
    blogPost: articles.map((a) => ({
      '@type': 'BlogPosting',
      headline: a.title,
      description: a.excerpt,
      datePublished: a.datePublished,
      dateModified: a.dateUpdated || a.datePublished,
      url: absolute(origin, a.path)
    }))
  };
}

// --- cards ------------------------------------------------------------------

function meta(article) {
  return '<p class="article-meta">' +
    (article.category ? '<span class="article-category">' + escapeHtml(article.category) + '</span>' : '') +
    '<time datetime="' + escapeHtml(article.datePublished) + '">' +
    escapeHtml(formatDate(article.datePublished)) + '</time></p>';
}

function featuredCard(article) {
  return [
    '<article class="card blog-featured">',
    '<div class="blog-featured-body">',
    '<p class="article-meta"><span class="article-category">Featured article</span>' +
      '<time datetime="' + escapeHtml(article.datePublished) + '">' +
      escapeHtml(formatDate(article.datePublished)) + '</time></p>',
    '<h2><a href="' + escapeHtml(article.path) + '">' + escapeHtml(article.title) + '</a></h2>',
    '<p class="blog-excerpt">' + escapeHtml(article.excerpt) + '</p>',
    '<a class="btn primary" href="' + escapeHtml(article.path) + '">Read article &#8594;</a>',
    '</div>',
    '</article>'
  ].join('\n');
}

function articleCard(article) {
  return [
    '<article class="card blog-card">',
    meta(article),
    '<h2 class="blog-card-title"><a href="' + escapeHtml(article.path) + '">' +
      escapeHtml(article.title) + '</a></h2>',
    '<p class="blog-excerpt">' + escapeHtml(article.excerpt) + '</p>',
    '<a class="blog-card-link" href="' + escapeHtml(article.path) + '">Read article &#8594;</a>',
    '</article>'
  ].join('\n');
}

// --- pages ------------------------------------------------------------------

function renderBlogIndex({ origin, articles, categories = [] }) {
  const seo = blogIndexSeo({ origin });
  const [featured, ...rest] = articles;

  const body = [
    '<main class="container page-blog">',
    breadcrumbNav([{ name: 'Home', path: '/' }, { name: 'Blog', path: BLOG_PATH }]),
    '<header class="blog-hero">',
    '<p class="hero-tagline">' + escapeHtml(BLOG_TAGLINE) + '</p>',
    '<h1>' + escapeHtml(seo.h1) + '</h1>',
    '<p class="blog-hero-sub">' + escapeHtml(BLOG_SUBTITLE) + '</p>',
    '<p class="blog-hero-intro">' + escapeHtml(BLOG_INTRO) + '</p>',
    '</header>',
    featured ? '<section class="section blog-featured-section" aria-label="Featured article">' +
      featuredCard(featured) + '</section>' : '',
    rest.length
      ? '<section class="section blog-list" aria-label="All articles">' +
        '<div class="grid blog-grid">' + rest.map(articleCard).join('\n') + '</div></section>'
      : '',
    !articles.length
      ? '<section class="section"><p class="sub">No articles have been published yet. ' +
        'In the meantime, browse the <a href="/shop">research compound catalogue</a> or the ' +
        '<a href="/coas.html">certificates of analysis</a>.</p></section>'
      : '',
    '<section class="section blog-outro">',
    '<p class="sub">Looking for product information instead? Browse the ' +
      '<a href="/shop">full catalogue</a> or view the ' +
      '<a href="/coas.html">published certificates of analysis</a>.</p>',
    '</section>',
    '</main>'
  ].filter(Boolean).join('\n');

  return document_({
    seo,
    origin,
    ogType: 'website',
    jsonLd: [
      breadcrumbList(origin, [{ name: 'Home', path: '/' }, { name: 'Blog', path: BLOG_PATH }]),
      blogJsonLd({ origin, articles })
    ],
    categories,
    body
  });
}

function renderArticlePage({ origin, article, related = [], categories = [] }) {
  const seo = articleSeo({ origin, article });
  const trail = [
    { name: 'Home', path: '/' },
    { name: 'Blog', path: BLOG_PATH },
    { name: article.title, path: article.path }
  ];

  const updated = article.dateUpdated && article.dateUpdated !== article.datePublished
    ? '<span class="article-updated">Updated <time datetime="' + escapeHtml(article.dateUpdated) +
      '">' + escapeHtml(formatDate(article.dateUpdated)) + '</time></span>'
    : '';

  const body = [
    '<main class="container page-article">',
    breadcrumbNav(trail),
    '<article class="article">',
    '<header class="article-header">',
    meta(article),
    '<h1>' + escapeHtml(seo.h1) + '</h1>',
    '<p class="article-standfirst">' + escapeHtml(article.excerpt) + '</p>',
    '<p class="article-byline">Published by ' + escapeHtml(SITE_NAME) +
      ' on <time datetime="' + escapeHtml(article.datePublished) + '">' +
      escapeHtml(formatDate(article.datePublished)) + '</time>' +
      (updated ? ' &middot; ' + updated : '') + '</p>',
    '</header>',
    '<section class="article-body">',
    renderBody(article.body),
    '</section>',
    '<footer class="article-foot">',
    '<p class="footer-small">' + escapeHtml(RESEARCH_USE_NOTICE) + '</p>',
    '<p><a href="' + BLOG_PATH + '">&#8592; All articles</a></p>',
    '</footer>',
    '</article>',
    related.length
      ? '<section class="section blog-list" aria-label="More articles">' +
        '<h2>More from the blog</h2><div class="grid blog-grid">' +
        related.map(articleCard).join('\n') + '</div></section>'
      : '',
    '</main>'
  ].filter(Boolean).join('\n');

  return document_({
    seo,
    origin,
    ogType: 'article',
    jsonLd: [breadcrumbList(origin, trail), articleJsonLd({ origin, article, seo })],
    categories,
    body
  });
}

function renderBlogNotFound({ origin, categories = [] }) {
  const seo = {
    title: 'Article not found' + BRAND_SUFFIX,
    h1: 'Article not found',
    description: 'That article does not exist. Browse the ' + SITE_NAME + ' blog instead.',
    canonical: absolute(origin, BLOG_PATH),
    robots: NOINDEX_ROBOTS
  };
  const body = [
    '<main class="container page-blog">',
    '<h1>' + escapeHtml(seo.h1) + '</h1>',
    '<p class="sub">That article does not exist. <a href="' + BLOG_PATH +
      '">Browse all articles</a>.</p>',
    '</main>'
  ].join('\n');
  return document_({ seo, origin, ogType: 'website', jsonLd: [], categories, body });
}

module.exports = {
  renderBlogIndex,
  renderArticlePage,
  renderBlogNotFound,
  articleSeo,
  blogIndexSeo,
  articleJsonLd,
  blogJsonLd,
  breadcrumbList,
  renderBody,
  bodyText,
  inline,
  formatDate,
  BLOG_PATH,
  BLOG_TITLE,
  BLOG_DESCRIPTION
};
