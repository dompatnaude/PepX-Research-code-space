'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeReturnPath, withAuthQuery } = require('../../services/oauth-redirect');

test('allows only internal relative paths', () => {
  assert.equal(sanitizeReturnPath('/account.html'), '/account.html');
  assert.equal(sanitizeReturnPath('/checkout.html?step=2'), '/checkout.html?step=2');
  assert.equal(sanitizeReturnPath('https://evil.example'), null);
  assert.equal(sanitizeReturnPath('//evil.example/path'), null);
  assert.equal(sanitizeReturnPath('javascript:alert(1)'), null);
});

test('adds auth query for callback failures without open redirect', () => {
  assert.equal(withAuthQuery('/account.html', 'google-failed'), '/account.html?auth=google-failed');
  assert.equal(withAuthQuery('/account.html?tab=security', 'google-cancelled'), '/account.html?tab=security&auth=google-cancelled');
  assert.equal(withAuthQuery('https://evil.example/path', 'google-failed'), '/index.html?auth=google-failed');
});
