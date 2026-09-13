'use strict';

// The blog: content registry, renderers, routing, structured data, and the
// hostile-input behaviour of /blog/<slug>.
//
// Like the other SEO and security suites these read source and exercise the
// pure renderers rather than booting the app, which would open a Postgres pool
// and a session store. The live anonymous HTTP matrix is run separately and
// recorded in the pull request.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');

const SERVER = read('server.js');
const VERCEL = JSON.parse(read('vercel.json'));
const INDEX = read('index.html');

const blog = require('../../content/blog');
const {
  renderBlogIndex, renderArticlePage, renderBlogNotFound,
  articleSeo, renderBody, bodyText, inline, formatDate
} = require('../../services/blog-page');

const ORIGIN = 'https://pepxresearch.com';
const CATS = [{ name: 'Repair', slug: 'repair', path: '/shop/repair' }];

const jsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));

const h1s = (html) => html.match(/<h1[^>]*>[\s\S]*?<\/h1>/g) || [];

function article(over = {}) {
  return Object.assign({
    slug: 'example-article',
    path: '/blog/example-article',
    title: 'Example Article',
    metaDescription: 'An example description used by the renderer tests.',
    excerpt: 'An example excerpt.',
    category: 'Testing and Quality',
    datePublished: '2026-01-02',
    status: 'published',
    body: [{ p: ['Hello.'] }]
  }, over);
}

// --- content registry -------------------------------------------------------

test('the registry publishes at least one article and freezes what it returns', () => {
  const published = blog.listPublished();
  assert.ok(published.length >= 1, 'expected at least one published article');
  for (const a of published) {
    assert.equal(blog.validateArticle(a), null, 'published article is malformed: ' + a.slug);
    assert.equal(a.path, '/blog/' + a.slug);
    assert.ok(Object.isFrozen(a), 'articles should be frozen');
  }
});

test('validateArticle rejects the ways an article can be wrong', () => {
  assert.equal(blog.validateArticle(article()), null);
  for (const [over, why] of [
    [{ slug: '../../etc/passwd' }, 'traversal slug'],
    [{ slug: 'Not A Slug' }, 'spaces and capitals'],
    [{ title: '' }, 'no title'],
    [{ excerpt: '' }, 'no excerpt'],
    [{ metaDescription: '' }, 'no meta description'],
    [{ datePublished: '10/09/2026' }, 'non-ISO date'],
    [{ dateUpdated: 'yesterday' }, 'non-ISO updated date'],
    [{ status: 'live' }, 'unknown status'],
    [{ body: [] }, 'empty body'],
    [{ body: [{ marquee: 'hi' }] }, 'unknown block type'],
    [{ body: [{ p: 'a', h2: 'b' }] }, 'two block types in one block']
  ]) {
    assert.notEqual(blog.validateArticle(article(over)), null, 'should have rejected: ' + why);
  }
});

test('drafts and noindex articles never reach the public lists', () => {
  for (const a of blog.listPublished()) assert.equal(a.status, 'published');
  for (const a of blog.listIndexable()) {
    assert.equal(a.status, 'published');
    assert.notEqual(a.noindex, true);
  }
  assert.ok(blog.listIndexable().length <= blog.listPublished().length);
});

test('articles are ordered newest first', () => {
  const dates = blog.listPublished().map((a) => a.datePublished);
  assert.deepEqual(dates, dates.slice().sort().reverse());
});

// --- adversarial slug handling ---------------------------------------------

