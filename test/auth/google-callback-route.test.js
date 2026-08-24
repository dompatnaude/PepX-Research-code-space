'use strict';

// Regression coverage for the Google OAuth *callback route wiring*.
//
// The service layer (services/google-auth.js) was already well tested, but
// nothing exercised the Express route itself. That gap hid a real production
// outage: `/auth/google/callback` built the passport middleware with
//
//     return passport.authenticate('google', function (err, user, info) { ... });
//
// and never invoked it with `(req, res, next)`. Express ignores the return
// value of a handler, so the middleware never ran, no response was ever
// written, and every Google sign-in hung until the platform timed the request
// out. These tests assert the callback route always *answers* the request.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Must be set before requiring server.js: `googleConfigured` and the passport
// strategy are evaluated at module load.
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_CALLBACK_URL = 'https://example.test/auth/google/callback';
process.env.SESSION_SECRET = 'test-session-secret';
// Pointed at a closed port: these paths must resolve without touching Postgres.
process.env.DATABASE_URL = 'postgresql://user:pass@127.0.0.1:1/none';

const app = require('../../server');

const RESPONSE_TIMEOUT_MS = 5000;

function withServer(run) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, async () => {
      try {
        const result = await run(server.address().port);
        server.close(() => resolve(result));
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
}

// Resolves with the response, or with `{ timedOut: true }` if the handler
// never writes a response -- which is exactly the failure mode being guarded.
function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ port, path }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({
        timedOut: false,
        status: res.statusCode,
        location: res.headers.location || null,
        body
      }));
    });
    req.on('error', reject);
    req.setTimeout(RESPONSE_TIMEOUT_MS, () => {
      req.destroy();
      resolve({ timedOut: true });
    });
  });
}

test('the Google callback responds to an OAuth error instead of hanging', async () => {
  const res = await withServer((port) => get(port, '/auth/google/callback?error=invalid_scope'));

  assert.equal(
    res.timedOut,
    false,
    'callback never responded -- the passport middleware is likely built but not invoked with (req, res, next)'
  );
  assert.equal(res.status, 302);
  assert.match(res.location, /^\/account\.html\?auth=/);
});

test('a cancelled Google authorization redirects back with google-cancelled', async () => {
  const res = await withServer((port) => get(port, '/auth/google/callback?error=access_denied'));

  assert.equal(res.timedOut, false, 'callback never responded');
  assert.equal(res.status, 302);
  assert.equal(res.location, '/account.html?auth=google-cancelled');
});

test('a callback with no code and no error still terminates the request', async () => {
  const res = await withServer((port) => get(port, '/auth/google/callback'));

  assert.equal(res.timedOut, false, 'callback never responded');
  assert.ok(
    res.status >= 300 && res.status < 500,
    'expected a redirect or client error, got ' + res.status
  );
});

test('the Google callback route invokes the passport middleware it builds', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
  const callbackRoute = source.slice(source.indexOf("app.get('/auth/google/callback'"));
  const body = callbackRoute.slice(0, callbackRoute.indexOf("app.get('/api/auth/protected'"));

  assert.match(
    body,
    /\}\)\(req, res, next\);/,
    'passport.authenticate(...) must be called with (req, res, next); returning it alone leaves the request hanging'
  );
});
