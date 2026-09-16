'use strict';

// The rule this file defends: nothing on a development machine may reach a
// database that is not on that machine. Not the server, not the test runner,
// not the scripts that write. The deployment is the only exemption, and it is
// recognised by markers Vercel sets rather than by anything a shell can set by
// accident.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');

const {
  CONFIRM_VAR,
  CONFIRM_VALUE,
  hostedDatabaseRefusal,
  isDeployedRuntime
} = require(path.join(REPO, 'db', 'require-local-db.js'));

const HOSTED = 'postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const LOCAL = 'postgresql://postgres:devpass@127.0.0.1:5433/pepxdev';

function run(args, env) {
  return spawnSync(process.execPath, args, {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 30000,
    env: Object.assign({}, process.env, {
      NODE_ENV: 'development',
      VERCEL: '',
      [CONFIRM_VAR]: ''
    }, env)
  });
}

test('a database on this machine is accepted', () => {
  assert.equal(hostedDatabaseRefusal({ env: { DATABASE_URL: LOCAL } }), null);
});

test('localhost, 127.0.0.1 and ::1 are all accepted', () => {
  for (const url of [
    'postgresql://u:p@localhost:5433/pepxdev',
    'postgresql://u:p@127.0.0.1:5433/pepxdev',
    'postgresql://u:p@[::1]:5433/pepxdev',
    'postgresql://u:p@host.docker.internal:5433/pepxdev'
  ]) {
    assert.equal(hostedDatabaseRefusal({ env: { DATABASE_URL: url } }), null, url + ' should be accepted');
  }
});

test('a hosted database is refused in local development', () => {
  const refusal = hostedDatabaseRefusal({ context: 'the thing', env: { DATABASE_URL: HOSTED } });
  assert.ok(refusal, 'a hosted URL must be refused');
  assert.match(refusal, /not point at a database on this machine/);
  assert.match(refusal, /aws-0-us-east-1\.pooler\.supabase\.com:5432/);
  assert.doesNotMatch(refusal, /:p@/, 'the refusal must not echo credentials');
});

test('a missing or unparseable connection string is refused, not waved through', () => {
  for (const url of [undefined, '', 'not-a-url']) {
    assert.ok(hostedDatabaseRefusal({ env: { DATABASE_URL: url } }), String(url) + ' must be refused');
  }
});

test('the deployment is the only exemption, and only by its own markers', () => {
  assert.equal(hostedDatabaseRefusal({ env: { DATABASE_URL: HOSTED, NODE_ENV: 'production' } }), null);
  assert.equal(hostedDatabaseRefusal({ env: { DATABASE_URL: HOSTED, VERCEL: '1' } }), null);
  assert.equal(isDeployedRuntime({ NODE_ENV: 'production' }), true);
  assert.equal(isDeployedRuntime({ VERCEL: '1' }), true);
  assert.equal(isDeployedRuntime({ NODE_ENV: 'development' }), false);

  // Commands that are local by definition ignore even that exemption.
  assert.ok(hostedDatabaseRefusal({ env: { DATABASE_URL: HOSTED, NODE_ENV: 'production' }, allowDeployed: false }));
});

test('there is no single variable that switches the protections off', () => {
  // The confirmation only counts for a caller that opted in to having a hosted
  // mode at all, so setting it by hand unlocks nothing that was not reviewed.
  const env = { DATABASE_URL: HOSTED, [CONFIRM_VAR]: CONFIRM_VALUE };
  assert.ok(hostedDatabaseRefusal({ env }), 'a caller without a hosted mode stays refused');
  assert.equal(hostedDatabaseRefusal({ env, hostedAllowed: true }), null, 'an opted-in caller may proceed');
  assert.ok(
    hostedDatabaseRefusal({ env: { DATABASE_URL: HOSTED, [CONFIRM_VAR]: 'yes' }, hostedAllowed: true }),
    'a near-miss value must not count'
  );

  for (const file of ['db/require-local-db.js', 'server.js', 'package.json', 'test/setup/no-production-db.js']) {
    assert.doesNotMatch(read(file), /ALLOW_HOSTED_DB/, file + ' must not carry a blanket bypass');
  }
});

