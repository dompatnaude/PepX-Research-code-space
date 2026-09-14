'use strict';

// The published article set itself, as opposed to the blog machinery in
// blog.test.js. These assertions are about content: that every article the
// registry publishes is reachable, uniquely described, correctly marked up, and
// free of the claim language this catalogue must not make.
//
// They are deliberately written over listPublished() rather than a hardcoded
// list where possible, so a seventh or eighth article inherits the same checks.

const test = require('node:test');
const assert = require('node:assert/strict');

const blog = require('../../content/blog');
const {
  renderBlogIndex, renderArticlePage, articleSeo, bodyText
} = require('../../services/blog-page');

const ORIGIN = 'https://pepxresearch.com';
const CATS = [{ name: 'Repair', slug: 'repair', path: '/shop/repair' }];

// The cluster this phase was asked to build. Kept explicit: a silently dropped
// article or a renamed slug should fail here rather than quietly shrink the
// blog.
const EXPECTED_SLUGS = [
  'peptide-purity-vs-identity-testing',
  'what-hplc-testing-measures',
  'mass-spectrometry-compound-identification',
  'what-does-lyophilized-mean',
  'batch-numbers-research-compound-documentation',
  'what-third-party-testing-means',
  'how-to-read-a-certificate-of-analysis'
];

// Public destinations an article is allowed to link to besides another article.
const PUBLIC_TARGETS = new Set(['/', '/shop', '/coas.html', '/blog']);

const published = () => blog.listPublished();
const pageFor = (a) => renderArticlePage({
  origin: ORIGIN, article: a, related: published().filter((x) => x.slug !== a.slug).slice(0, 3), categories: CATS
});
const jsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));
const hrefsIn = (article) => {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === 'object') {
      if (typeof n.href === 'string') out.push(n.href);
      Object.values(n).forEach(walk);
    }
  };
  walk(article.body);
  return out;
};

// --- the set itself ---------------------------------------------------------

test('every expected article is published and reachable by its slug', () => {
  for (const slug of EXPECTED_SLUGS) {
    const found = blog.findBySlug(slug);
    assert.ok(found, 'not published: ' + slug);
    assert.equal(found.slug, slug);
    assert.equal(found.path, '/blog/' + slug);
    assert.equal(found.status, 'published');
  }
  assert.equal(published().length, EXPECTED_SLUGS.length,
    'published set is ' + published().map((a) => a.slug).join(', '));
});

test('every published article is valid by the registry rules', () => {
  for (const a of published()) {
    assert.equal(blog.validateArticle(a), null, a.slug + ' is malformed');
  }
});

// --- uniqueness -------------------------------------------------------------

for (const field of ['slug', 'title', 'metaTitle', 'metaDescription', 'excerpt']) {
  test('every article has a unique ' + field, () => {
    const values = published().map((a) => a[field]);
    for (const v of values) assert.ok(v && String(v).trim(), 'empty ' + field);
    assert.equal(new Set(values).size, values.length,
      'duplicate ' + field + ' in: ' + values.join(' | '));
  });
}

test('every article is canonical to its own URL, and no two share one', () => {
  const canonicals = published().map((a) => articleSeo({ origin: ORIGIN, article: a }).canonical);
  assert.equal(new Set(canonicals).size, canonicals.length, 'duplicate canonical');
  for (const a of published()) {
    const seo = articleSeo({ origin: ORIGIN, article: a });
    assert.equal(seo.canonical, ORIGIN + '/blog/' + a.slug);
    const html = pageFor(a);
    const tags = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(tags, [seo.canonical], a.slug + ' canonical tags: ' + tags.join(','));
  }
});

test('meta descriptions are present and a sensible length for a search result', () => {
  for (const a of published()) {
    assert.ok(a.metaDescription.length >= 80 && a.metaDescription.length <= 165,
      a.slug + ' metaDescription is ' + a.metaDescription.length + ' chars');
  }
});

// --- per-article markup -----------------------------------------------------