test('findBySlug refuses everything that is not a clean slug', () => {
  const hostile = [
    '', ' ', null, undefined, 'nope', 'does-not-exist',
    '../../etc/passwd', '..%2f..%2fetc%2fpasswd', '....//....//server.js',
    '/etc/passwd', 'a/b', 'a\\b', 'article.html', 'article.HTML',
    "' OR 1=1 --", "'; DROP TABLE products; --", '1 UNION SELECT * FROM users',
    '<script>alert(1)</script>', '"><img src=x onerror=alert(1)>',
    '%3Cscript%3E', 'a'.repeat(2000), 'a b',
    '-leading', 'trailing-', 'double--dash'
  ];
  for (const s of hostile) {
    assert.equal(blog.findBySlug(s), null,
      'should not resolve: ' + JSON.stringify(String(s)).slice(0, 60));
  }
});

test('findBySlug is case-insensitive for an otherwise valid slug', () => {
  const slug = blog.listPublished()[0].slug;
  assert.ok(blog.findBySlug(slug));
  assert.ok(blog.findBySlug(slug.toUpperCase()));
  assert.ok(blog.findBySlug('  ' + slug + '  '));
});

// --- escaping ---------------------------------------------------------------

test('article content can never inject markup', () => {
  const nasty = '<script>alert(1)</script>" onmouseover="alert(2)';
  const html = renderArticlePage({
    origin: ORIGIN,
    article: article({
      title: nasty,
      excerpt: nasty,
      metaDescription: nasty,
      category: nasty,
      body: [{ h2: [nasty] }, { p: [nasty] }, { ul: [[nasty]] }, { note: [nasty] }]
    }),
    categories: CATS
  });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /onmouseover="alert/);
  assert.match(html, /&lt;script&gt;/);
  // The JSON-LD must still be parseable with that text inside it.
  assert.doesNotThrow(() => jsonLd(html));
});

test('the renderer only emits the block tags it knows about', () => {
  const html = renderBody([
    { h2: ['A'] }, { h3: ['B'] }, { p: ['C'] }, { ul: [['D']] }, { ol: [['E']] }, { note: ['F'] },
    { marquee: 'ignored' }, null, 'a string', { p: null }
  ]);
  assert.match(html, /<h2>A<\/h2>/);
  assert.match(html, /<h3>B<\/h3>/);
  assert.match(html, /<ul><li>D<\/li><\/ul>/);
  assert.match(html, /<ol><li>E<\/li><\/ol>/);
  assert.match(html, /<p class="article-note">F<\/p>/);
  assert.doesNotMatch(html, /marquee|ignored/);
  const tags = [...new Set([...html.matchAll(/<([a-z0-9]+)[ >]/g)].map((m) => m[1]))];
  assert.deepEqual(tags.sort(), ['h2', 'h3', 'li', 'ol', 'p', 'ul']);
});

test('article links stay inside the site and never point at a gated page', () => {
  assert.equal(inline([{ href: '/shop', text: 'Shop' }]), '<a href="/shop">Shop</a>');
  assert.equal(inline([{ href: '/coas.html', text: 'COAs' }]), '<a href="/coas.html">COAs</a>');
  for (const href of [
    'https://example.com', '//example.com', 'javascript:alert(1)', 'data:text/html,<b>',
    '/shop.html', '/product.html?product=x', '/account.html', '/checkout.html',
    '/admin.html', '/order-confirmation.html'
  ]) {
    const out = inline([{ href, text: 'Link' }]);
    assert.equal(out, 'Link', href + ' should render as plain text, got: ' + out);
  }
});

test('every link in every published article resolves to a public route', () => {
  for (const a of blog.listPublished()) {
    const html = renderBody(a.body);
    for (const m of html.matchAll(/href="([^"]+)"/g)) {
      assert.match(m[1], /^\//, a.slug + ' links off-site: ' + m[1]);
      assert.doesNotMatch(m[1], /(shop|product|account|checkout|admin|order-confirmation)\.html/,
        a.slug + ' links a gated page: ' + m[1]);
    }
  }
});

// --- blog index -------------------------------------------------------------