test('the test runner refuses to start against a hosted database', () => {
  const result = run(['test/setup/no-production-db.js'], { DATABASE_URL: HOSTED });
  assert.equal(result.status, 1, 'the test guard must exit non-zero');
  assert.match(result.stderr, /Refusing to run the test suite/);
  assert.match(result.stderr, /pooler\.supabase\.com/);

  // And it is wired into both entry points, so a run cannot skip it.
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.pretest, /test\/setup\/no-production-db\.js/);
  assert.match(pkg.scripts.test, /--require \.\/test\/setup\/no-production-db\.js/);
  assert.match(read('test/setup/no-production-db.js'), /dotenv\.parse/, 'it must also inspect the .env the app would load');
});

test('the test runner accepts a local database and pins one when none is set', () => {
  const local = run(['test/setup/no-production-db.js'], { DATABASE_URL: LOCAL });
  assert.equal(local.status, 0, 'a local URL must be accepted');

  const pinned = run(['-e', "require('./test/setup/no-production-db.js'); console.log(process.env.DATABASE_URL)"], { DATABASE_URL: undefined });
  assert.equal(pinned.status, 0);
  assert.match(pinned.stdout, /127\.0\.0\.1/, 'an unset URL is pinned to a dead loopback address');
});

test('starting the server directly refuses a hosted database outside production', () => {
  const result = run(['server.js'], { DATABASE_URL: HOSTED });
  assert.equal(result.status, 1, 'node server.js must exit non-zero');
  assert.match(result.stderr, /Refusing to run the PepX server/);
  assert.match(result.stderr, /npm run hosted:server/, 'the refusal names the explicit alternative');
});

test('the server guard runs before anything can open a pool', () => {
  const source = read('server.js');
  const guardIndex = source.indexOf('requireLocalDatabase(');
  assert.ok(guardIndex !== -1, 'server.js must call the guard');
  for (const later of ["require('express')", "require('./db/connection')", "require('./routes/"]) {
    const at = source.indexOf(later);
    if (at !== -1) assert.ok(guardIndex < at, 'the guard must run before ' + later);
  }

  // db/connection.js is the backstop: anything that forgets to ask still cannot
  // open a pool.
  const connection = read('db/connection.js');
  assert.ok(
    connection.indexOf('requireLocalDatabase(') < connection.indexOf('new Pool('),
    'the pool must not be constructed before the guard'
  );
});

test('the write-capable scripts refuse a hosted database', () => {
  for (const script of [
    'scripts/seed-dev-data.js',
    'scripts/repro-discount-checkout.js',
    'scripts/backfill-coa-files.js',
    'scripts/assert-local-db.js',
    'scripts/migrate.js'
  ]) {
    const result = run([script], { DATABASE_URL: HOSTED });
    assert.equal(result.status, 1, script + ' must exit non-zero against a hosted database');
    assert.match(result.stderr, /Refusing to run/, script + ' must say why');
  }
});

test('the seeder and the repro script have no hosted mode at all', () => {
  for (const script of ['scripts/seed-dev-data.js', 'scripts/repro-discount-checkout.js']) {
    const source = read(script);
    assert.match(source, /allowDeployed: false/, script + ' must stay local even in a production runtime');
    assert.doesNotMatch(source, /hostedAllowed/, script + ' must not be reachable through the hosted path');

    const result = run([script], { DATABASE_URL: HOSTED, [CONFIRM_VAR]: CONFIRM_VALUE });
    assert.equal(result.status, 1, script + ' must refuse even with the confirmation set');
  }
});

test('npm run dev is the guarded local path, and the hosted commands are named', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.dev, 'bash scripts/dev-local.sh', 'npm run dev must use the local container');
  assert.match(read('scripts/dev-local.sh'), /node scripts\/assert-local-db\.js/);

  for (const name of ['hosted:server', 'hosted:migrate', 'hosted:backfill-coa-files']) {
    assert.ok(pkg.scripts[name], name + ' should exist as the explicit way in');
    assert.match(pkg.scripts[name], new RegExp(CONFIRM_VAR + '=' + CONFIRM_VALUE));
  }
});
