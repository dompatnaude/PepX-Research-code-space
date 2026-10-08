'use strict';
/**
 * Site-wide sales.
 *
 * A site-wide sale is a percentage discount that applies to every order
 * automatically while it is live -- the customer never types a code. This
 * module is the one place that decides whether a sale is live and how much it
 * takes off, so the announcement bar, the prices the storefront shows and the
 * amount checkout charges can never disagree about it.
 *
 * Live means: switched on, inside its start/end window, and not past its usage
 * limit. If more than one sale is live at once the larger discount wins.
 */
const { money } = require('./promo-service');

const SALE_COLUMNS = `id, name, discount_percent, banner_text, show_banner, banner_scroll,
       starts_at, expires_at, usage_limit, total_used, total_discount_given,
       total_revenue_generated, active, created_by, updated_by, created_at, updated_at`;

// The same test, in SQL, for the query that finds the live sale.
const LIVE_SQL = `active = true
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (expires_at IS NULL OR expires_at >= NOW())
        AND (usage_limit IS NULL OR total_used < usage_limit)`;

function saleStatus(row, now) {
  if (!row) return 'missing';
  const at = now || new Date();
  if (!row.active) return 'disabled';
  if (row.starts_at && at < new Date(row.starts_at)) return 'scheduled';
  if (row.expires_at && at > new Date(row.expires_at)) return 'expired';
  if (row.usage_limit != null && Number(row.total_used || 0) >= Number(row.usage_limit)) {
    return 'usage_limit_reached';
  }
  return 'active';
}

function isSaleLive(row, now) {
  return saleStatus(row, now) === 'active';
}

function formatPercent(value) {
  return String(Number(Number(value || 0).toFixed(2)));
}

/** The text the announcement bar shows when the admin has not written their own. */
function defaultBannerText(row) {
  const name = String((row && row.name) || 'Sale').trim();
  let text = name + ': ' + formatPercent(row && row.discount_percent) +
    '% off everything, applied automatically at checkout.';
  if (row && row.expires_at) {
    const end = new Date(row.expires_at);
    if (!Number.isNaN(end.getTime())) {
      text += ' Ends ' + end.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', timeZone: 'America/Chicago'
      }) + '.';
    }
  }
  return text;
}

/** What the sale takes off a cart subtotal. Mirrors a percentage promo code. */
function computeSaleDiscount(row, subtotal) {
  const safeSubtotal = money(subtotal);
  const percent = Number((row && row.discount_percent) || 0);
  if (!(percent > 0) || !(safeSubtotal > 0)) return 0;
  return Math.min(money((safeSubtotal * percent) / 100), safeSubtotal);
}

/** The label stored on the order and shown beside the discount. */
function saleLabel(row) {
  return String((row && row.name) || 'Sale').trim().slice(0, 80);
}

/** The only fields a shopper's browser is given. No totals, no admin ids. */
function toPublicSale(row) {
  if (!row) return null;
  const custom = String(row.banner_text || '').trim();
  return {
    id: Number(row.id),
    name: String(row.name || '').trim(),
    percent: Number(row.discount_percent),
    banner_text: custom || defaultBannerText(row),
    show_banner: row.show_banner !== false,
    banner_scroll: !!row.banner_scroll,
    expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
  };
}

/**
 * The sale that is live right now, or null. Pass { forUpdate: true } inside the
 * order transaction so two checkouts cannot both take the last use.
 */
async function getLiveSale(client, options) {
  const lock = options && options.forUpdate ? ' FOR UPDATE' : '';
  const result = await client.query(
    `SELECT ${SALE_COLUMNS}
       FROM sitewide_sales
      WHERE ${LIVE_SQL}
      ORDER BY discount_percent DESC, id DESC
      LIMIT 1${lock}`
  );
  return result.rows[0] || null;
}

// The announcement bar is fetched by every page view, signed-in or not. A short
// cache keeps that from becoming one database query per visitor. Checkout never
// reads this cache: it asks the database inside its own transaction.
const PUBLIC_CACHE_MS = 30 * 1000;
let publicCache = { at: 0, sale: null };

async function getPublicSale(db) {
  const now = Date.now();
  if (publicCache.at && now - publicCache.at < PUBLIC_CACHE_MS) {
    // A cached sale can run out while it is cached; never show an ended one.
    if (!publicCache.sale || !publicCache.sale.expires_at ||
        new Date(publicCache.sale.expires_at).getTime() >= now) {
      return publicCache.sale;
    }
  }
  const sale = toPublicSale(await getLiveSale(db));
  publicCache = { at: now, sale };
  return sale;
}

function clearPublicSaleCache() {
  publicCache = { at: 0, sale: null };
}

module.exports = {
  SALE_COLUMNS,
  saleStatus,
  isSaleLive,
  defaultBannerText,
  computeSaleDiscount,
  saleLabel,
  toPublicSale,
  getLiveSale,
  getPublicSale,
  clearPublicSaleCache,
};
