const express = require('express');
const productsRouter = require("./routes/products");
const createCartRouter = require("./routes/cart");
const createOrdersRouter = require("./routes/orders");
const createAdminRouter = require("./routes/admin");
const createAdminProductsRouter = require('./routes/admin-products');
const createAdminVariantsRouter = require('./routes/admin-variants');
const createAdminPromosRouter = require('./routes/admin-promos');
const createEasyPostWebhookRouter = require('./routes/easypost-webhooks');
const createCoasRouter = require('./routes/coas');
const { createReviewsRouter, createAdminReviewsRouter } = require('./routes/reviews');
const createAdminCustomersRouter = require('./routes/admin-customers');
const { isAccountDisabled } = require('./services/admin-customers');
const createAdminCoasRouter = require('./routes/admin-coas');
const createCheckoutShippingRouter = require('./routes/checkout-shipping');
const { createCheckoutCardRouter } = require('./routes/checkout-card');
const { transferGuestCart } = require("./routes/cart");
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db/connection');
const { runMigrations } = require('./db/migrate');
const {
  OAuthResolutionError,
  resolveGoogleAuthUser,
  completeGoogleLogin,
  verifyPasswordLogin
} = require('./services/google-auth');
const { sanitizeReturnPath, withAuthQuery } = require('./services/oauth-redirect');
const { isAgeConfirmed, asyncHandler } = require('./services/auth-validation');
const { ensureBootstrapAdmin } = require('./services/admin-bootstrap');
const { loadProjectEnv } = require('./services/runtime-config');
const { resolveGoogleCallbackUrl } = require('./services/google-config');
const { classifyStaticRequest } = require('./services/static-exposure-policy');
const { createPublicCatalog, isIndexable } = require('./services/public-catalog');
const {
  renderShopPage,
  renderProductPage,
  renderNotFoundPage
} = require('./services/public-page');

loadProjectEnv({ cwd: __dirname });
require('dotenv').config();

// A request-level failure must never take the site down. Express 4 does not
// catch rejections thrown by async route handlers, and Node terminates the
// process on an unhandled rejection, so one failing query used to be enough to
// kill the server. These handlers log and keep serving. (An uncaught exception
// can in principle leave state inconsistent; we accept that over an outage,
// and the wrapper below means route errors reach the error middleware instead
// of ever getting here.)
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error && error.stack ? error.stack : error);
});

const app = express();

// Forward rejections from async route handlers to the error middleware.
['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].forEach((method) => {
  const original = app[method].bind(app);
  app[method] = function () {
    const args = Array.prototype.slice.call(arguments).map((arg) => {
      if (typeof arg !== 'function' || arg.length >= 4) return arg;
      return function (req, res, next) {
        return Promise.resolve(arg(req, res, next)).catch(next);
      };
    });
    return original.apply(app, args);
  };
});
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret-change-me';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;
const PUBLIC_HTML_PATHS = new Set([
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/forgot-password.html',
  '/reset-password.html',
  '/privacy-policy.html',
  '/terms-of-service.html',
  // These three are already public in production: vercel.json serves them as
  // static files, so requests for them never reach Express. Express itself
  // still treated them as gated, so the app and the deployment disagreed and
  // the pages redirected to login when run locally or on any non-Vercel host.
  // Listing them here makes the two agree and makes the pages safe to publish
  // in sitemap.xml. They are public legal text and expose no customer data.
  '/terms-conditions.html',
  '/refund-policy.html',
  '/shipping-policy.html',
  '/coas.html'
]);
const AUTH_HTML_PATHS = new Set([
  '/login.html',
  '/register.html',
  '/forgot-password.html',
  '/reset-password.html'
]);
const PAGE_ALIASES = {
  '/home': '/index.html',
  '/login': '/login.html',
  '/register': '/register.html',
  '/forgot-password': '/forgot-password.html',
  '/reset-password': '/reset-password.html',
  '/shop': '/shop.html',
  '/account': '/account.html',
  '/checkout': '/checkout.html',
  '/coas': '/coas.html',
  '/privacy-policy': '/privacy-policy.html',
  '/terms-of-service': '/terms-of-service.html'
};

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function deriveDisplayNameFromEmail(email) {
  const localPart = normalizeEmail(email).split('@')[0] || 'Researcher';
  return localPart
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase()) || 'Researcher';
}

function toNullableDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return raw;
}

function sanitizeReturnTo(value, fallback) {
  return sanitizeReturnPath(value) || fallback;
}

function buildLoginRedirectTarget(req) {
  const safeReturnTo = sanitizeReturnTo(req.originalUrl, '/shop.html');
  const params = new URLSearchParams();
  params.set('returnTo', safeReturnTo);
  return '/login.html?' + params.toString();
}

