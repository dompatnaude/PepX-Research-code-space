'use strict';

// ---------------------------------------------------------------------------
// The signed-out certificate index (/coas.html).
//
// This module exists so the public COA page never reads the catalogue. It can
// answer exactly one question - which product names have a published COA, and
// how many - and nothing else. No price, no stock, no slug, no product id, so
// what it returns cannot be used to reconstruct the catalogue or to link into
// it.
//
// A product with no published COA is invisible here, whatever its status, and
// the name comes from the certificate record itself wherever it was captured,
// falling back to the product row only to fill in older certificates.
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 60 * 1000;

function createCoaIndex({ pool, ttlMs = DEFAULT_TTL_MS }) {
  let cached = null;
  let cachedAt = 0;

  // Matches the filter the public COA API uses, so the index never advertises
  // a certificate that /api/coas would refuse to serve.
  async function publishedSubjects() {
    const now = Date.now();
    if (cached !== null && now - cachedAt < ttlMs) return cached;

    const { rows } = await pool.query(
      `SELECT s.name AS name, COUNT(*)::int AS published_coa_count
         FROM (
           SELECT COALESCE(NULLIF(TRIM(c.product_name), ''), p.name) AS name
             FROM coas c
             LEFT JOIN products p ON p.id = c.product_id
            WHERE c.status = 'published'
         ) s
        WHERE s.name IS NOT NULL AND s.name <> ''
        GROUP BY s.name
        ORDER BY s.name ASC`
    );

    cached = rows.map((row) => ({
      name: row.name,
      publishedCoaCount: row.published_coa_count
    }));
    cachedAt = now;
    return cached;
  }

  function invalidate() {
    cached = null;
    cachedAt = 0;
  }

  return { publishedSubjects, invalidate };
}

module.exports = { createCoaIndex };
