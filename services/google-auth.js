'use strict';

const { isAccountDisabled } = require('./admin-customers');

class OAuthResolutionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OAuthResolutionError';
    this.code = String(code || 'google-failed');
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    institution: row.institution,
    provider: row.provider,
    passwordHash: row.password_hash || '',
    googleId: row.google_id || '',
    createdAt: row.created_at || null,
    role: row.role || 'customer'
  };
}

function extractVerifiedGoogleEmail(profile) {
  var emails = Array.isArray(profile && profile.emails) ? profile.emails : [];
  var verified = emails.find(function (entry) {
    return !!(entry && entry.value && entry.verified === true);
  });

  if (verified) {
    return {
      ok: true,
      email: normalizeEmail(verified.value)
    };
  }

  if (emails.length > 0) {
    return {
      ok: false,
      code: 'google-email-unverified'
    };
  }

  return {
    ok: false,
    code: 'google-email-missing'
  };
}

async function safelyLinkOrCreateUser(client, input) {
  var googleId = input.googleId;
  var verifiedEmail = input.verifiedEmail;
  var displayName = input.displayName;
  var avatarUrl = input.avatarUrl;
  var newUserId = input.newUserId;

  var byGoogle = await client.query('SELECT * FROM users WHERE google_id = $1 FOR UPDATE', [googleId]);
  if (byGoogle.rows[0]) {
    return mapUserRow(byGoogle.rows[0]);
  }

  var byEmail = await client.query('SELECT * FROM users WHERE email = $1 FOR UPDATE', [verifiedEmail]);
  if (byEmail.rows[0]) {
    var existing = byEmail.rows[0];
    if (existing.google_id && existing.google_id !== googleId) {
      throw new OAuthResolutionError('google-link-conflict', 'This email is already linked to another Google account.');
    }

    var updated = await client.query(
      'UPDATE users SET google_id = $1, name = $2, google_avatar_url = $3, google_email_verified_at = COALESCE(google_email_verified_at, NOW()), updated_at = NOW() WHERE id = $4 RETURNING *',
      [googleId, existing.name || displayName, avatarUrl || null, existing.id]
    );
    return mapUserRow(updated.rows[0]);
  }

  var created = await client.query(
    'INSERT INTO users (id, name, email, institution, provider, password_hash, google_id, google_avatar_url, google_email_verified_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *',
    [
      newUserId,
      displayName,
      verifiedEmail,
      'Google Account',
      'Google',
      null,
      googleId,
      avatarUrl || null
    ]
  );
  return mapUserRow(created.rows[0]);
}

async function recoverFromUniqueConflict(pool, input) {
  var googleId = input.googleId;
  var verifiedEmail = input.verifiedEmail;

  var byGoogle = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
  if (byGoogle.rows[0]) return mapUserRow(byGoogle.rows[0]);

  var byEmail = await pool.query('SELECT * FROM users WHERE email = $1', [verifiedEmail]);
  if (!byEmail.rows[0]) {
    throw new OAuthResolutionError('google-link-failed', 'Could not safely complete Google sign-in.');
  }

  var row = byEmail.rows[0];
  if (row.google_id && row.google_id !== googleId) {
    throw new OAuthResolutionError('google-link-conflict', 'This email is already linked to another Google account.');
  }

  if (!row.google_id) {
    try {
      var linked = await pool.query(
        'UPDATE users SET google_id = $1, google_email_verified_at = COALESCE(google_email_verified_at, NOW()), updated_at = NOW() WHERE id = $2 AND google_id IS NULL RETURNING *',
        [googleId, row.id]
      );
      if (linked.rows[0]) {
        return mapUserRow(linked.rows[0]);
      }
    } catch (err) {
      if (!err || err.code !== '23505') throw err;
    }

    var retryByGoogle = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    if (retryByGoogle.rows[0]) return mapUserRow(retryByGoogle.rows[0]);
  }

  return mapUserRow(row);
}

async function resolveGoogleAuthUser(options) {
  var pool = options.pool;
  var profile = options.profile;
  var createId = options.createId;

  var googleId = String(profile && profile.id || '').trim();
  if (!googleId) {
    throw new OAuthResolutionError('google-failed', 'Google account did not provide an account identifier.');
  }

  var emailResult = extractVerifiedGoogleEmail(profile);
  if (!emailResult.ok) {
    throw new OAuthResolutionError(emailResult.code, 'Google account did not provide a verified email.');
  }

  var verifiedEmail = emailResult.email;
  var displayName = String(profile && profile.displayName || '').trim() || 'Google User';
  var avatarUrl = String(profile && profile.photos && profile.photos[0] && profile.photos[0].value || '').trim();
  var newUserId = createId();

  var client = await pool.connect();
  try {
    await client.query('BEGIN');
    var user = await safelyLinkOrCreateUser(client, {
      googleId: googleId,
      verifiedEmail: verifiedEmail,
      displayName: displayName,
      avatarUrl: avatarUrl,
      newUserId: newUserId
    });
    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');

    if (err && err.code === '23505') {
      return recoverFromUniqueConflict(pool, {
        googleId: googleId,
        verifiedEmail: verifiedEmail
      });
    }

    throw err;
  } finally {
    client.release();
  }
}

function saveSession(session) {
  return new Promise(function (resolve, reject) {
    if (!session || typeof session.save !== 'function') {
      return reject(new OAuthResolutionError('google-session-failed', 'Session is unavailable.'));
    }
    session.save(function (err) {
      if (err) {
        return reject(new OAuthResolutionError('google-session-failed', 'Failed to save session.'));
      }
      resolve();
    });
  });
}

async function completeGoogleLogin(req, user, transferGuestCart) {
  if (!req || !req.session || !user || !user.id) {
    throw new OAuthResolutionError('google-failed', 'Google login context is missing.');
  }
  if (isAccountDisabled(user)) {
    throw new OAuthResolutionError('account-disabled', 'This account has been disabled. Please contact support.');
  }

  req.session.userId = user.id;
  await saveSession(req.session);

  try {
    await transferGuestCart(req.sessionID, user.id);
  } catch (err) {
    // Cart merge failure should not block account login.
    console.error('Guest cart transfer failed after Google login.');
  }
}

async function verifyPasswordLogin(user, password, compareFn) {
  if (!user || !user.passwordHash) return false;
  return compareFn(String(password || ''), user.passwordHash);
}

module.exports = {
  OAuthResolutionError,
  extractVerifiedGoogleEmail,
  resolveGoogleAuthUser,
  completeGoogleLogin,
  verifyPasswordLogin
};