test('/blog renders one H1, a canonical, and index, follow', () => {
  const html = renderBlogIndex({ origin: ORIGIN, articles: blog.listPublished(), categories: CATS });
  assert.equal(h1s(html).length, 1);
  assert.match(h1s(html)[0], /PepX Research Blog/);
  assert.match(html, /<link rel="canonical" href="https:\/\/pepxresearch\.com\/blog">/);
  assert.match(html, /<meta name="robots" content="index, follow/);
  assert.doesNotMatch(html, /noindex/);
  assert.match(html, /<meta property="og:type" content="website">/);
  assert.match(html, /<meta name="twitter:card"/);
});

test('/blog lists every published article as a crawlable link', () => {
  const html = renderBlogIndex({ origin: ORIGIN, articles: blog.listPublished(), categories: CATS });
  for (const a of blog.listPublished()) {
    assert.ok(html.includes('href="' + a.path + '"'), '/blog is missing a link to ' + a.path);
    assert.ok(html.includes(a.title.replace(/&/g, '&amp;')), '/blog is missing the title of ' + a.slug);
  }
  assert.match(html, /<time datetime="\d{4}-\d{2}-\d{2}">/);
});

test('/blog links onward into the catalogue and never into a gated page', () => {
  const html = renderBlogIndex({ origin: ORIGIN, articles: blog.listPublished(), categories: CATS });
  assert.match(html, /href="\/shop"/);
  assert.match(html, /href="\/coas\.html"/);
  assert.doesNotMatch(html, /href="[^"]*(?:shop|product|account|checkout|admin)\.html/);
});

test('/blog survives having no articles at all', () => {
  const html = renderBlogIndex({ origin: ORIGIN, articles: [], categories: [] });
  assert.equal(h1s(html).length, 1);
  assert.match(html, /No articles have been published yet/);
  assert.match(html, /href="\/shop"/);
});

