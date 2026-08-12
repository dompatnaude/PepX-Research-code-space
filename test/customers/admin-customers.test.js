'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../../services/admin-customers');

test('isAccountDisabled: null disabled_at is active', () => {
  assert.equal(svc.isAccountDisabled({ disabledAt: null }), false);
  assert.equal(svc.isAccountDisabled({}), false);
  assert.equal(svc.isAccountDisabled(null), false);
});

test('isAccountDisabled: any disabled_at timestamp means disabled', () => {
  assert.equal(svc.isAccountDisabled({ disabledAt: '2026-01-01T00:00:00Z' }), true);
  assert.equal(svc.isAccountDisabled({ disabled_at: new Date() }), true);
});

test('disable/enable values round-trip through the predicate', () => {
  assert.equal(svc.isAccountDisabled({ disabledAt: svc.disabledValue() }), true);
  assert.equal(svc.isAccountDisabled({ disabledAt: svc.enabledValue() }), false);
});

test('deriveAuthMethod distinguishes google, password, linked', () => {
  assert.equal(svc.deriveAuthMethod({ googleId: 'g' }), 'google');
  assert.equal(svc.deriveAuthMethod({ passwordHash: 'h' }), 'email_password');
  assert.equal(svc.deriveAuthMethod({ googleId: 'g', passwordHash: 'h' }), 'linked');
  assert.equal(svc.deriveAuthMethod({}), 'unknown');
});

test('canReceivePasswordReset only for accounts with a password', () => {
  assert.equal(svc.canReceivePasswordReset({ passwordHash: 'h' }), true);
  assert.equal(svc.canReceivePasswordReset({ googleId: 'g', passwordHash: 'h' }), true);
  assert.equal(svc.canReceivePasswordReset({ googleId: 'g' }), false);
});

test('orderCountsTowardSpend excludes cancelled/refunded/unpaid', () => {
  assert.equal(svc.orderCountsTowardSpend({ status: 'shipped', payment_status: 'paid' }), true);
  assert.equal(svc.orderCountsTowardSpend({ status: 'shipped', payment_status: null }), true);
  assert.equal(svc.orderCountsTowardSpend({ status: 'pending_payment', payment_status: null }), false);
  assert.equal(svc.orderCountsTowardSpend({ status: 'cancelled', payment_status: 'paid' }), false);
  assert.equal(svc.orderCountsTowardSpend({ status: 'refunded', payment_status: 'paid' }), false);
});

test('computeCustomerStats sums only qualifying orders', () => {
  const orders = [
    { status: 'shipped', payment_status: 'paid', total: '100.00', created_at: '2025-01-01T00:00:00Z' },
    { status: 'completed', payment_status: null, total: '50.00', created_at: '2025-02-01T00:00:00Z' },
    { status: 'cancelled', payment_status: 'paid', total: '999.00', created_at: '2025-03-01T00:00:00Z' },
    { status: 'pending_payment', payment_status: null, total: '25.00', created_at: '2025-04-01T00:00:00Z' },
  ];
  const s = svc.computeCustomerStats(orders);
  assert.equal(s.orderCount, 2);
  assert.equal(s.lifetimeSpend, 150);
  assert.equal(s.avgOrderValue, 75);
  assert.equal(new Date(s.firstOrder).toISOString(), '2025-01-01T00:00:00.000Z');
  assert.equal(new Date(s.lastOrder).toISOString(), '2025-02-01T00:00:00.000Z');
});

test('redactCustomer strips secrets and assertNoSecrets guards output', () => {
  const raw = { id: '1', email: 'a@b.com', password_hash: 'H', reset_token_hash: 'R', google_id: 'G', google_access_token: 'T' };
  const clean = svc.redactCustomer(raw);
  assert.equal(clean.password_hash, undefined);
  assert.equal(clean.reset_token_hash, undefined);
  assert.equal(clean.google_access_token, undefined);
  assert.equal(clean.email, 'a@b.com');
  assert.doesNotThrow(() => svc.assertNoSecrets(clean));
  assert.throws(() => svc.assertNoSecrets(raw));
});

test('deriveAddressHistory de-duplicates identical addresses', () => {
  const orders = [
    { shipping_name: 'A', shipping_address: '1 St', shipping_city: 'X', shipping_zip: '1', created_at: '2025-01-01T00:00:00Z' },
    { shipping_name: 'A', shipping_address: '1 St', shipping_city: 'X', shipping_zip: '1', created_at: '2025-06-01T00:00:00Z' },
    { shipping_name: 'B', shipping_address: '2 Ave', shipping_city: 'Y', shipping_zip: '2', created_at: '2025-03-01T00:00:00Z' },
  ];
  const a = svc.deriveAddressHistory(orders);
  assert.equal(a.length, 2);
  const first = a.find((x) => x.line1 === '1 St');
  assert.equal(first.timesUsed, 2);
  assert.equal(new Date(first.lastUsed).toISOString(), '2025-06-01T00:00:00.000Z');
});

test('buildCustomerListQuery is parameterized and paginated', () => {
  const q = svc.buildCustomerListQuery({ search: 'bob', filter: 'has_orders', sort: 'top_spend', page: 2, pageSize: 10 });
  assert.match(q.sql, /LIMIT \$\d+ OFFSET \$\d+/);
  assert.ok(q.params.includes('%bob%'));
  assert.equal(q.limit, 10);
  assert.equal(q.page, 2);
  assert.match(q.sql, /stats.lifetime_spend DESC/);
  // no string interpolation of user search into SQL body
  assert.equal(q.sql.indexOf('bob'), -1);
});

test('buildCustomerListQuery rejects unknown sort/filter safely', () => {
  const q = svc.buildCustomerListQuery({ sort: 'DROP TABLE', filter: 'evil' });
  assert.match(q.sql, /u.created_at DESC/); // default sort
  assert.equal(q.sql.indexOf('DROP TABLE'), -1);
});
