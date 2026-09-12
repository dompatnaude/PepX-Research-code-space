'use strict';

// ---------------------------------------------------------------------------
// Read-only catalogue data for the signed-out public pages (/shop,
// /shop/:category, /products/:slug) and for sitemap.xml.
//
// This module never writes, never reads a session and never touches cart,
// order, user or COA file data. It exists so the public pages can be rendered
// from the database directly instead of opening /api/products to anonymous
// requests - that API stays behind requireApiAuth exactly as it was.
//
// One snapshot of the whole catalogue is cached for a short TTL. Googlebot
// arrives in bursts, and 32 products is small enough that a single snapshot is
// cheaper than per-request queries.
// ---------------------------------------------------------------------------

// A product URL is only offered to Google once it has real copy behind it.
// Publishing a page whose only unique content is a name and a price produces a
// thin, near-duplicate page, so those pages are rendered (a signed-out human
// browsing the catalogue should still see the product) but marked noindex and
// left out of sitemap.xml.
//
// The gate is deliberately the presence of a description IN THE DATABASE. That
// makes "approved" and "published" the same act: copy that has not been
// reviewed and written to products.description cannot reach the sitemap, and no
// code change is needed when it is.
const MIN_INDEXABLE_DESCRIPTION_CHARS = 120;

const DEFAULT_TTL_MS = 60 * 1000;

function slugifyCategory(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function describedLength(product) {
  return String((product && product.description) || '').trim().length;
}

/**
 * Is this product's page allowed into sitemap.xml and left indexable?
 * Active, and carrying enough of its own copy to be worth a search result.
 */
function isIndexable(product) {
  if (!product || product.active === false) return false;
  return describedLength(product) >= MIN_INDEXABLE_DESCRIPTION_CHARS;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildPriceRange(basePrice, variants) {
  const prices = [];
  const base = toNumber(basePrice);
  if (base !== null && base > 0) prices.push(base);
  for (const variant of variants || []) {
    const p = toNumber(variant.price);
    if (p !== null && p > 0) prices.push(p);
  }
  if (!prices.length) return { from: null, to: null };
  return { from: Math.min.apply(null, prices), to: Math.max.apply(null, prices) };
}

function normalizeProduct(row, variants, coaCount) {
  const list = (variants || []).map((v) => ({
    name: String(v.name || ''),
    price: toNumber(v.price),
    inStock: Number(v.stock_quantity || 0) > 0
  }));
  const price = buildPriceRange(row.price, list);

  return {
    id: row.id,
    slug: String(row.slug || ''),
    name: String(row.name || ''),
    description: row.description ? String(row.description) : '',
    category: row.category ? String(row.category) : '',
    categorySlug: slugifyCategory(row.category),
    sku: row.sku ? String(row.sku) : '',
    imageUrl: row.image_url ? String(row.image_url) : '',
    inStock: Number(row.stock_quantity || 0) > 0 || list.some((v) => v.inStock),
    active: row.active !== false,
    updatedAt: row.updated_at || row.created_at || null,
    variants: list,
    priceFrom: price.from,
    priceTo: price.to,
    publishedCoaCount: Number(coaCount || 0),
    path: '/products/' + String(row.slug || '')
  };
}

function groupCategories(products) {
  const bySlug = new Map();
  for (const product of products) {
    if (!product.categorySlug) continue;
    if (!bySlug.has(product.categorySlug)) {
      bySlug.set(product.categorySlug, {
        name: product.category,
        slug: product.categorySlug,
        count: 0,
        indexableCount: 0,
        path: '/shop/' + product.categorySlug
      });
    }
    const entry = bySlug.get(product.categorySlug);
    entry.count += 1;
    if (isIndexable(product)) entry.indexableCount += 1;
  }
  return Array.from(bySlug.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {object} deps
 * @param {{query: Function}} deps.pool  pg pool (or anything with .query)
 * @param {number} [deps.ttlMs]
 */
function createPublicCatalog({ pool, ttlMs = DEFAULT_TTL_MS }) {
  let cache = null;
  let cachedAt = 0;

  async function load() {
    const [productRows, variantRows, coaRows] = await Promise.all([
      pool.query(
        `SELECT id, name, slug, description, price, image_url, sku, stock_quantity,
                category, active, created_at, updated_at
           FROM products
          WHERE active = TRUE
            AND slug IS NOT NULL
            AND slug <> ''
          ORDER BY name ASC`
      ),
      pool.query(
        `SELECT product_id, name, price, stock_quantity
           FROM product_variants
          WHERE active = TRUE
          ORDER BY price ASC`
      ),
      pool.query(
        `SELECT product_id, COUNT(*)::int AS n
           FROM coas
          WHERE status = 'published'
          GROUP BY product_id`
      )
    ]);

    const variantsByProduct = new Map();
    for (const row of variantRows.rows) {
      if (!variantsByProduct.has(row.product_id)) variantsByProduct.set(row.product_id, []);
      variantsByProduct.get(row.product_id).push(row);
    }

    const coaByProduct = new Map();
    for (const row of coaRows.rows) coaByProduct.set(row.product_id, row.n);

    const products = productRows.rows.map((row) =>
      normalizeProduct(row, variantsByProduct.get(row.id), coaByProduct.get(row.id))
    );

    return {
      products,
      bySlug: new Map(products.map((p) => [p.slug.toLowerCase(), p])),
      categories: groupCategories(products)
    };
  }

  async function snapshot() {
    const now = Date.now();
    if (cache && now - cachedAt < ttlMs) return cache;
    cache = await load();
    cachedAt = now;
    return cache;
  }

  return {
    invalidate() {
      cache = null;
      cachedAt = 0;
    },

    async listActive() {
      return (await snapshot()).products;
    },

    async categories() {
      return (await snapshot()).categories;
    },

    async findCategory(slug) {
      const wanted = slugifyCategory(slug);
      if (!wanted) return null;
      return (await snapshot()).categories.find((c) => c.slug === wanted) || null;
    },

    async listByCategory(slug) {
      const wanted = slugifyCategory(slug);
      return (await snapshot()).products.filter((p) => p.categorySlug === wanted);
    },

    async findBySlug(slug) {
      const wanted = String(slug || '').trim().toLowerCase();
      if (!wanted) return null;
      return (await snapshot()).bySlug.get(wanted) || null;
    },

    // Everything sitemap.xml is allowed to announce, and nothing else.
    async indexableProducts() {
      return (await snapshot()).products.filter(isIndexable);
    }
  };
}

module.exports = {
  createPublicCatalog,
  isIndexable,
  slugifyCategory,
  normalizeProduct,
  groupCategories,
  buildPriceRange,
  MIN_INDEXABLE_DESCRIPTION_CHARS
};