test('/blog carries Blog and BreadcrumbList structured data', () => {
  const html = renderBlogIndex({ origin: ORIGIN, articles: blog.listPublished(), categories: CATS });
  const types = jsonLd(html).map((d) => d['@type']);
  assert.deepEqual(types, ['BreadcrumbList', 'Blog']);
  const data = jsonLd(html)[1];
  assert.equal(data.url, ORIGIN + '/blog');
  assert.equal(data.blogPost.length, blog.listPublished().length);
  for (const post of data.blogPost) {
    assert.equal(post['@type'], 'BlogPosting');
    assert.match(post.url, /^https:\/\/pepxresearch\.com\/blog\//);
    assert.match(post.datePublished, /^\d{4}-\d{2}-\d{2}$/);
  }
});

// --- article page -----------------------------------------------------------

test('an article page renders one H1 that is the article title', () => {
  const a = blog.listPublished()[0];
  const html = renderArticlePage({ origin: ORIGIN, article: a, related: [], categories: CATS });
  assert.equal(h1s(html).length, 1);
  assert.ok(h1s(html)[0].includes(a.title.replace(/&/g, '&amp;')));
});

test('an article page is canonical to itself and index, follow', () => {
  const a = blog.listPublished()[0];
  const html = renderArticlePage({ origin: ORIGIN, article: a, related: [], categories: CATS });
  assert.ok(html.includes('<link rel="canonical" href="' + ORIGIN + a.path + '">'));
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1, 'exactly one canonical');
  assert.match(html, /<meta name="robots" content="index, follow/);
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.ok(html.includes('<meta property="og:url" content="' + ORIGIN + a.path + '">'));
});

test('a draft or noindex article would be marked noindex if it were ever rendered', () => {
  for (const over of [{ status: 'draft' }, { noindex: true }]) {
    const seo = articleSeo({ origin: ORIGIN, article: article(over) });
    assert.equal(seo.robots, 'noindex, follow');
  }
});

test('an article page uses semantic article markup', () => {
  const a = blog.listPublished()[0];
  const html = renderArticlePage({ origin: ORIGIN, article: a, related: [], categories: CATS });
  for (const tag of ['<article', '<header class="article-header"', '<section class="article-body"',
    '<footer class="article-foot"', '<h2>', '<time datetime=']) {
    assert.ok(html.includes(tag), 'article page is missing ' + tag);
  }
});

test('BlogPosting structured data is complete and matches the page', () => {
  const a = blog.listPublished()[0];
  const html = renderArticlePage({ origin: ORIGIN, article: a, related: [], categories: CATS });
  const [crumbs, post] = jsonLd(html);
  assert.equal(crumbs['@type'], 'BreadcrumbList');
  assert.equal(post['@type'], 'BlogPosting');
  assert.equal(post.headline, a.title);
  assert.equal(post.datePublished, a.datePublished);
  assert.equal(post.dateModified, a.dateUpdated || a.datePublished);
  assert.equal(post.mainEntityOfPage['@id'], ORIGIN + a.path);
  assert.equal(post.url, ORIGIN + a.path);
  assert.ok(post.description.length > 0 && post.description.length <= 155);
  // Publisher and author are the organisation. No invented byline.
  for (const who of [post.author, post.publisher]) {
    assert.equal(who['@type'], 'Organization');
    assert.equal(who.name, 'PepX Research');
    assert.equal(who.url, ORIGIN + '/');
  }
  assert.ok(post.publisher.logo && post.publisher.logo.url.startsWith(ORIGIN));
});

test('visible breadcrumbs match the BreadcrumbList exactly', () => {
  const a = blog.listPublished()[0];
  const html = renderArticlePage({ origin: ORIGIN, article: a, related: [], categories: CATS });

  const crumbStart = html.indexOf('<nav class="breadcrumbs"');
  const nav = html.slice(crumbStart, html.indexOf('</nav>', crumbStart));
  const visible = [...nav.matchAll(/<a href="([^"]+)">([^<]+)<\/a>|<span aria-current="page">([^<]+)<\/span>/g)]
    .map((m) => (m[3] != null ? { name: m[3], path: a.path } : { name: m[2], path: m[1] }));

  const crumbs = jsonLd(html)[0].itemListElement;
  assert.equal(visible.length, 3, 'Home > Blog > Article');
  assert.equal(crumbs.length, visible.length);
  crumbs.forEach((c, i) => {
    assert.equal(c.position, i + 1);
    assert.equal(c.name, visible[i].name, 'crumb ' + i + ' name');
    assert.equal(c.item, ORIGIN + (visible[i].path === '/' ? '/' : visible[i].path), 'crumb ' + i + ' item');
  });
  assert.deepEqual(visible.map((v) => v.name), ['Home', 'Blog', a.title]);
});

test('an article links back to the blog and onward into the site', () => {
  const a = blog.listPublished()[0];
  const html = renderArticlePage({ origin: ORIGIN, article: a, related: [], categories: CATS });
  assert.match(html, /href="\/blog"/);
  assert.match(html, /All articles/);
  assert.match(html, /href="\/shop"/);
  assert.match(html, /href="\/coas\.html"/);
  assert.doesNotMatch(html, /href="[^"]*(?:shop|product|account|checkout|admin)\.html/);
});

test('the not-found article page is noindex and offers a way back', () => {
  const html = renderBlogNotFound({ origin: ORIGIN, categories: CATS });
  assert.equal(h1s(html).length, 1);
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.match(html, /href="\/blog"/);
});

test('dates render without a timezone shifting them', () => {
  assert.equal(formatDate('2026-09-10'), 'Sep 10, 2026');
  assert.equal(formatDate('2026-01-01'), 'Jan 1, 2026');
  assert.equal(formatDate('not-a-date'), '');
  assert.equal(formatDate(null), '');
});

// --- routing and wiring -----------------------------------------------------