test('every article page renders exactly one H1, and it is the title', () => {
  for (const a of published()) {
    const html = pageFor(a);
    const found = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g) || [];
    assert.equal(found.length, 1, a.slug + ' has ' + found.length + ' H1s');
    assert.ok(found[0].includes(articleSeo({ origin: ORIGIN, article: a }).h1),
      a.slug + ' H1 is not the article title');
  }
});

test('every article page is index, follow', () => {
  for (const a of published()) {
    const html = pageFor(a);
    const robots = [...html.matchAll(/<meta name="robots" content="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(robots.length, 1, a.slug + ' has ' + robots.length + ' robots tags');
    assert.match(robots[0], /(^|,\s*)index\b/, a.slug + ' robots: ' + robots[0]);
    assert.doesNotMatch(robots[0], /noindex/, a.slug + ' robots: ' + robots[0]);
    assert.match(robots[0], /follow/, a.slug + ' robots: ' + robots[0]);
  }
});

test('every article page carries valid BlogPosting data that matches the page', () => {
  for (const a of published()) {
    const html = pageFor(a);
    const blocks = jsonLd(html);
    const post = blocks.find((b) => b['@type'] === 'BlogPosting');
    assert.ok(post, a.slug + ' has no BlogPosting');
    assert.equal(post.headline, a.title, a.slug + ' headline');
    assert.equal(post.datePublished, a.datePublished, a.slug + ' datePublished');
    assert.equal(post.dateModified, a.dateUpdated || a.datePublished, a.slug + ' dateModified');
    assert.equal(post.mainEntityOfPage['@id'], ORIGIN + '/blog/' + a.slug, a.slug + ' mainEntityOfPage');
    assert.equal(post.author['@type'], 'Organization', a.slug + ' author must be the org');
    assert.equal(post.publisher['@type'], 'Organization', a.slug + ' publisher must be the org');
    if (a.category) assert.equal(post.articleSection, a.category, a.slug + ' articleSection');
    // The headline has to be readable on the page, not only in the markup.
    assert.ok(html.includes(a.datePublished), a.slug + ' datePublished is not on the page');
  }
});

test('structured data never invents a person, a credential or a rating', () => {
  for (const a of published()) {
    const raw = JSON.stringify(jsonLd(pageFor(a)));
    assert.doesNotMatch(raw, /"@type"\s*:\s*"Person"/, a.slug + ' names a person as author');
    assert.doesNotMatch(raw, /jobTitle|honorificSuffix|honorificPrefix/, a.slug + ' invents a credential');
    assert.doesNotMatch(raw, /aggregateRating|reviewRating|"Review"/, a.slug + ' invents a rating');
  }
});

test('every article page carries a BreadcrumbList that matches the visible trail', () => {
  for (const a of published()) {
    const html = pageFor(a);
    const crumbs = jsonLd(html).find((b) => b['@type'] === 'BreadcrumbList');
    assert.ok(crumbs, a.slug + ' has no BreadcrumbList');
    const items = crumbs.itemListElement;
    assert.ok(items.length >= 3, a.slug + ' breadcrumb trail is too short');
    items.forEach((item, i) => {
      assert.equal(item.position, i + 1, a.slug + ' breadcrumb positions must be 1..n');
      const name = item.name || (item.item && item.item.name);
      assert.ok(name, a.slug + ' breadcrumb ' + (i + 1) + ' has no name');
    });
    assert.equal(items[0].name, 'Home');
    assert.equal(items[1].name, 'Blog');
    assert.equal(items[items.length - 1].name, a.title, a.slug + ' last crumb is not the title');
  }
});

// --- the index and the sitemap ----------------------------------------------

test('/blog lists every published article, with the newest featured', () => {
  const articles = published();
  const html = renderBlogIndex({ origin: ORIGIN, articles, categories: CATS });
  for (const a of articles) {
    assert.ok(html.includes('href="/blog/' + a.slug + '"'), '/blog does not link ' + a.slug);
    assert.ok(html.includes(a.title.replace(/&/g, '&amp;')), '/blog does not show the title of ' + a.slug);
  }
  const featured = html.slice(html.indexOf('blog-featured'), html.indexOf('blog-list'));
  assert.ok(featured.includes('href="/blog/' + articles[0].slug + '"'),
    'the featured card is not the first article in the list');
});

test('the certificate of analysis article is still published and still linked from /blog', () => {
  const coa = blog.findBySlug('how-to-read-a-certificate-of-analysis');
  assert.ok(coa, 'the original article has been dropped');
  const html = renderBlogIndex({ origin: ORIGIN, articles: published(), categories: CATS });
  assert.ok(html.includes('href="/blog/how-to-read-a-certificate-of-analysis"'));
});

test('every published article is indexable and would enter the sitemap', () => {
  const indexable = blog.listIndexable().map((a) => a.path);
  for (const slug of EXPECTED_SLUGS) {
    assert.ok(indexable.includes('/blog/' + slug), 'missing from sitemap set: ' + slug);
  }
  assert.equal(indexable.length, EXPECTED_SLUGS.length);
});

test('nothing that is a draft or noindex can reach the sitemap set', () => {
  for (const a of blog.listIndexable()) {
    assert.equal(a.status, 'published', a.slug + ' is not published');
    assert.notEqual(a.noindex, true, a.slug + ' is noindex');
  }
  for (const a of blog.ALL) {
    if (a.status !== 'published' || a.noindex === true) {
      assert.ok(!blog.listIndexable().some((x) => x.slug === a.slug), a.slug + ' leaked');
    }
  }
});

// --- the internal link cluster ----------------------------------------------

test('every link in every article resolves to a published article or a public route', () => {
  const slugs = new Set(published().map((a) => '/blog/' + a.slug));
  for (const a of published()) {
    for (const href of hrefsIn(a)) {
      const target = href.split('#')[0].split('?')[0];
      const ok = slugs.has(target) || PUBLIC_TARGETS.has(target);
      assert.ok(ok, a.slug + ' links to an unresolvable target: ' + href);
    }
  }
});

test('no article links to a gated page, a private API or off-site', () => {
  for (const a of published()) {
    for (const href of hrefsIn(a)) {
      assert.doesNotMatch(href, /(^|\/)(shop|product|account|checkout|admin|order-confirmation)\.html/i,
        a.slug + ' links to a gated page: ' + href);
      assert.doesNotMatch(href, /^\/api\//i, a.slug + ' links to an API: ' + href);
      assert.doesNotMatch(href, /^(https?:)?\/\//i, a.slug + ' links off-site: ' + href);
      assert.match(href, /^\//, a.slug + ' link is not root-relative: ' + href);
    }
  }
});

test('the article cluster links the way it was designed to', () => {
  const expected = {
    'peptide-purity-vs-identity-testing': [
      '/blog/what-hplc-testing-measures',
      '/blog/mass-spectrometry-compound-identification',
      '/blog/how-to-read-a-certificate-of-analysis'
    ],
    'what-hplc-testing-measures': [
      '/blog/peptide-purity-vs-identity-testing',
      '/blog/how-to-read-a-certificate-of-analysis'
    ],
    'mass-spectrometry-compound-identification': [
      '/blog/peptide-purity-vs-identity-testing',
      '/blog/how-to-read-a-certificate-of-analysis'
    ],
    'what-third-party-testing-means': [
      '/blog/how-to-read-a-certificate-of-analysis',
      '/blog/what-hplc-testing-measures',
      '/blog/mass-spectrometry-compound-identification'
    ],
    'batch-numbers-research-compound-documentation': [
      '/blog/how-to-read-a-certificate-of-analysis',
      '/blog/what-third-party-testing-means'
    ]
  };
  for (const [slug, targets] of Object.entries(expected)) {
    const a = blog.findBySlug(slug);
    assert.ok(a, 'missing article ' + slug);
    const hrefs = hrefsIn(a);
    for (const t of targets) {
      assert.ok(hrefs.includes(t), slug + ' is missing its link to ' + t);
    }
  }
});

test('no article links to itself', () => {
  for (const a of published()) {
    assert.ok(!hrefsIn(a).includes('/blog/' + a.slug), a.slug + ' links to itself');
  }
});

// --- claim language ---------------------------------------------------------

test('no article makes a dosing, administration or human-use claim', () => {
  const BANNED = [
    [/\b(dosage|dosing|\bdoses\b|mcg\b|microgram|milligram)\b/i, 'dosing'],
    [/\b(inject|injection|subcutaneous|intramuscular|syringe|reconstitut|bacteriostatic)\w*/i, 'administration'],
    [/\b(stack|stacking|dosing cycle|cycle length)\b/i, 'cycles or stacks'],
    [/\b(bodybuild\w*|muscle (gain|building)|lean mass|fat loss|weight loss)\b/i, 'body composition'],
    [/\b(cure|cures|curing|disease|patient|prescri\w+|therap(y|ies|eutic))\b/i, 'medical framing'],
    [/\bsafe (for|to) (human|use|consumption)\b/i, 'human-use safety'],
  ];
  for (const a of published()) {
    const text = bodyText(a.body) + ' ' + a.title + ' ' + a.excerpt + ' ' + a.metaDescription;
    // Two senses are stripped before scanning rather than weakening the patterns:
    // the standing research-use disclaimer, which is the one permitted use of that
    // phrase, and sample injection, which is what an autosampler does to a column
    // and has nothing to do with administering anything to anyone.
    const scanned = text
      .replace(/They are not for human consumption\./g, '')
      .replace(/are for laboratory and research use only/g, '')
      .replace(/\b(?:sample is |volume of dissolved sample is )?inject(?:ed|ion)? (?:into a stream|volume|loop|port)\b/gi, '');
    for (const [re, label] of BANNED) {
      const hit = scanned.match(re);
      assert.equal(hit, null, a.slug + ' contains ' + label + ' language: ' + (hit && hit[0]));
    }

    // "for human consumption" is allowed only in a sentence that denies it -
    // the standing disclaimer, or a line explaining what testing does not show.
    // An affirmative sentence is the thing this catalogue must never publish.
    for (const sentence of text.split(/(?<=\.)\s+/)) {
      if (!/for human consumption/i.test(sentence)) continue;
      assert.match(sentence, /\b(not|never|no)\b/i,
        a.slug + ' asserts human consumption: ' + sentence.trim());
    }
  }
});

test('no article claims testing establishes safety, efficacy or approval', () => {
  const BANNED = [
    [/\b(fda[- ]?(approved|cleared|registered)|approved by the fda)\b/i, 'regulatory approval'],
    [/\b(purity|identity|testing|a coa|certificate)\b(?:(?!\b(?:not|never|does not|cannot)\b)[^.]){0,60}\b(proves|guarantees|ensures)\b/i,
      'proof language'],
    [/\b(clinically proven|proven effective|establishes efficacy|guarantees quality)\b/i, 'efficacy'],
    [/\bhigh(er)? purity\b[^.]{0,40}\bsafe/i, 'purity implies safety']
  ];
  for (const a of published()) {
    const text = bodyText(a.body) + ' ' + a.excerpt + ' ' + a.metaDescription;
    for (const [re, label] of BANNED) {
      const hit = text.match(re);
      assert.equal(hit, null, a.slug + ' contains ' + label + ': ' + (hit && hit[0]));
    }
  }
});

test('every article carries the research-use-only notice', () => {
  for (const a of published()) {
    const text = bodyText(a.body);
    assert.match(text, /laboratory and research use only/i, a.slug + ' is missing the notice');
    assert.match(text, /not for human consumption/i, a.slug + ' is missing the notice');
  }
});

// --- escaping ---------------------------------------------------------------

test('no article body can put raw markup on the page', () => {
  for (const a of published()) {
    const html = pageFor(a);
    const OPEN = '<section class="article-body">';
    const bodyStart = html.indexOf(OPEN) + OPEN.length;
    const body = html.slice(bodyStart, html.indexOf('</section>', bodyStart));
    const tags = [...body.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b/g)].map((m) => m[1].toLowerCase());
    const allowed = new Set(['h2', 'h3', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'div']);
    for (const tag of new Set(tags)) {
      assert.ok(allowed.has(tag), a.slug + ' rendered an unexpected tag: ' + tag);
    }
    assert.doesNotMatch(body, /<script|onerror=|onload=|javascript:/i, a.slug + ' rendered script');
  }
});
