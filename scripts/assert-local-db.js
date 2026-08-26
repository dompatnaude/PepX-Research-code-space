'use strict';

// Guard for the local-only dev commands. Exits non-zero unless DATABASE_URL
// resolves to a database on this machine, so `npm run dev:local` and
// `npm run dev:local:seed` can never migrate or write to a hosted database.

require('dotenv').config();
const { isLocalConnection, connectionHost } = require('../db/is-local-connection');

const url = process.env.DATABASE_URL;
const host = connectionHost(url);

if (!isLocalConnection(url)) {
  console.error('');
  console.error('Refusing to run: DATABASE_URL does not point at a local database.');
  console.error('  resolved host: ' + host);
  console.error('');
  console.error('These commands only ever run against the throwaway local Postgres');
  console.error('started by scripts/dev-local.sh. Nothing here should touch a hosted');
  console.error('database. If you meant to run against the real one, use `npm run dev`.');
  console.error('');
  process.exit(1);
}

console.log('Local database confirmed: ' + host);
