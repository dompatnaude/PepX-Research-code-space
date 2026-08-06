'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OAuthResolutionError,
  resolveGoogleAuthUser,
  extractVerifiedGoogleEmail,
  completeGoogleLogin,
  verifyPasswordLogin
} = require('../../services/google-auth');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMockPool(seedUsers, options) {
  const state = {
    users: clone(seedUsers || []),
    forceInsertConflictOnce: !!(options && options.forceInsertConflictOnce),
    onInsertConflict: options && typeof options.onInsertConflict === 'function' ? options.onInsertConflict : null
  };

  function asRow(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      institution: user.institution,
      provider: user.provider,
      password_hash: user.password_hash || null,
      google_id: user.google_id || null,
      role: user.role || 'customer',
      created_at: user.created_at || null
    };
  }

  function uniqueConflict() {
    const err = new Error('duplicate key value violates unique constraint');
    err.code = '23505';
    return err;
  }

  async function runQuery(sql, params) {
    const lower = String(sql).trim().toLowerCase();

    if (lower === 'begin' || lower === 'commit' || lower === 'rollback') {
      return { rows: [] };
    }

    if (lower.startsWith('select * from users where google_id = $1')) {
      const googleId = params[0];
      const row = state.users.find((u) => (u.google_id || null) === googleId);
      return { rows: row ? [asRow(row)] : [] };
    }

    if (lower.startsWith('select * from users where email = $1')) {
      const email = params[0];
      const row = state.users.find((u) => u.email === email);
      return { rows: row ? [asRow(row)] : [] };
    }

    if (lower.startsWith('update users set google_id = $1, name = $2, google_avatar_url = $3')) {
      const googleId = params[0];
      const name = params[1];
      const userId = params[3];

      const conflict = state.users.find((u) => u.google_id === googleId && u.id !== userId);
      if (conflict) throw uniqueConflict();

      const user = state.users.find((u) => u.id === userId);
      if (!user) return { rows: [] };
      user.google_id = googleId;
      user.name = name;
      if (!user.google_email_verified_at) user.google_email_verified_at = new Date().toISOString();
      return { rows: [asRow(user)] };
    }

    if (lower.startsWith('update users set google_id = $1, google_email_verified_at = coalesce')) {
      const googleId = params[0];
      const userId = params[1];
      const conflict = state.users.find((u) => u.google_id === googleId && u.id !== userId);
      if (conflict) throw uniqueConflict();

      const user = state.users.find((u) => u.id === userId && !u.google_id);
      if (!user) return { rows: [] };
      user.google_id = googleId;
      if (!user.google_email_verified_at) user.google_email_verified_at = new Date().toISOString();
      return { rows: [asRow(user)] };
    }

    if (lower.startsWith('insert into users')) {
      if (state.forceInsertConflictOnce) {
        state.forceInsertConflictOnce = false;
        if (state.onInsertConflict) state.onInsertConflict(state);
        throw uniqueConflict();
      }

      const id = params[0];
      const email = params[2];
      const googleId = params[6];
      const emailTaken = state.users.some((u) => u.email === email);
      const googleTaken = state.users.some((u) => (u.google_id || null) === googleId);
      if (emailTaken || googleTaken) throw uniqueConflict();

      const user = {
        id,
        name: params[1],
        email,
        institution: params[3],
        provider: params[4],
        password_hash: params[5],
        google_id: googleId,
        google_avatar_url: params[7],
        google_email_verified_at: new Date().toISOString(),
        role: 'customer',
        created_at: new Date().toISOString()
      };
      state.users.push(user);
      return { rows: [asRow(user)] };
    }

    throw new Error('Unsupported SQL in test mock: ' + sql);
  }

  return {
    state,
    async connect() {
      return {
        query: runQuery,
        release() {}
      };
    },
    query: runQuery
  };
}

function googleProfile(overrides) {
  return Object.assign(
    {
      id: 'google-123',
      displayName: 'Pat Researcher',
      emails: [{ value: 'pat@example.com', verified: true }],
      photos: [{ value: 'https://example.test/avatar.png' }]
    },
    overrides || {}
  );
}

test('creates a new Google user when no account exists', async () => {
  const pool = createMockPool([]);
  const user = await resolveGoogleAuthUser({
    pool,
    profile: googleProfile(),
    createId: () => 'user-new',
    ageConfirmed: true
  });

  assert.equal(user.id, 'user-new');
  assert.equal(user.email, 'pat@example.com');
  assert.equal(user.googleId, 'google-123');
  assert.equal(pool.state.users.length, 1);
});

test('rejects new Google user without age confirmation', async () => {
  const pool = createMockPool([]);
  await assert.rejects(
    () => resolveGoogleAuthUser({ pool, profile: googleProfile(), createId: () => 'u-blocked' }),
    (err) => err.code === 'google-age-required'
  );
  assert.equal(pool.state.users.length, 0);
});

