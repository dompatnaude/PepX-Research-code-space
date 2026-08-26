require('dotenv').config();
const { Pool } = require("pg");
const { isLocalConnection } = require('./is-local-connection');

const connectionString = process.env.DATABASE_URL;

// Hosted Postgres (Supabase, and anything else we deploy against) requires TLS.
// A local development database -- see scripts/dev-local.sh -- speaks plain TCP
// and has no certificate, so asking for TLS there fails the connection outright.
// Only a localhost connection string turns it off; production is unaffected.
const ssl = isLocalConnection(connectionString) ? false : { rejectUnauthorized: false };

const pool = new Pool({
connectionString: connectionString,
ssl: ssl,
max: 8,
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 10000
});

module.exports = pool;