test('the blog routes are registered above the auth gate, express.static and the fallback', () => {
  const at = (s) => SERVER.indexOf(s);
  const gateAt = at('if (PUBLIC_HTML_PATHS.has(req.path))');
  const staticAt = at('return serveStaticAssets(req, res, next)');
  const starAt = at("app.get('*',");
  for (const [name, v] of [["/blog", at("app.get('/blog',")], ["/blog/:slug", at("app.get('/blog/:slug',")]]) {
    assert.ok(v !== -1, 'missing route ' + name);
    assert.ok(v < gateAt, name + ' must answer before the HTML auth gate');
    assert.ok(v < staticAt, name + ' must answer before express.static');
    assert.ok(v < starAt, name + ' must answer before the login fallback');
  }
});

test('an unknown article is a 404, not a redirect and not a soft 200', () => {
  const block = SERVER.slice(SERVER.indexOf("app.get('/blog/:slug'"), SERVER.indexOf('ROOT_ICONS'));
  assert.match(block, /renderBlogNotFound\(\{[\s\S]{0,120}\}\), 404\)/);
  assert.doesNotMatch(block, /res\.redirect\(|sendSignedInRedirect/);
});

test('a malformed blog URL is a 404, not a login redirect', () => {
  // /blog/a/b, /blog// and /blog/<script>...</script> all carry a slash inside
  // the slug segment, so /blog/:slug cannot match them. Without a blog-scoped
  // catch-all they reach app.get('*') and are answered with a login redirect.
  const at = SERVER.indexOf("app.get('/blog/*'");
  assert.ok(at !== -1, '/blog/* catch-all is missing');
  assert.ok(at > SERVER.indexOf("app.get('/blog/:slug',"), 'it must be registered after /blog/:slug');
  assert.ok(at < SERVER.indexOf("app.get('*',"), 'it must be registered before the login fallback');
  const block = SERVER.slice(at, at + 500);
  assert.match(block, /renderBlogNotFound\(\{[\s\S]{0,140}\}\), 404\)/);
  assert.doesNotMatch(block, /res\.redirect\(/);
});

test('the blog never reads a session and never branches on the crawler', () => {
  const block = SERVER.slice(SERVER.indexOf("app.get('/blog',"), SERVER.indexOf('ROOT_ICONS'));
  assert.doesNotMatch(block, /user-agent|userAgent|googlebot/i);
  assert.doesNotMatch(block, /hydrateAuthenticatedUser|req\.session/);
  const PAGE = read('services/blog-page.js');
  assert.doesNotMatch(PAGE, /req\.|res\.|require\('fs'\)|require\("fs"\)|process\.env/);
  const CONTENT = read('content/blog/index.js');
  assert.doesNotMatch(CONTENT, /\b(INSERT|UPDATE|DELETE|DROP)\b/i);
});

test('the sitemap announces /blog and published articles, and nothing else new', () => {
  const start = SERVER.indexOf('const STATIC_SITEMAP_PATHS = [');
  const block = SERVER.slice(start, SERVER.indexOf('];', start));
  for (const wanted of ['/', '/shop', '/coas.html', '/blog']) {
    assert.ok(block.includes("'" + wanted + "'"), 'sitemap should list ' + wanted);
  }
  for (const never of ['/shop.html', '/product.html', '/account.html', '/login.html', '/register.html']) {
    assert.ok(!block.includes("'" + never + "'"), 'sitemap must never list ' + never);
  }
  assert.match(SERVER, /blogContent\.listIndexable\(\)/);
  assert.doesNotMatch(SERVER, /blogContent\.ALL[\s\S]{0,80}sitemapEntry/);
});

test('robots.txt does not block the blog', () => {
  const start = SERVER.indexOf('function buildRobotsTxt');
  const block = SERVER.slice(start, start + 2500);
  assert.doesNotMatch(block, /Disallow: \/blog/);
});

