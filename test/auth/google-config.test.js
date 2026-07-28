const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveGoogleCallbackUrl } = require('../../services/google-config');

test('derives a callback URL from a configured public base URL', () => {
  const result = resolveGoogleCallbackUrl({
    PUBLIC_BASE_URL: 'https://pepx.example.com'
  });

  assert.equal(result, 'https://pepx.example.com/auth/google/callback');
});

test('prefers an explicit Google callback URL when present', () => {
  const result = resolveGoogleCallbackUrl({
    GOOGLE_CALLBACK_URL: 'https://custom.example.com/auth/google/callback'
  });

  assert.equal(result, 'https://custom.example.com/auth/google/callback');
});