function applyPersistentSession(req) {
  if (!req || !req.session || !req.session.cookie) return;
  req.session.cookie.maxAge = SESSION_MAX_AGE_MS;
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    if (!req || !req.session || typeof req.session.save !== 'function') {
      return resolve();
    }
    req.session.save((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    institution: user.institution || '',
    provider: user.provider || 'Email',
    createdAt: user.createdAt || null
  };
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    institution: row.institution,
    birthday: row.birthday || null,
    businessType: row.business_type || '',
    provider: row.provider,
    passwordHash: row.password_hash || '',
    googleId: row.google_id || '',
    resetTokenHash: row.reset_token_hash || null,
    resetTokenExpiresAt: row.reset_token_expires_at || null,
    createdAt: row.created_at || null,
    role: row.role || 'customer',
    disabledAt: row.disabled_at || null
  };
}

function mapAddressRow(row) {
  if (!row) {
    return {
      billingAddress: '',
      shippingAddress: ''
    };
  }

  return {
    billingAddress: row.billing_address || '',
    shippingAddress: row.shipping_address || ''
  };
}

function toMoney(value) {
  const num = Number(value || 0);
  return Math.round(num * 100) / 100;
}

function authCodeFromError(err) {
  if (err && err.code) return String(err.code);
  return 'google-failed';
}

async function findUserById(id) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1;', [id]);
  return mapUserRow(result.rows[0]);
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  const result = await pool.query('SELECT * FROM users WHERE email = $1;', [normalized]);
  return mapUserRow(result.rows[0]);
}

async function saveOrUpdateUser(nextUser) {
  const existing = await pool.query('SELECT id FROM users WHERE id = $1;', [nextUser.id]);

  if (existing.rows[0]) {
    await pool.query(
      `
      UPDATE users
      SET name = $1, email = $2, institution = $3, provider = $4, password_hash = $5, google_id = $6, role = $7, birthday = $8, business_type = $9, age_confirmed_21_plus = COALESCE($10, age_confirmed_21_plus), age_confirmed_at = COALESCE($11, age_confirmed_at), updated_at = NOW()
      WHERE id = $12;
      `,
      [
        nextUser.name,
        normalizeEmail(nextUser.email),
        nextUser.institution,
        nextUser.provider,
        nextUser.passwordHash || null,
        nextUser.googleId || null,
        nextUser.role || 'customer',
        toNullableDate(nextUser.birthday),
        String(nextUser.businessType || '').trim() || null,
        nextUser.ageConfirmed === true ? true : null,
        nextUser.ageConfirmedAt || null,
        nextUser.id,
      ]
    );
    return;
  }

  await pool.query(
    `
    INSERT INTO users (id, name, email, institution, provider, password_hash, google_id, role, birthday, business_type, age_confirmed_21_plus, age_confirmed_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);
    `,
    [
      nextUser.id,
      nextUser.name,
      normalizeEmail(nextUser.email),
      nextUser.institution,
      nextUser.provider,
      nextUser.passwordHash || null,
      nextUser.googleId || null,
      nextUser.role || 'customer',
      toNullableDate(nextUser.birthday),
      String(nextUser.businessType || '').trim() || null,
    nextUser.ageConfirmed === true ? true : null,
    nextUser.ageConfirmedAt || null,
    ]
  );
}

async function hydrateAuthenticatedUser(req) {
  if (req.user && req.user.id) {
    applyPersistentSession(req);
    return req.user;
  }

  if (!(req.session && req.session.userId)) {
    return null;
  }

  const sessionUser = await findUserById(req.session.userId);
  if (!sessionUser) {
    req.session.destroy(() => {});
    return null;
  }

  if (isAccountDisabled(sessionUser)) {
      req.session.destroy(() => {});
      return null;
    }

    req.user = sessionUser;
  applyPersistentSession(req);
  return sessionUser;
}

