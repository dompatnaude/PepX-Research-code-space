'use strict';

// ---------------------------------------------------------------------------
// Loaded before every test process (`node --test --require ...`) and once up
// front by `npm run pretest`, so the suite fails on the first line rather than
// somewhere in the middle of a run.
//
// Two jobs:
//
//   1. Refuse outright if the environment - or the .env file the app would
//      load - would put a database that is not on this machine in front of the
//      tests.
//   2. Pin DATABASE_URL to a dead loopback address when nothing set one, so a
//      test that reaches `require('../../server')` cannot pick a real one up
//      from .env afterwards. dotenv never overwrites a variable that is
//      already set, which is exactly what makes this stick.
//
// Tests that stub the pool, or that set their own local dummy URL before
// requiring the server, keep working untouched.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { isLocalConnection, connectionHost } = require('../../db/is-local-connection');

const UNUSED_LOCAL = 'postgresql://pepx-test:pepx-test@127.0.0.1:1/pepx-test-unused';

function refuse(source, url) {
  console.error('');
  console.error('Refusing to run the test suite.');
  console.error('');
  console.error(source + ' points at a database that is not on this machine.');
  console.error('  resolved host: ' + connectionHost(url));
  console.error('');
  console.error('The suite never needs a real database: it stubs the pool, or points');
  console.error('at a dead loopback address. Point DATABASE_URL at the local dev');
  console.error('container (npm run dev) or unset it, then run the tests again.');
  console.error('');
  process.exit(1);
}

const fromEnv = process.env.DATABASE_URL;
if (fromEnv !== undefined && fromEnv !== '' && !isLocalConnection(fromEnv)) {
  refuse('DATABASE_URL', fromEnv);
}

const envFile = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envFile)) {
  let fromFile;
  try {
    fromFile = dotenv.parse(fs.readFileSync(envFile)).DATABASE_URL;
  } catch (error) {
    fromFile = undefined;
  }
  if (fromFile && !isLocalConnection(fromFile)) {
    refuse('.env', fromFile);
  }
}

if (fromEnv === undefined || fromEnv === '') {
  process.env.DATABASE_URL = UNUSED_LOCAL;
}

// Never let a stray NODE_ENV=production in the shell hand the tests the
// deployment exemption in db/require-local-db.js.
process.env.NODE_ENV = 'test';

module.exports = { UNUSED_LOCAL };
