'use strict';

/**
 * Pure helpers for the admin Customers section.
 *
 * Everything here is DB-free and side-effect-free so it can be unit tested
 * with fakes, matching the project's existing pure-function test style.
 * The route layer (routes/admin-customers.js) wires these into real SQL.
 */

// ---------------------------------------------------------------------------
// Account status (disable) logic. We reuse users.banned_until (timestamptz).
// An account is "disabled" when banned_until is set AND is in the future.
// A null banned_until, or one in the past (an expired temporary ban), is NOT
// treated as disabled. Admin disable uses a far-future sentinel so it never
// silently expires.
// ---------------------------------------------------------------------------

// Sentinel used when an admin disables an account: effectively permanent.
// (disable is represented by a non-null users.disabled_at timestamp)

function isAccountDisabled(user) {
  if (!user) return false;
  const raw = user.disabledAt != null ? user.disabledAt : user.disabled_at;
  return Boolean(raw);
}

// Value to store when disabling (the moment it happened); null re-enables.
function disabledValue() {
  return new Date().toISOString();
}
function enabledValue() {
  return null;
}

// ---------------------------------------------------------------------------
// Auth method derivation.
// ---------------------------------------------------------------------------

function deriveAuthMethod(user) {
  if (!user) return 'unknown';
  const hasGoogle = Boolean(user.googleId || user.google_id);
  const hasPassword = Boolean(user.passwordHash || user.password_hash);
  if (hasGoogle && hasPassword) return 'linked';
  if (hasGoogle) return 'google';
  if (hasPassword) return 'email_password';
  // Fall back to the provider column if present.
  const provider = (user.provider || '').toLowerCase();
  if (provider.includes('google')) return 'google';
  if (provider) return 'email_password';
  return 'unknown';
}

function canReceivePasswordReset(user) {
  // Only accounts that have (or could have) a password credential should get
  // a reset email. A Google-only account with no password hash cannot.
  const method = deriveAuthMethod(user);
  return method === 'email_password' || method === 'linked';
}

// ---------------------------------------------------------------------------
// Revenue / "paid" order logic.
//
// Mirrors the existing admin convention (routes/admin.js) where an order is
// treated as paid when payment_status = 'paid', OR payment_status is NULL and
// the order is not still awaiting payment. On top of that we always exclude
// cancelled and refunded orders from lifetime spend and order counts.
//
// Included in lifetime spend / order count:
//   payment_status = 'paid'
//     AND status NOT IN ('cancelled','refunded')
//   OR (payment_status IS NULL
//       AND status NOT IN ('pending_payment','cancelled','refunded'))
// ---------------------------------------------------------------------------

const EXCLUDED_STATUSES = ['cancelled', 'refunded'];
const UNPAID_STATUSES = ['pending_payment'];

// SQL fragment (parameterless) that evaluates true for a "counts toward
// lifetime spend" order. Alias for the orders table must be `o`.
const PAID_ORDER_SQL = `(
  (o.payment_status = 'paid' AND o.status NOT IN ('cancelled','refunded'))
  OR (o.payment_status IS NULL AND o.status NOT IN ('pending_payment','cancelled','refunded'))
)`;

// JS mirror of PAID_ORDER_SQL, used in unit tests and any in-memory math.
function orderCountsTowardSpend(order) {
  if (!order) return false;
  const status = String(order.status || '').toLowerCase();
  const payment = order.payment_status == null && order.paymentStatus == null
    ? null
    : String(order.payment_status || order.paymentStatus || '').toLowerCase();
  if (EXCLUDED_STATUSES.includes(status)) return false;
  if (payment === 'paid') return true;
  if (payment === null) return !UNPAID_STATUSES.includes(status);
  return false;
}

function computeCustomerStats(orders) {
  const paid = (orders || []).filter(orderCountsTowardSpend);
  const orderCount = paid.length;
  const lifetimeSpend = paid.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const dates = paid
    .map((o) => new Date(o.created_at || o.createdAt))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);
  const firstOrder = dates.length ? dates[0] : null;
  const lastOrder = dates.length ? dates[dates.length - 1] : null;
  const avgOrderValue = orderCount ? lifetimeSpend / orderCount : 0;
  return {
    orderCount,
    lifetimeSpend: Math.round(lifetimeSpend * 100) / 100,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    firstOrder,
    lastOrder,
  };
}

// ---------------------------------------------------------------------------
// Redaction. NOTHING sensitive must ever leave the admin customer API.
// This is the single gate every customer object passes through before it is
// serialized to an admin response.
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = [
  'password', 'passwordHash', 'password_hash', 'encrypted_password',
  'resetTokenHash', 'reset_token_hash', 'resetToken', 'reset_token',
  'resetTokenExpiresAt', 'reset_token_expires_at',
  'googleAccessToken', 'google_access_token', 'googleRefreshToken',
  'google_refresh_token', 'googleIdToken', 'google_id_token',
  'sessionToken', 'session_token', 'confirmation_token', 'recovery_token',
  'email_change_token_new', 'email_change_token_current',
];