async function requireApiAuth(req, res, next) {
  try {
    const user = await hydrateAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

async function findAddressByUserId(userId) {
  const result = await pool.query('SELECT * FROM user_addresses WHERE user_id = $1;', [userId]);
  return mapAddressRow(result.rows[0]);
}

async function saveAddressByUserId(userId, nextAddress) {
  await pool.query(
    `
    INSERT INTO user_addresses (user_id, billing_address, shipping_address, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT(user_id) DO UPDATE SET
      billing_address = excluded.billing_address,
      shipping_address = excluded.shipping_address,
      updated_at = NOW();
    `,
    [
      userId,
      String(nextAddress.billingAddress || '').trim(),
      String(nextAddress.shippingAddress || '').trim(),
    ]
  );
}

async function listOrdersByUserId(userId) {
  const orderResult = await pool.query(
    `
    SELECT id, status, total_amount, created_at
    FROM orders
    WHERE user_id = $1
    ORDER BY created_at DESC;
    `,
    [userId]
  );
  const orderRows = orderResult.rows;

  if (!orderRows.length) return [];

  const orderIds = orderRows.map((row) => row.id);
  const placeholders = orderIds.map((_, i) => '$' + (i + 1)).join(',');
  const itemResult = await pool.query(
    `
    SELECT order_id, product_id, product_name, unit_price, quantity, line_total
    FROM order_items
    WHERE order_id IN (${placeholders})
    ORDER BY id ASC;
    `,
    orderIds
  );
  const itemRows = itemResult.rows;

  const itemsByOrderId = new Map();
  for (const row of itemRows) {
    const existing = itemsByOrderId.get(row.order_id) || [];
    existing.push({
      productId: row.product_id,
      name: row.product_name,
      unitPrice: toMoney(row.unit_price),
      quantity: Number(row.quantity || 0),
      lineTotal: toMoney(row.line_total),
    });
    itemsByOrderId.set(row.order_id, existing);
  }

  return orderRows.map((row) => ({
    id: row.id,
    status: row.status,
    totalAmount: toMoney(row.total_amount),
    createdAt: row.created_at,
    items: itemsByOrderId.get(row.id) || [],
  }));
}

async function createOrderByUserId(userId, payloadItems) {
  const items = Array.isArray(payloadItems) ? payloadItems : [];
  if (!items.length) {
    throw new Error('Order must include at least one item.');
  }

  const normalizedItems = items.map((item) => {
    const name = String(item.name || '').trim();
    const quantity = Math.max(1, Number(item.quantity || 0));
    const unitPrice = toMoney(item.unitPrice);
    const productId = String(item.productId || '').trim();

    if (!name || !productId || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error('Invalid order item payload.');
    }

    return {
      productId,
      name,
      quantity,
      unitPrice,
      lineTotal: toMoney(quantity * unitPrice),
    };
  });

  const orderId = crypto.randomUUID();
  const totalAmount = toMoney(normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO orders (id, user_id, status, total_amount) VALUES ($1, $2, $3, $4);',
      [orderId, userId, 'Processing', totalAmount]
    );

    for (const item of normalizedItems) {
      await client.query(
        `
        INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
        VALUES ($1, $2, $3, $4, $5, $6);
        `,
        [orderId, item.productId, item.name, item.unitPrice, item.quantity, item.lineTotal]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return {
    id: orderId,
    status: 'Processing',
    totalAmount,
    items: normalizedItems,
  };
}

// ---------------------------------------------------------------------------
// Search-engine files (robots.txt / sitemap.xml).
//
// These are registered here, ahead of the session, auth and static middleware,
// and well ahead of the `app.get('*')` HTML fallback near the bottom of this
// file. That fallback redirects any unauthenticated request to /login.html,
// which is why GET /sitemap.xml used to answer with the login page's markup and
// Search Console reported "Sitemap can be read, but has errors / Sitemap is
// HTML". Keep these handlers above the auth middleware: moving them below it
// reintroduces that bug.
//
// Serving these two files publicly does not weaken any protection. They contain
// no private data, and every gated route keeps its existing auth check.
// ---------------------------------------------------------------------------
const CANONICAL_ORIGIN = String(process.env.CANONICAL_ORIGIN || 'https://pepxresearch.com')
  .trim()
  .replace(/\/+$/, '');

// Only paths that already return 200 to a signed-out visitor belong here: a
// sitemap entry that redirects or 404s is reported as an error by Search
// Console. Deliberately excluded: /shop.html, /product.html, /account.html,
// /checkout.html, the post-purchase confirmation page and /admin.html (all
// auth-gated and redirect to /login.html), /login.html, /register.html,
// /forgot-password.html and /reset-password.html (authentication pages, no
// search value), every /api/* endpoint, /auth/* and the EasyPost webhook.
const publicCatalog = createPublicCatalog({ pool });

// Deliberately narrow: the homepage, the catalogue, and the COA page. Category
// and eligible product URLs are appended from the database in buildSitemapXml.
//
// The policy pages (shipping, privacy, refund, terms) are NOT listed. They stay
// indexable - each keeps its own canonical and index,follow - they are simply
// not submitted, so the sitemap stays focused on the pages that are meant to
// earn search traffic rather than diluted with boilerplate.
const STATIC_SITEMAP_PATHS = [
  '/',
  '/shop',
  '/coas.html'
];

function sitemapEntry(origin, loc, lastmod) {
  const lines = ['  <url>', '    <loc>' + origin + loc + '</loc>'];
  if (lastmod) {
    const date = lastmod instanceof Date ? lastmod : new Date(lastmod);
    if (!Number.isNaN(date.getTime())) {
      lines.push('    <lastmod>' + date.toISOString().slice(0, 10) + '</lastmod>');
    }
  }
  lines.push('  </url>');
  return lines.join('\n');
}

// changefreq and priority are gone: Google ignores both. lastmod it does use.
//
// Product URLs are filtered by isIndexable() - active, and carrying enough of
// its own description to deserve a search result. A product page with an empty
// description is still rendered and still linked from /shop, but it is marked
// noindex and never announced here. That keeps a half-written catalogue from
// being submitted to Google as a finished one, and it means the gate moves the
// moment reviewed copy is written to products.description, with no code change.
async function buildSitemapXml(origin) {
  let entries = STATIC_SITEMAP_PATHS.map((loc) => sitemapEntry(origin, loc, null));

  try {
    const [categories, products] = await Promise.all([
      publicCatalog.categories(),
      publicCatalog.indexableProducts()
    ]);
    entries = entries
      .concat(categories.map((category) => sitemapEntry(origin, category.path, null)))
      .concat(products.map((product) => sitemapEntry(origin, product.path, product.updatedAt)));
  } catch (error) {
    // A sitemap that 500s is reported as an error in Search Console, so a
    // database problem degrades to the static list rather than failing.
    console.error('[sitemap] catalogue unavailable, serving static entries only:',
      error && error.message ? error.message : error);
  }

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.join('\n') + '\n' +
    '</urlset>\n';
}

function buildRobotsTxt(origin) {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    '# Authenticated and transactional areas. These already redirect signed-out',
    '# visitors to the login page; this only saves crawlers the round trip.',
    'Disallow: /api/',
    'Disallow: /auth/',
    'Disallow: /uploads/',
    'Disallow: /account.html',
    'Disallow: /checkout.html',
    'Disallow: /forgot-password.html',
    'Disallow: /reset-password.html',
    '',
    'Disallow: /admin.html',
    '',
    '# Login redirects append a returnTo parameter; crawling those produces',
    '# endless duplicates of the same login page.',
    '#',
    '# Retained deliberately. It has a known side effect: a gated page redirects',
    '# to /login.html?returnTo=..., so Search Console reports the gated page',
    '# itself as "blocked by robots.txt" rather than merely gated. That was a',
    '# real cost while /shop.html was the only catalogue; now that /shop and',
    '# /products/<slug> are public and indexable, the pages still behind the',
    '# gate are ones we do not want indexed anyway, so the report noise is',
    '# cheaper than the duplicate login URLs this rule prevents.',
    'Disallow: /*?returnTo=',
    '',
    'Sitemap: ' + origin + '/sitemap.xml',
    ''
  ].join('\n');
}

app.get('/robots.txt', (req, res) => {
  res.type('text/plain; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(buildRobotsTxt(CANONICAL_ORIGIN));
});

app.get('/sitemap.xml', async (req, res) => {
  res.type('application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(await buildSitemapXml(CANONICAL_ORIGIN));
});

app.use('/api/webhooks/easypost', express.raw({ type: 'application/json' }), createEasyPostWebhookRouter({ pool }));
app.use(express.json());
const sessionCookieSecure = process.env.NODE_ENV === 'production';
app.use(
  session({
    store: new pgSession({
      pool: pool,
      tableName: 'session'
    }),
    name: 'pepx.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: sessionCookieSecure,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_MS
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await findUserById(id);
    done(null, user || false);
  } catch (error) {
    done(error);
  }
});

const googleCallbackUrl = resolveGoogleCallbackUrl(process.env);
const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID &&
  !!process.env.GOOGLE_CLIENT_SECRET &&
  !!googleCallbackUrl;

const bootstrapAdminConfigured = !!process.env.ADMIN_EMAIL && !!process.env.ADMIN_PASSWORD;

if (googleConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: googleCallbackUrl
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await resolveGoogleAuthUser({
            pool,
            profile,
            createId: () => crypto.randomUUID()
          });
          return done(null, user);
        } catch (error) {
          if (error instanceof OAuthResolutionError) {
            return done(null, false, { code: authCodeFromError(error) });
          }
          return done(error);
        }
      }
    )
  );
}

async function requireAuth(req, res, next) {
  try {
    const user = await hydrateAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

app.get('/api/auth/config', (req, res) => {
  return res.json({ googleConfigured });
});

app.post('/api/auth/signup', async (req, res) => {
  const {
    name,
    email,
    password,
    confirmPassword,
    institution,
    businessType,
    birthday,
    ageConfirmed
  } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const selectedBusinessType = String(businessType || institution || '').trim();
  const displayName = String(name || '').trim() || deriveDisplayNameFromEmail(normalizedEmail);

  if (!normalizedEmail || !password || !selectedBusinessType) {
    return res.status(400).json({ error: 'Please complete all required registration fields.' });
  }

  if (!isAgeConfirmed(ageConfirmed)) {
    return res.status(400).json({ error: 'You must confirm that you are 21 years of age or older.' });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  if (confirmPassword != null && String(password) !== String(confirmPassword)) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  if (await findUserByEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Unable to create account with the provided details.' });
  }

  const passwordHash = await bcrypt.hash(String(password), 12);
  const user = {
    id: crypto.randomUUID(),
    name: displayName,
    email: normalizedEmail,
    institution: selectedBusinessType,
    businessType: selectedBusinessType,
    birthday: toNullableDate(birthday),
    provider: 'Email',
    passwordHash,
    googleId: '',
    ageConfirmed: true,
    ageConfirmedAt: new Date()
  };

  await saveOrUpdateUser(user);
  req.session.userId = user.id;
  applyPersistentSession(req);
  await saveSession(req);
  await transferGuestCart(req.sessionID, user.id);

  return res.status(201).json({ user: toPublicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = await findUserByEmail(normalizedEmail);
  const matches = await verifyPasswordLogin(user, password, bcrypt.compare.bind(bcrypt));
    if (isAccountDisabled(user)) {
      return res.status(403).json({ error: 'This account has been disabled. Please contact support.' });
    }
  if (!matches) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  req.session.userId = user.id;
  applyPersistentSession(req);
  await saveSession(req);
  await transferGuestCart(req.sessionID, user.id);
  return res.json({ user: toPublicUser(user) });
});

app.post('/api/auth/request-password-reset', async (req, res) => {
  const normalizedEmail = normalizeEmail(req.body && req.body.email);
  const genericResponse = {
    ok: true,
    message: 'If an account matches that email, password reset instructions have been prepared.'
  };

  if (!normalizedEmail) {
    return res.json(genericResponse);
  }

  const user = await findUserByEmail(normalizedEmail);
  if (!user) {
    return res.json(genericResponse);
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await pool.query(
    'UPDATE users SET reset_token_hash = $1, reset_token_expires_at = $2, updated_at = NOW() WHERE id = $3',
    [tokenHash, expiresAt.toISOString(), user.id]
  );

  const debugResetPath = '/reset-password.html?token=' + encodeURIComponent(rawToken);
  if (process.env.NODE_ENV !== 'production') {
    console.log('Password reset link for %s: %s', normalizedEmail, debugResetPath);
    return res.json({ ...genericResponse, debugResetPath });
  }

  return res.json(genericResponse);
});

app.post('/api/auth/reset-password', async (req, res) => {
  const token = String((req.body && req.body.token) || '').trim();
  const password = String((req.body && req.body.password) || '');
  const confirmPassword = String((req.body && req.body.confirmPassword) || '');

  if (!token) {
    return res.status(400).json({ error: 'Reset token is required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await pool.query(
    `SELECT *
       FROM users
      WHERE reset_token_hash = $1
        AND reset_token_expires_at IS NOT NULL
        AND reset_token_expires_at > NOW()
      LIMIT 1`,
    [tokenHash]
  );

  if (!result.rows.length) {
    return res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
  }

  const user = mapUserRow(result.rows[0]);
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `UPDATE users
        SET password_hash = $1,
            reset_token_hash = NULL,
            reset_token_expires_at = NULL,
            updated_at = NOW()
      WHERE id = $2`,
    [passwordHash, user.id]
  );

  return res.json({ ok: true, message: 'Your password has been updated. You can now sign in.' });
});

app.post('/api/auth/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie('pepx.sid', {
        httpOnly: true,
        secure: sessionCookieSecure,
        sameSite: 'lax'
      });
      res.json({ ok: true });
    });
  });
});

app.get('/api/auth/session', async (req, res) => {
  try {
    const user = await hydrateAuthenticatedUser(req);
    if (user) {
      return res.json({ user: toPublicUser(user) });
    }
    return res.json({ user: null });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load auth session.' });
  }
});

app.get('/auth/google', (req, res, next) => {
  if (!googleConfigured) {
    const fallbackTarget = sanitizeReturnPath(req.query.next) || '/index.html';
    console.warn('Google OAuth requested but not configured. Missing client ID/secret or callback URL.');
    return res.redirect(withAuthQuery(fallbackTarget, 'google-not-configured'));
  }

  const requestedNext = sanitizeReturnPath(req.query.next) || '/account.html';
  if (!req.session) {
    return res.redirect(withAuthQuery(requestedNext, 'google-session-failed'));
  }
  req.session.oauthReturnTo = requestedNext;

  req.session.save(function (saveErr) {
    if (saveErr) {
      return res.redirect(withAuthQuery(requestedNext, 'google-session-failed'));
    }
    return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  });
});

app.get('/auth/google/callback', (req, res, next) => {
  if (!googleConfigured) {
    console.warn('Google OAuth callback requested but not configured.');
    return res.redirect('/index.html?auth=google-not-configured');
  }

  if (String(req.query.error || '') === 'access_denied') {
    const cancelledReturn = sanitizeReturnPath(req.session && req.session.oauthReturnTo) || '/account.html';
    if (req.session) delete req.session.oauthReturnTo;
    return res.redirect(withAuthQuery(cancelledReturn, 'google-cancelled'));
  }

  const returnTo = sanitizeReturnPath(req.session && req.session.oauthReturnTo) || '/account.html';
  if (req.session) delete req.session.oauthReturnTo;

  return passport.authenticate('google', function (err, user, info) {
    if (err) {
      return res.redirect(withAuthQuery(returnTo, authCodeFromError(err)));
    }
    if (!user) {
      const code = info && info.code ? String(info.code) : 'google-failed';
      return res.redirect(withAuthQuery(returnTo, code));
    }

    req.logIn(user, async function (loginErr) {
      if (loginErr) {
        return res.redirect(withAuthQuery(returnTo, 'google-session-failed'));
      }
      try {
        await completeGoogleLogin(req, user, transferGuestCart);
        return res.redirect(withAuthQuery(returnTo, 'google-success'));
      } catch (sessionErr) {
        return res.redirect(withAuthQuery(returnTo, authCodeFromError(sessionErr)));
      }
    });
  })(req, res, next);
});

app.get('/api/auth/protected', requireAuth, (req, res) => {
  return res.json({ user: toPublicUser(req.user) });
});

app.get('/api/account/overview', requireApiAuth, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const address = await findAddressByUserId(user.id);

    return res.json({
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        institution: user.institution,
        provider: user.provider,
        createdAt: user.createdAt,
        ...address
      },
      orders: []
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load account overview.' });
  }
});

