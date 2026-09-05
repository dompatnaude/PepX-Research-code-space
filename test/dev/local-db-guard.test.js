'use strict';

// The local dev flow exists so this codebase can be run and exercised without
// migrating or writing to the hosted database. Two things make that true:
//
//   * scripts/dev-local-env.sh exports a localhost DATABASE_URL before node
//     starts, and dotenv never overwrites a variable that is already set;
//   * scripts/assert-local-db.js exits non-zero unless the resolved URL is
//     local, so a mistake stops the command instead of hitting production.
//
// These tests pin the host classification both of those depend on, and pin
// that the guard is actually wired into the commands.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..');
const readSource = (...parts) => fs.readFileSync(path.join(REPO, ...parts), 'utf8');

const { isLocalConnection, connectionHost } = require('../../db/is-local-connection');

const HOSTED = 'postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const LOCAL = 'postgresql://postgres:devpass@127.0.0.1:5433/pepxdev';

test('localhost connection strings are recognised as local', () => {
  for (const url of [
    LOCAL,
    'postgresql://postgres:devpass@localhost:5433/pepxdev',
    'postgres://u:p@127.0.0.1/db',
    'postgresql://u:p@[::1]:5432/db',
    'postgresql://u:p@host.docker.internal:5432/db'
  ]) {
    assert.equal(isLocalConnection(url), true, url + ' should be local');
  }
});

test('hosted and missing connection strings are never treated as local', () => {
  for (const url of [
    HOSTED,
    'postgresql://u:p@db.example.com:5432/postgres',
    'postgresql://u:p@10.0.0.5:5432/postgres',
    'postgresql://u:p@localhost.evil.com:5432/db',
    'not-a-url',
    '',
    null,
    undefined
  ]) {
    assert.equal(isLocalConnection(url), false, String(url) + ' must not be local');
  }
});

test('connectionHost never leaks credentials', () => {
  const host = connectionHost(HOSTED);
  assert.equal(host, 'aws-0-us-east-1.pooler.supabase.com:5432');
  assert.doesNotMatch(host, /secret/);
  assert.doesNotMatch(host, /postgres\.abc/);
});

test('TLS is only disabled for a local database', () => {
  const source = readSource('db', 'connection.js');
  assert.match(source, /isLocalConnection\(connectionString\) \? false : \{ rejectUnauthorized: false \}/,
    'hosted connections must keep requiring TLS');
});

test('the guard refuses a hosted DATABASE_URL', () => {
  assert.throws(
    () => execFileSync(process.execPath, ['scripts/assert-local-db.js'], {
      cwd: REPO,
      env: Object.assign({}, process.env, { DATABASE_URL: HOSTED }),
      stdio: 'pipe'
    }),
    (error) => {
      assert.equal(error.status, 1, 'the guard must exit non-zero');
      assert.match(String(error.stderr), /does not point at a local database/);
      assert.doesNotMatch(String(error.stderr), /secret/, 'the password must not be printed');
      return true;
    }
  );
});

test('the guard accepts a local DATABASE_URL', () => {
  const out = execFileSync(process.execPath, ['scripts/assert-local-db.js'], {
    cwd: REPO,
    env: Object.assign({}, process.env, { DATABASE_URL: LOCAL }),
    stdio: 'pipe'
  });
  assert.match(String(out), /Local database confirmed: 127\.0\.0\.1:5433/);
});

test('both local dev commands run the guard before doing anything', () => {
  for (const script of ['dev-local.sh', 'dev-local-seed.sh']) {
    const source = readSource('scripts', script);
    assert.match(source, /\. scripts\/dev-local-env\.sh/, script + ' must source the local env');
    assert.match(source, /node scripts\/assert-local-db\.js/, script + ' must run the guard');
  }
});

test('the local env file pins DATABASE_URL to loopback and its own port', () => {
  const source = readSource('scripts', 'dev-local-env.sh');
  assert.match(source, /export DATABASE_URL="postgresql:\/\/postgres:\$\{DEV_DB_PASSWORD\}@127\.0\.0\.1:/);
  assert.match(source, /export PORT="\$\{DEV_LOCAL_PORT:-3010\}"/,
    'the local instance must default to its own port, not 3000');
});

test('the seeder refuses to write to a hosted database', () => {
  const source = readSource('scripts', 'seed-dev-data.js');
  assert.match(source, /if \(!isLocalConnection\(process\.env\.DATABASE_URL\)\)/);
  assert.match(source, /process\.exit\(1\)/);
  const guardIndex = source.indexOf('isLocalConnection(process.env.DATABASE_URL)');
  const poolIndex = source.indexOf("require('../db/connection')");
  assert.ok(guardIndex < poolIndex, 'the guard must run before a connection pool is created');
});

test('npm exposes the local dev commands', () => {
  const pkg = JSON.parse(readSource('package.json'));
  assert.equal(pkg.scripts['dev:local'], 'bash scripts/dev-local.sh');
  assert.equal(pkg.scripts['dev:local:seed'], 'bash scripts/dev-local-seed.sh');
  assert.match(pkg.scripts['dev:local:down'], /docker rm -f/);
  assert.equal(pkg.scripts.dev, 'npm run migrate && node server.js',
    'the existing dev command must be left alone');
  assert.equal(pkg.scripts.start, 'npm run migrate && node server.js',
    'the production start command must be left alone');
});

test('boot migrations stay on by default and can be switched off explicitly', () => {
  const source = readSource('server.js');
  assert.match(source, /if \(String\(process\.env\.SKIP_DB_MIGRATIONS\)\.toLowerCase\(\) === 'true'\)/);
  const bootBlock = source.slice(source.indexOf("String(process.env.SKIP_DB_MIGRATIONS)"));
  assert.match(bootBlock, /await runMigrations\(\);/,
    'migrations must still run when the flag is not set');
  // A migration that cannot reach the database must not stop the server from
  // listening: that turned a transient database problem into a full outage.
  assert.match(bootBlock.slice(0, 900), /catch \(error\)/,
    'a failed migration must be caught so the server still boots');
});

test('migration 019 contains only SQL', () => {
  // It had a block of chat transcript pasted after the last statement, which
  // made any fresh database fail to bootstrap at that migration.
  const sql = readSource('db', 'migrations', '019_easypost_shipments.sql');
  assert.doesNotMatch(sql, /API endpoint not found/);
  assert.doesNotMatch(sql, /^Current behavior:/m);
  const statements = sql.split('\n').filter((line) => line.trim() && !line.trim().startsWith('--'));
  for (const line of statements) {
    assert.match(line, /^(ALTER|CREATE|DROP|INSERT|UPDATE|DO|BEGIN|END|COMMIT|\s|\)|;)/i,
      'unexpected non-SQL line in migration 019: ' + line.slice(0, 60));
  }
});
