'use strict';

// Guard for the local-only dev commands. Exits non-zero unless DATABASE_URL
// resolves to a database on this machine, so `npm run dev` and
// `npm run dev:local:seed` can never migrate or write to a hosted database.
//
// The decision itself lives in db/require-local-db.js - this is the shell-
// facing wrapper. `allowDeployed: false` because these commands are local by
// definition: even a stray NODE_ENV=production must not wave them through.

require('dotenv').config();

const { requireLocalDatabase } = require('../db/require-local-db');
const { connectionHost } = require('../db/is-local-connection');

requireLocalDatabase({
  context: 'the local dev commands',
  allowDeployed: false
});

console.log('Local database confirmed: ' + connectionHost(process.env.DATABASE_URL));