app.put('/api/account/profile', requireAuth, async (req, res) => {
  try {
    const { name, email, institution } = req.body || {};
    const nextName = String(name || '').trim();
    const nextEmail = normalizeEmail(email);
    const nextInstitution = String(institution || '').trim();

    if (!nextName || !nextEmail || !nextInstitution) {
      return res.status(400).json({ error: 'Name, email, and institution are required.' });
    }

    const existingByEmail = await findUserByEmail(nextEmail);
    if (existingByEmail && existingByEmail.id !== req.user.id) {
      return res.status(409).json({ error: 'This email is already in use.' });
    }

    const current = await findUserById(req.user.id);
    if (!current) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await saveOrUpdateUser({
      ...current,
      name: nextName,
      email: nextEmail,
      institution: nextInstitution
    });

    const updated = await findUserById(req.user.id);
    return res.json({ user: toPublicUser(updated) });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

app.put('/api/account/addresses', requireAuth, async (req, res) => {
  try {
    const { billingAddress, shippingAddress } = req.body || {};
    await saveAddressByUserId(req.user.id, {
      billingAddress: String(billingAddress || ''),
      shippingAddress: String(shippingAddress || '')
    });

    const address = await findAddressByUserId(req.user.id);
    return res.json(address);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update addresses.' });
  }
});

app.put('/api/account/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const nextPassword = String(newPassword || '');

    if (nextPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.passwordHash) {
      const validCurrent = await bcrypt.compare(String(currentPassword || ''), user.passwordHash);
      if (!validCurrent) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
    }

    const passwordHash = await bcrypt.hash(nextPassword, 12);
    await saveOrUpdateUser({
      ...user,
      passwordHash
    });

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update password.' });
  }
});

app.post('/api/account/orders', function (req, res, next) {
  if (!req.user && !req.session.userId) {
    return res.status(401).json({ error: 'Login required to place order' });
  }
  next();
}, requireAuth, async (req, res) => {
  try {
    const { items } = req.body || {};
    const order = await createOrderByUserId(req.user.id, items);
    return res.status(201).json({ order });
  } catch (error) {
    const msg = error && error.message ? error.message : 'Failed to create order.';
    if (msg.includes('Invalid order item') || msg.includes('at least one item')) {
      return res.status(400).json({ error: msg });
    }
    return res.status(500).json({ error: 'Failed to create order.' });
  }
});

app.use("/api/products", requireApiAuth, productsRouter);
app.use("/api/cart", requireApiAuth, createCartRouter(requireAuth));
app.use('/api/checkout/shipping', requireApiAuth, createCheckoutShippingRouter(requireAuth));
app.use('/api/checkout/card', requireApiAuth, createCheckoutCardRouter({ pool, requireAuth }));
app.use("/api/orders", requireApiAuth, createOrdersRouter(requireAuth));
app.use('/api/admin/products', createAdminProductsRouter(requireAuth));
app.use('/api/admin', createAdminVariantsRouter(requireAuth));
app.use('/api/admin', createAdminPromosRouter(requireAuth));
app.use('/api/admin', createAdminCoasRouter(requireAuth));
app.use("/api/admin", createAdminRouter(requireAuth));
app.use('/api/coas', createCoasRouter());
  app.use('/api/reviews', createReviewsRouter());
  app.use('/api/admin', createAdminReviewsRouter(requireAuth));
  app.use('/api/admin', createAdminCustomersRouter(requireAuth));

app.use('/api/*', (req, res) => {
  return res.status(404).json({ error: 'API endpoint not found' });
});

// ---------------------------------------------------------------------------
// Public, server-rendered catalogue: /shop, /shop/:category, /products/:slug
//
// These are additive. /shop.html, /product.html, the cart, checkout, account,
// admin and every /api/* endpoint keep exactly the auth checks they had - the
// middleware below is untouched, and /api/products is still behind
// requireApiAuth. The public pages read the database directly through
// services/public-catalog.js, so opening pages to crawlers does not open the
// API to anyone.
//
// Registered here, after the session middleware and before the HTML auth gate,
// so a signed-in visitor can be handed back to the existing storefront while a
// signed-out visitor gets HTML.
//
// The branch is on SESSION STATE, never on user-agent or IP. Googlebot sees
// exactly what any signed-out human sees, which is what separates a public
// page from cloaking. hydrateAuthenticatedUser() returns null without touching
// the database when there is no session, so crawler traffic costs nothing.
// ---------------------------------------------------------------------------
function sendPublicHtml(res, html, status = 200) {
  res.type('html');
  // Vary: Cookie because the same URL answers with a redirect for signed-in
  // visitors; without it a shared cache could serve one audience the other's
  // response.
  res.set('Vary', 'Cookie');
  res.set('Cache-Control', 'public, max-age=300');
  return res.status(status).send(html);
}

function sendSignedInRedirect(res, location) {
  res.set('Cache-Control', 'private, no-store');
  res.set('Vary', 'Cookie');
  return res.redirect(302, location);
}

app.get('/shop', async (req, res, next) => {
  try {
    if (await hydrateAuthenticatedUser(req)) return sendSignedInRedirect(res, '/shop.html');

    const [products, categories] = await Promise.all([
      publicCatalog.listActive(),
      publicCatalog.categories()
    ]);
    return sendPublicHtml(res, renderShopPage({
      origin: CANONICAL_ORIGIN,
      products,
      categories
    }));
  } catch (error) {
    return next(error);
  }
});

app.get('/shop/:category', async (req, res, next) => {
  try {
    const categories = await publicCatalog.categories();
    const category = await publicCatalog.findCategory(req.params.category);

    // Unknown category is a 404, not an empty page: no crawlable space of
    // invented category URLs opens up.
    if (!category) {
      return sendPublicHtml(res, renderNotFoundPage({ origin: CANONICAL_ORIGIN, categories }), 404);
    }

    if (await hydrateAuthenticatedUser(req)) {
      return sendSignedInRedirect(res, '/shop.html?category=' + encodeURIComponent(category.name));
    }

    const products = await publicCatalog.listByCategory(category.slug);
    return sendPublicHtml(res, renderShopPage({
      origin: CANONICAL_ORIGIN,
      products,
      categories,
      category
    }));
  } catch (error) {
    return next(error);
  }
});

app.get('/products/:slug', async (req, res, next) => {
  try {
    const categories = await publicCatalog.categories();
    const product = await publicCatalog.findBySlug(req.params.slug);

    if (!product) {
      return sendPublicHtml(res, renderNotFoundPage({ origin: CANONICAL_ORIGIN, categories }), 404);
    }

    if (await hydrateAuthenticatedUser(req)) {
      return sendSignedInRedirect(res, '/product.html?product=' + encodeURIComponent(product.id));
    }

    const siblings = await publicCatalog.listByCategory(product.categorySlug);
    const related = siblings.filter((candidate) => candidate.slug !== product.slug).slice(0, 4);

    return sendPublicHtml(res, renderProductPage({
      origin: CANONICAL_ORIGIN,
      product,
      related,
      categories,
      indexable: isIndexable(product)
    }));
  } catch (error) {
    return next(error);
  }
});

app.get(Object.keys(PAGE_ALIASES), (req, res) => {
  const targetPath = PAGE_ALIASES[req.path] || '/index.html';
  const queryIndex = req.originalUrl.indexOf('?');
  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
  return res.redirect(targetPath + query);
});

// The marketing homepage is public. It is the only page Google can use to
// associate the "PepX Research" brand with this domain, and a crawler that is
// bounced to /login.html never sees it. Only this page is opened up: the
// catalogue (/shop.html, /product.html), the account area, checkout, order
// confirmation, the admin tools and every /api/* endpoint keep exactly the auth
// checks they had before, in the middleware below.
//
// Signed-out visitors get a variant of the same file marked `pepx-public`.
// script.js is served to signed-in visitors only, so for everyone else the
// sections it would populate (best sellers, the product grid, the review
// collage and the review form) would otherwise render as empty shells. The
// class lets styles.css hide them, and pulls in public-home.js, which restores
// the FAQ accordion and mobile menu that script.js would normally wire up.
// Signed-in visitors are served the file unchanged.
//
// The check reads the session cookie only - no database lookup - and matches
// what every login path sets. It grants nothing: it decides presentation, and
// every gated route keeps its own auth check.
const INDEX_HTML_PATH = path.join(__dirname, 'index.html');

// This read happens once at module load, so a throw here would abort the import
// and take down every route in the application, not just the homepage. It must
// not be able to. If the variant cannot be built, INDEX_HTML_PUBLIC stays null
// and signed-out visitors are served index.html directly: the empty storefront
// sections stop being hidden, which is a cosmetic regression, not an outage.
let INDEX_HTML_PUBLIC = null;
try {
  INDEX_HTML_PUBLIC = fs.readFileSync(INDEX_HTML_PATH, 'utf8')
    .replace('<html lang="en">', '<html lang="en" class="pepx-public">')
    .replace('</body>', '<script src="/public-home.js"></script>\n</body>');

  if (!INDEX_HTML_PUBLIC.includes('class="pepx-public"') ||
      !INDEX_HTML_PUBLIC.includes('public-home.js')) {
    console.error('[startup] index.html no longer matches the signed-out homepage markers ' +
      '(<html lang="en"> and </body>); signed-out visitors will be served the page unmodified.');
  }
} catch (error) {
  console.error('[startup] could not build the signed-out homepage variant; signed-out visitors ' +
    'will be served index.html unmodified:', error && error.message ? error.message : error);
}

app.get(['/', '/index.html'], (req, res) => {
  if (INDEX_HTML_PUBLIC === null || req.user || (req.session && req.session.userId)) {
    return res.sendFile(INDEX_HTML_PATH);
  }
  res.type('html');
  return res.send(INDEX_HTML_PUBLIC);
});

app.use(async (req, res, next) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    if (req.path === '/script.js' && !(await hydrateAuthenticatedUser(req))) {
      return res.status(404).end();
    }

    // Product images are public: they appear on the signed-out catalogue pages
    // and in image search. /script.js above stays signed-in only - the public
    // pages are server-rendered and need none of it.

    if (!req.path.endsWith('.html')) {
      return next();
    }

    if (AUTH_HTML_PATHS.has(req.path)) {
      if (await hydrateAuthenticatedUser(req)) {
        const returnTo = sanitizeReturnTo(req.query && req.query.returnTo, '/shop.html');
        return res.redirect(returnTo);
      }
      return next();
    }

    if (PUBLIC_HTML_PATHS.has(req.path)) {
      return next();
    }

    if (!(await hydrateAuthenticatedUser(req))) {
      return res.redirect(buildLoginRedirectTarget(req));
    }

    return next();
  } catch (error) {
    return next(error);
  }
});