function redactCustomer(user) {
  if (!user) return null;
  // Known-safe boolean/scalar flags that happen to contain a sensitive-looking
  // word but carry no secret value.
  const SAFE_KEYS = ['canResetPassword'];
  const out = {};
  for (const [key, value] of Object.entries(user)) {
    if (SAFE_KEYS.includes(key)) { out[key] = value; continue; }
    if (SENSITIVE_KEYS.includes(key)) continue;
    if (/token|password|secret/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}

function assertNoSecrets(obj) {
  const json = JSON.stringify(obj || {});
  for (const key of SENSITIVE_KEYS) {
    if (new RegExp('"' + key + '"').test(json)) {
      throw new Error('Secret key leaked in admin customer payload: ' + key);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Address history derived from orders (site has no per-address table for
// order shipping; addresses live inline on orders). De-duplicate identical
// addresses, keeping the most recently used date.
// ---------------------------------------------------------------------------

function addressKey(a) {
  return [a.name, a.line1, a.line2, a.city, a.state, a.zip, a.country, a.phone]
    .map((v) => String(v || '').trim().toLowerCase())
    .join('|');
}

function deriveAddressHistory(orders) {
  const byKey = new Map();
  for (const o of orders || []) {
    const addr = {
      name: o.shipping_name || '',
      line1: o.shipping_address || '',
      line2: o.shipping_address2 || '',
      city: o.shipping_city || '',
      state: o.shipping_state || '',
      zip: o.shipping_zip || '',
      country: o.shipping_country || '',
      phone: o.shipping_phone || '',
    };
    if (!addr.line1 && !addr.city && !addr.zip) continue;
    const key = addressKey(addr);
    const used = new Date(o.created_at || o.createdAt);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...addr, lastUsed: used, timesUsed: 1 });
    } else {
      existing.timesUsed += 1;
      if (!Number.isNaN(used.getTime()) && used > existing.lastUsed) {
        existing.lastUsed = used;
      }
    }
  }
  return Array.from(byKey.values()).sort((a, b) => b.lastUsed - a.lastUsed);
}

// ---------------------------------------------------------------------------
// Customer list query builder. Aggregates order stats with a single LEFT JOIN
// to a per-user aggregate subquery (no N+1). Supports search, filter, sort,
// and pagination. Returns { sql, params, countSql, countParams }.
// ---------------------------------------------------------------------------

const SORTS = {
  newest: 'u.created_at DESC NULLS LAST',
  oldest: 'u.created_at ASC NULLS LAST',
  top_spend: 'stats.lifetime_spend DESC NULLS LAST',
  most_orders: 'stats.order_count DESC NULLS LAST',
  recent_order: 'stats.last_order DESC NULLS LAST',
};

const FILTERS = new Set([
  'all', 'active', 'disabled', 'has_orders', 'no_orders', 'google', 'email',
]);

function buildCustomerListQuery(opts = {}) {
  const params = [];
  const where = [];
  const search = (opts.search || '').trim();
  if (search) {
    params.push('%' + search.toLowerCase() + '%');
    const p = '$' + params.length;
    where.push(
      '(LOWER(u.name) LIKE ' + p + ' OR LOWER(u.email) LIKE ' + p +
      ' OR LOWER(u.id) LIKE ' + p + ')'
    );
  }

  const filter = FILTERS.has(opts.filter) ? opts.filter : 'all';
  if (filter === 'active') {
    where.push('u.disabled_at IS NULL');
  } else if (filter === 'disabled') {
    where.push('u.disabled_at IS NOT NULL');
  } else if (filter === 'has_orders') {
    where.push('COALESCE(stats.order_count, 0) > 0');
  } else if (filter === 'no_orders') {
    where.push('COALESCE(stats.order_count, 0) = 0');
  } else if (filter === 'google') {
    where.push('u.google_id IS NOT NULL');
  } else if (filter === 'email') {
    where.push('u.password_hash IS NOT NULL');
  }

  const orderBy = SORTS[opts.sort] || SORTS.newest;
  const limit = Math.min(Math.max(parseInt(opts.pageSize, 10) || 25, 1), 100);
  const page = Math.max(parseInt(opts.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  const statsJoin = `
    LEFT JOIN (
      SELECT o.user_id,
             COUNT(*) FILTER (WHERE ${PAID_ORDER_SQL}) AS order_count,
             COALESCE(SUM(o.total) FILTER (WHERE ${PAID_ORDER_SQL}), 0) AS lifetime_spend,
             MAX(o.created_at) FILTER (WHERE ${PAID_ORDER_SQL}) AS last_order
      FROM orders o
      GROUP BY o.user_id
    ) stats ON stats.user_id = u.id`;

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  params.push(limit); const limP = '$' + params.length;
  params.push(offset); const offP = '$' + params.length;

  const sql = `
    SELECT u.id, u.name, u.email, u.created_at, u.disabled_at,
           u.google_id, u.password_hash, u.provider, u.role,
           COALESCE(stats.order_count, 0) AS order_count,
           COALESCE(stats.lifetime_spend, 0) AS lifetime_spend,
           stats.last_order
    FROM users u
    ${statsJoin}
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ${limP} OFFSET ${offP}`;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM users u
    ${statsJoin}
    ${whereSql}`;
  const countParams = params.slice(0, params.length - 2);

  return { sql, params, countSql, countParams, limit, page };
}

module.exports = {
  isAccountDisabled,
  disabledValue,
  enabledValue,
  deriveAuthMethod,
  canReceivePasswordReset,
  orderCountsTowardSpend,
  computeCustomerStats,
  PAID_ORDER_SQL,
  redactCustomer,
  assertNoSecrets,
  SENSITIVE_KEYS,
  deriveAddressHistory,
  buildCustomerListQuery,
  SORTS,
  FILTERS,
};