test('logs in an existing user by google_id', async () => {
  const pool = createMockPool([
    {
      id: 'u1',
      name: 'Existing',
      email: 'pat@example.com',
      institution: 'Lab',
      provider: 'Google',
      password_hash: null,
      google_id: 'google-123',
      role: 'customer'
    }
  ]);

  const user = await resolveGoogleAuthUser({
    pool,
    profile: googleProfile(),
    createId: () => 'ignored'
  });

  assert.equal(user.id, 'u1');
  assert.equal(pool.state.users.length, 1);
});

test('links verified-email Google login to existing local account', async () => {
  const pool = createMockPool([
    {
      id: 'u2',
      name: 'Local User',
      email: 'pat@example.com',
      institution: 'Lab',
      provider: 'Email',
      password_hash: 'hashed-password',
      google_id: null,
      role: 'customer'
    }
  ]);

  const user = await resolveGoogleAuthUser({
    pool,
    profile: googleProfile(),
    createId: () => 'ignored'
  });

  assert.equal(user.id, 'u2');
  assert.equal(pool.state.users[0].google_id, 'google-123');
  assert.equal(pool.state.users[0].password_hash, 'hashed-password');
});

test('rejects unverified Google email for linking/creation', async () => {
  const pool = createMockPool([]);

  await assert.rejects(
    resolveGoogleAuthUser({
      pool,
      profile: googleProfile({ emails: [{ value: 'pat@example.com', verified: false }] }),
      createId: () => 'unused'
    }),
    (err) => err instanceof OAuthResolutionError && err.code === 'google-email-unverified'
  );
});

test('prevents duplicate user creation during unique-race conflicts', async () => {
  const pool = createMockPool([], {
    forceInsertConflictOnce: true,
    onInsertConflict(state) {
      state.users.push({
        id: 'u-race',
        name: 'Concurrent User',
        email: 'pat@example.com',
        institution: 'Lab',
        provider: 'Google',
        password_hash: null,
        google_id: 'google-123',
        role: 'customer'
      });
    }
  });

  const user = await resolveGoogleAuthUser({
    pool,
    profile: googleProfile(),
    createId: () => 'u-new',
    ageConfirmed: true
  });

  assert.equal(user.id, 'u-race');
  assert.equal(pool.state.users.length, 1);
});

test('preserves admin role when linking existing email account', async () => {
  const pool = createMockPool([
    {
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.com',
      institution: 'HQ',
      provider: 'Email',
      password_hash: 'hash',
      google_id: null,
      role: 'admin'
    }
  ]);

  const user = await resolveGoogleAuthUser({
    pool,
    profile: googleProfile({ id: 'google-admin', emails: [{ value: 'admin@example.com', verified: true }] }),
    createId: () => 'unused'
  });

  assert.equal(user.id, 'admin-1');
  assert.equal(user.role, 'admin');
  assert.equal(pool.state.users[0].role, 'admin');
});

test('password login supports local users and safely rejects OAuth-only users', async () => {
  const compare = async (plain, hash) => plain === 'secret123' && hash === 'stored-hash';

  const ok = await verifyPasswordLogin({ id: 'local', passwordHash: 'stored-hash' }, 'secret123', compare);
  const bad = await verifyPasswordLogin({ id: 'local', passwordHash: 'stored-hash' }, 'wrong', compare);
  const oauthOnly = await verifyPasswordLogin({ id: 'oauth', passwordHash: '' }, 'secret123', compare);

  assert.equal(ok, true);
  assert.equal(bad, false);
  assert.equal(oauthOnly, false);
});

test('completes OAuth session establishment and saves session', async () => {
  const req = {
    sessionID: 'sess-1',
    session: {
      userId: null,
      save(cb) { cb(null); }
    }
  };

  let merged = null;
  await completeGoogleLogin(req, { id: 'u1' }, async (sessionId, userId) => {
    merged = { sessionId, userId };
  });

  assert.equal(req.session.userId, 'u1');
  assert.deepEqual(merged, { sessionId: 'sess-1', userId: 'u1' });
});

test('returns explicit error when session save fails', async () => {
  const req = {
    sessionID: 'sess-1',
    session: {
      userId: null,
      save(cb) { cb(new Error('boom')); }
    }
  };

  await assert.rejects(
    completeGoogleLogin(req, { id: 'u1' }, async () => {}),
    (err) => err instanceof OAuthResolutionError && err.code === 'google-session-failed'
  );
});

test('extractVerifiedGoogleEmail handles missing email safely', () => {
  const result = extractVerifiedGoogleEmail({ emails: [] });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'google-email-missing');
});