// express.static below serves this whole project directory, which also holds
// the server source, old backups and operational files. The guard that used to
// stand here was a list of five exact filenames plus a set of directory
// prefixes, and the HTML auth gate above only inspects paths ending in `.html`,
// so every *.bak, *.orderbak, .env.example, orders_backup_*.json and build
// archive in the project root was publicly downloadable.
//
// services/static-exposure-policy.js now decides what may be read off disk. It
// keeps the original deny-list, adds patterns for file shapes that are never
// client assets (backups, dumps, databases, archives, keys, logs), and puts an
// extension allowlist behind both so that an unrecognised file type answers 404
// instead of being served. That last layer is what makes a future accidental
// commit safe. See that file for the reasoning behind each layer.
const serveStaticAssets = express.static(path.join(__dirname), {
  dotfiles: 'deny',
  index: false
});

app.use((req, res, next) => {
  const verdict = classifyStaticRequest(req.path);

  // 404 rather than 403: a wrong guess should not confirm the file is there.
  if (verdict === 'deny') return res.status(404).end();

  // Not a static asset request (no file extension). It belongs to the routes
  // above and to the app.get('*') fallback, so express.static never sees it.
  if (verdict === 'skip') return next();

  return serveStaticAssets(req, res, next);
});

app.get('*', async (req, res, next) => {
  try {
    const user = await hydrateAuthenticatedUser(req);
    if (!user) {
      return res.redirect(buildLoginRedirectTarget(req));
    }
    return res.sendFile(path.join(__dirname, 'index.html'));
  } catch (error) {
    return next(error);
  }
});

