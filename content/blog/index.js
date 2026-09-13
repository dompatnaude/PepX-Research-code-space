'use strict';

// ---------------------------------------------------------------------------
// Blog article registry.
//
// Articles are plain CommonJS modules under content/blog/. That choice is
// deliberate for this deployment:
//
//   * vercel.json bundles the serverless function from a `includeFiles` glob
//     plus require-tracing. A required .js module is always in the bundle; a
//     .md or .json file read with fs at runtime is only there if the glob
//     happens to cover it. The favicon that 404'd in production is exactly
//     that failure mode, and this avoids repeating it.
//   * No markdown parser, no front-matter parser, no CMS, no new dependency.
//   * The body is structured blocks, never raw HTML, so the renderer escapes
//     every string it is given and an article can never inject markup.
//
// Adding an article is: write content/blog/<slug>.js, add it to ARTICLES.
// ---------------------------------------------------------------------------

const ARTICLE_MODULES = [
  require('./how-to-read-a-certificate-of-analysis')
];

const BLOCK_TYPES = new Set(['h2', 'h3', 'p', 'ul', 'ol', 'note']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Why an article is unusable, or null when it is fine. Used by the tests and
 * by load() below, which skips rather than throws: one malformed article must
 * never be able to take the site down.
 */
function validateArticle(a) {
  if (!a || typeof a !== 'object') return 'not an object';
  if (!SLUG_RE.test(String(a.slug || ''))) return 'bad slug: ' + a.slug;
  if (!a.title || typeof a.title !== 'string') return 'missing title';
  if (!a.excerpt || typeof a.excerpt !== 'string') return 'missing excerpt';
  if (!a.metaDescription || typeof a.metaDescription !== 'string') return 'missing metaDescription';
  if (!DATE_RE.test(String(a.datePublished || ''))) return 'bad datePublished: ' + a.datePublished;
  if (a.dateUpdated && !DATE_RE.test(String(a.dateUpdated))) return 'bad dateUpdated: ' + a.dateUpdated;
  if (a.status !== 'published' && a.status !== 'draft') return 'bad status: ' + a.status;
  if (!Array.isArray(a.body) || !a.body.length) return 'empty body';
  for (const block of a.body) {
    if (!block || typeof block !== 'object') return 'body block is not an object';
    const keys = Object.keys(block).filter((k) => BLOCK_TYPES.has(k));
    if (keys.length !== 1) return 'body block must have exactly one of ' + [...BLOCK_TYPES].join('/');
  }
  return null;
}

function load() {
  const out = [];
  const seen = new Set();
  for (const article of ARTICLE_MODULES) {
    const problem = validateArticle(article);
    if (problem) {
      console.error('[blog] skipping malformed article:', problem);
      continue;
    }
    if (seen.has(article.slug)) {
      console.error('[blog] duplicate slug ignored:', article.slug);
      continue;
    }
    seen.add(article.slug);
    out.push(Object.freeze(Object.assign({ path: '/blog/' + article.slug }, article)));
  }
  // Newest first, and stable when two articles share a date.
  out.sort((a, b) => (a.datePublished < b.datePublished ? 1 : a.datePublished > b.datePublished ? -1 : 0));
  return Object.freeze(out);
}

const ARTICLES = load();
const BY_SLUG = new Map(ARTICLES.map((a) => [a.slug, a]));

/** Everything a signed-out visitor may read. Drafts are not public at all. */
function listPublished() {
  return ARTICLES.filter((a) => a.status === 'published');
}

/** Only these URLs may enter sitemap.xml. */
function listIndexable() {
  return listPublished().filter((a) => a.noindex !== true);
}

function findBySlug(slug) {
  const wanted = String(slug == null ? '' : slug).trim().toLowerCase();
  if (!wanted || !SLUG_RE.test(wanted)) return null;
  const found = BY_SLUG.get(wanted);
  return found && found.status === 'published' ? found : null;
}

function categories() {
  const names = [];
  for (const a of listPublished()) {
    if (a.category && names.indexOf(a.category) === -1) names.push(a.category);
  }
  return names;
}

/** The most recent published article, or null when there are none yet. */
function latest() {
  return listPublished()[0] || null;
}

module.exports = {
  listPublished,
  listIndexable,
  findBySlug,
  categories,
  latest,
  validateArticle,
  SLUG_RE,
  ALL: ARTICLES
};