test('the blog is linked from the homepage, the footer and the rendered chrome', () => {
  assert.ok(INDEX.includes('<a href="/blog">Blog</a>'), 'homepage nav should link the blog');
  const footer = INDEX.slice(INDEX.indexOf('<div class="footer-quick-links">'), INDEX.indexOf('</footer>'));
  assert.match(footer, /href="\/blog">Blog</, 'homepage footer should link the blog');
  const PAGE = read('services/public-page.js');
  assert.ok(PAGE.includes('<a href="/blog">Blog</a>'), 'rendered header should link the blog');
  assert.ok(PAGE.includes('href="/blog">Blog</a>'), 'rendered footer should link the blog');
  for (const page of ['coas.html', 'privacy-policy.html', 'terms-of-service.html',
    'terms-conditions.html', 'refund-policy.html', 'shipping-policy.html']) {
    assert.ok(read(page).includes('href="/blog"'), page + ' should link the blog');
  }
});

// --- the favicon fix --------------------------------------------------------

test('the root icon paths are served directly instead of falling through to login', () => {
  assert.match(SERVER, /const ROOT_ICONS = \{/);
  for (const p of ['/favicon.ico', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png']) {
    assert.ok(SERVER.includes("'" + p + "'"), 'ROOT_ICONS is missing ' + p);
  }
  assert.match(SERVER, /app\.get\(Object\.keys\(ROOT_ICONS\)/);
  const block = SERVER.slice(SERVER.indexOf('app.get(Object.keys(ROOT_ICONS)'), SERVER.indexOf('app.get(Object.keys(ROOT_ICONS)') + 700);
  assert.match(block, /res\.sendFile\(/);
  assert.match(block, /status\(404\)/, 'a missing icon is a 404, never a login redirect');
  const iconsAt = SERVER.indexOf('app.get(Object.keys(ROOT_ICONS)');
  assert.ok(iconsAt < SERVER.indexOf('return serveStaticAssets(req, res, next)'));
  assert.ok(iconsAt < SERVER.indexOf("app.get('*',"));
});

test('the icon files exist where the routes look for them', () => {
  for (const f of ['favicon.ico', 'assets/apple-touch-icon.png']) {
    assert.ok(fs.existsSync(path.join(REPO, f)), 'missing file: ' + f);
  }
});

test('vercel.json ships the favicon and the blog content with the function', () => {
  const include = VERCEL.builds[0].config.includeFiles;
  assert.ok(include.includes('favicon.ico'), 'favicon.ico must be bundled');
  assert.ok(include.includes('content/**'), 'content/** must be bundled');
  assert.ok(include.includes('assets/**'), 'assets/** must stay bundled');
  // The catch-all route must still be last, or the blog routes never run.
  assert.equal(VERCEL.routes[VERCEL.routes.length - 1].dest, '/api/index.js');
});

// --- content sanity ---------------------------------------------------------

test('published articles carry usable metadata for a search result', () => {
  for (const a of blog.listPublished()) {
    assert.ok(a.metaDescription.length >= 50 && a.metaDescription.length <= 160,
      a.slug + ' meta description is ' + a.metaDescription.length + ' chars');
    assert.ok(a.title.length <= 110, a.slug + ' title is too long for a headline');
    assert.ok(bodyText(a.body).length > 600, a.slug + ' is too thin to be worth indexing');
    const seo = articleSeo({ origin: ORIGIN, article: a });
    assert.ok(seo.description.length <= 155);
    assert.ok(seo.title.length > 0);
  }
});

test('no published article makes a medical, dosing or efficacy claim', () => {
  const banned = /\b(treats?|cures?|heals?|therapeutic|prescrib\w+|dosage|dosing|mg\/kg|side effects?|clinically proven|safe for human)\b/i;
  for (const a of blog.listPublished()) {
    const text = [a.title, a.excerpt, a.metaDescription, bodyText(a.body)].join(' ');
    const hit = text.match(banned);
    assert.equal(hit, null, a.slug + ' uses claim language: ' + (hit && hit[0]));
  }
});