// Centralized error handler. Catches errors forwarded by asyncHandler and
// route `next(err)` calls so a failed DB/session operation returns a safe
// response instead of crashing the process. Must be registered last.
app.use((err, req, res, next) => {
  console.error('[unhandled route error]', req.method, req.originalUrl, err && err.stack ? err.stack : err);
  if (res.headersSent) {
    return next(err);
  }
  const wantsJson = req.path.startsWith('/api/') ||
    (req.get('accept') || '').includes('application/json');
  if (wantsJson) {
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
  return res.status(500).send('An unexpected error occurred. Please try again.');
});

async function startServer() {
  // Migrations run on boot against whatever DATABASE_URL points at. Set
  // SKIP_DB_MIGRATIONS=true to start the server without touching the schema
  // (for example to run this code against a database you are not ready to
  // migrate). The local dev flow does not need it: scripts/dev-local.sh
  // points DATABASE_URL at a throwaway local database, so its migrations
  // apply there and nowhere else.
  if (String(process.env.SKIP_DB_MIGRATIONS).toLowerCase() === 'true') {
    console.log('SKIP_DB_MIGRATIONS=true - starting without running migrations.');
  } else {
    // A briefly unreachable database (a saturated connection pooler, a restart)
    // used to stop the process from ever calling listen(), which turned a
    // transient database problem into a full outage that could not self-heal.
    // Boot regardless; individual requests fail and recover on their own.
    try {
      await runMigrations();
    } catch (error) {
      console.error('[startup] migrations failed - starting anyway so the site stays reachable:',
        error && error.message ? error.message : error);
    }
  }

  try {
    await ensureBootstrapAdmin({
      pool,
      bcrypt,
      env: process.env,
      createId: () => crypto.randomUUID()
    });
  } catch (error) {
    console.error('[startup] bootstrap admin check failed - continuing:',
      error && error.message ? error.message : error);
  }

  if (bootstrapAdminConfigured && process.env.ADMIN_EMAIL) {
    console.log(`Bootstrap admin ready for ${process.env.ADMIN_EMAIL}`);
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PepX server listening on http://0.0.0.0:${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Server startup failed:', error);
    process.exit(1);
  });
}

module.exports = app;
