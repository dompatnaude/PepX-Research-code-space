'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureBootstrapAdmin } = require('../../services/admin-bootstrap');

function createMockPool(seedUsers) {
  const state = {
    users: JSON.parse(JSON.stringify(seedUsers || []))
  };

  async function query(sql, params) {
    const lower = String(sql).trim().toLowerCase();

    if (lower.startsWith('select * from users where email = $1')) {
      const email = params[0];
      const row = state.users.find((user) => user.email === email);
      return { rows: row ? [row] : [] };
    }

    if (lower.startsWith('insert into users')) {
      const inserted = {
        id: params[0],
        name: params[1],
        email: params[2],
        institution: params[3],
        provider: params[4],
        password_hash: params[5],
        google_id: params[6],
        role: params[7] || 'customer',
        created_at: new Date().toISOString()
      };
      state.users.push(inserted);
      return { rows: [inserted] };
    }

    if (lower.startsWith('update users')) {
      const user = state.users.find((entry) => entry.id === params[params.length - 1]);
      if (!user) return { rows: [] };
      user.name = params[0];
      user.email = params[1];
      user.institution = params[2];
      user.provider = params[3];
      user.password_hash = params[4];
      user.google_id = params[5];
      user.role = params[6];
      return { rows: [user] };
    }

    throw new Error('Unsupported SQL in test mock: ' + sql);
  }

  return { state, query };
}

test('creates a bootstrap admin user when env credentials are present', async () => {
  const pool = createMockPool([]);
  const bcrypt = {
    async hash(value) {
      return 'hash:' + value;
    }
  };

  const result = await ensureBootstrapAdmin({
    pool,
    bcrypt,
    env: {
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'supersecret',
      ADMIN_INSTITUTION: 'HQ'
    },
    createId: () => 'admin-1'
  });

  assert.equal(result.created, true);
  assert.equal(pool.state.users.length, 1);
  assert.equal(pool.state.users[0].role, 'admin');
  assert.equal(pool.state.users[0].email, 'admin@example.com');
  assert.equal(pool.state.users[0].password_hash, 'hash:supersecret');
});

test('promotes an existing user to admin when bootstrap credentials match', async () => {
  const pool = createMockPool([
    {
      id: 'u-1',
      name: 'Existing User',
      email: 'admin@example.com',
      institution: 'Lab',
      provider: 'Email',
      password_hash: 'old-hash',
      google_id: null,
      role: 'customer'
    }
  ]);
  const bcrypt = {
    async hash(value) {
      return 'hash:' + value;
    }
  };

  const result = await ensureBootstrapAdmin({
    pool,
    bcrypt,
    env: {
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'supersecret',
      ADMIN_INSTITUTION: 'HQ'
    }
  });

  assert.equal(result.updated, true);
  assert.equal(pool.state.users[0].role, 'admin');
  assert.equal(pool.state.users[0].password_hash, 'hash:supersecret');
});
