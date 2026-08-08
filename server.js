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
const createAdminCoasRouter = require('./routes/admin-coas');
const createCheckoutShippingRouter = require('./routes/checkout-shipping');
const { transferGuestCart } = require("./routes/cart");
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
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

loadProjectEnv({ cwd: __dirname });
require('dotenv').config();

const app = express();
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
    role: row.role || 'customer'
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
  });
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
app.use("/api/orders", requireApiAuth, createOrdersRouter(requireAuth));
app.use('/api/admin/products', createAdminProductsRouter(requireAuth));
app.use('/api/admin', createAdminVariantsRouter(requireAuth));
app.use('/api/admin', createAdminPromosRouter(requireAuth));
app.use('/api/admin', createAdminCoasRouter(requireAuth));
app.use("/api/admin", createAdminRouter(requireAuth));
app.use('/api/coas', createCoasRouter());
  app.use('/api/reviews', createReviewsRouter());
  app.use('/api/admin', createAdminReviewsRouter(requireAuth));

app.use('/api/*', (req, res) => {
  return res.status(404).json({ error: 'API endpoint not found' });
});

app.get(Object.keys(PAGE_ALIASES), (req, res) => {
  const targetPath = PAGE_ALIASES[req.path] || '/index.html';
  const queryIndex = req.originalUrl.indexOf('?');
  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
  return res.redirect(targetPath + query);
});

app.get(['/', '/index.html'], async (req, res, next) => {
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

app.use(async (req, res, next) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    if (req.path === '/script.js' && !(await hydrateAuthenticatedUser(req))) {
      return res.status(404).end();
    }

    if (req.path.startsWith('/assets/products/') && !(await hydrateAuthenticatedUser(req))) {
      return res.status(404).end();
    }

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

app.use(express.static(path.join(__dirname)));

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
  await runMigrations();
  await ensureBootstrapAdmin({
    pool,
    bcrypt,
    env: process.env,
    createId: () => crypto.randomUUID()
  });

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
