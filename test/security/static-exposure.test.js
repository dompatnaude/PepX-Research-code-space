'use strict';

// server.js serves the whole project directory with express.static. These tests
// pin the policy that stands in front of it, so a future commit cannot quietly
// re-expose backups, dumps, credentials or server source over HTTP.
//
// They exercise the policy module directly rather than booting the app: the
// classification is pure, and requiring server.js would open a database pool.
// The last test closes that gap by asserting server.js actually wires the
// policy in ahead of express.static.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const { classifyStaticRequest } = require('../../services/static-exposure-policy');

// Every one of these was publicly downloadable before this change.
const MUST_BE_DENIED = [
  '/index.html.bak',
  '/script.js.bak',
  '/styles.css.bak',
  '/styles.css.bak_bluechange',
  '/styles.css.bluebak2',
  '/checkout.html.orderbak',
  '/admin.html.productbak.20260721171108',
  '/server.js.bak',
  '/server.js.adminbak',
  '/server.js.ordersbak',
  '/script.js.inventorybak.20260721174026',
  '/routes/cart.js.authbak',
  '/orders_backup_1784679545900.json',
  '/.env',
  '/.env.example',
  '/.env.production',
  '/prod.env',
  '/create_theme_zip.sh',
  '/pepx-research-chemicals.zip',
  '/server.js',
  '/package.json',
  '/vercel.json',
  '/db/migrations/001_init_users.sql',
  '/services/email.js',
  '/routes/orders.js'
];

// Shapes nobody has committed yet. The allowlist has to refuse them anyway -
// that is the whole point of inverting the default.
const MUST_BE_DENIED_UNSEEN = [
  '/db-backup.sql',
  '/production.dump',
  '/customers-export.csv',
  '/orders.sqlite3',
  '/server.log',
  '/private.pem',
  '/id_rsa',
  '/aws-credentials',
  '/notes.txt.save',
  '/index.html~',
  '/backup/orders.json',
  '/data.json',
  '/config.yaml',
  '/Dockerfile',
  '/.npmrc'
];

// Real assets the site depends on. A policy that breaks these is worse than
// the hole it closes.
const MUST_BE_ALLOWED = [
  '/index.html',
  '/coas.html',
  '/terms-conditions.html',
  '/styles.css',
  '/script.js',
  '/coas.js',
  '/auth-page.js',
  '/public-home.js',
  '/card-rail.js',
  '/compliance-config.js',
  '/favicon.ico',
  '/assets/logo-pepx-navbar.png',
  '/assets/favicon-32.png',
  '/assets/apple-touch-icon.png'
];

// Handled by routes registered before express.static; never read off disk here.
const MUST_BE_SKIPPED = [
  '/',
  '/shop',
  '/coas',
  '/assets/',
  '/.well-known/acme-challenge/token-without-extension'
];

test('backup, dump and credential files are denied', () => {
  for (const p of MUST_BE_DENIED) {
    assert.equal(classifyStaticRequest(p), 'deny', p + ' must not be servable');
  }
});

test('file shapes nobody has committed yet are denied by the allowlist', () => {
  for (const p of MUST_BE_DENIED_UNSEEN) {
    assert.equal(classifyStaticRequest(p), 'deny', p + ' must not be servable');
  }
});

test('denial is case-insensitive', () => {
  for (const p of ['/INDEX.HTML.BAK', '/Orders_Backup_1784679545900.JSON', '/.ENV']) {
    assert.equal(classifyStaticRequest(p), 'deny', p + ' must not be servable');
  }
});

test('real client assets are still served', () => {
  for (const p of MUST_BE_ALLOWED) {
    assert.equal(classifyStaticRequest(p), 'allow', p + ' must remain servable');
  }
});

test('route paths are left to the routes', () => {
  for (const p of MUST_BE_SKIPPED) {
    assert.equal(classifyStaticRequest(p), 'skip', p + ' should not be handled as a static file');
  }
});

test('traversal and malformed paths are denied', () => {
  for (const p of ['/../server.js', '/assets/../../etc/passwd', 'server.js', '/..%2fserver.js']) {
    assert.equal(classifyStaticRequest(p), 'deny', p + ' must not be servable');
  }
});

test('ordinary words that merely contain a denied token are still served', () => {
  assert.equal(classifyStaticRequest('/assets/dumpling.png'), 'allow');
  assert.equal(classifyStaticRequest('/assets/bakery-logo.png'), 'allow');
  assert.equal(classifyStaticRequest('/environment-banner.png'), 'allow');
});

test('every backup-shaped file tracked in the repo is denied', () => {
  const entries = fs.readdirSync(REPO, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => '/' + entry.name)
    .filter((name) => /bak|backup|\.zip$|\.sh$|^\/\./.test(name.toLowerCase()));

  assert.ok(entries.length > 0, 'expected to find at least one non-public file in the project root');
  for (const name of entries) {
    assert.equal(classifyStaticRequest(name), 'deny', name + ' must not be servable');
  }
});

test('server.js routes every static request through the policy', () => {
  const source = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');

  assert.match(
    source,
    /require\('\.\/services\/static-exposure-policy'\)/,
    'server.js should load the policy module'
  );
  assert.doesNotMatch(
    source,
    /app\.use\(express\.static\(/,
    'express.static must not be mounted directly - it has to go through the policy check'
  );

  const verdictAt = source.indexOf("const verdict = classifyStaticRequest(req.path)");
  const denyAt = source.indexOf("if (verdict === 'deny') return res.status(404).end()");
  const serveAt = source.indexOf('return serveStaticAssets(req, res, next)');

  assert.ok(verdictAt !== -1, 'each request should be classified by the policy');
  assert.ok(denyAt > verdictAt, 'denied paths should be refused straight after classification');
  assert.ok(serveAt > denyAt, 'files are only served after the deny check has run');
  assert.match(source, /dotfiles:\s*'deny'/, 'express.static should also refuse dotfiles itself');
});
