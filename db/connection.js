require('dotenv').config();
const { Pool } = require("pg");
const { isLocalConnection } = require('./is-local-connection');

const connectionString = process.env.DATABASE_URL;

// Hosted Postgres (Supabase, and anything else we deploy against) requires TLS.
// A local development database -- see scripts/dev-local.sh -- speaks plain TCP
// and has no certificate, so asking for TLS there fails the connection outright.
// Only a localhost connection string turns it off; production is unaffected.
const ssl = isLocalConnection(connectionString) ? false : { rejectUnauthorized: false };

// Pool size has to be read together with the server-side pooler limit.
// DATABASE_URL points at Supabase's Supavisor on port 5432, which is SESSION
// mode: every client we open holds a real Postgres connection for its whole
// life, and the pooler caps us at 15. One long-running server at max 8 is
// fine. Serverless is not: each warm function instance keeps its own pool, so
// a couple of concurrent instances at max 8 exhaust the pooler and every query
// in the whole application starts failing with EMAXCONNSESSION. Keep the
// per-instance ceiling small there. DB_POOL_MAX overrides both defaults.
const onServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const poolMax = Number(process.env.DB_POOL_MAX) > 0
  ? Number(process.env.DB_POOL_MAX)
  : (onServerless ? 3 : 8);

const pool = new Pool({
  connectionString: connectionString,
  ssl: ssl,
  max: poolMax,
  idleTimeoutMillis: onServerless ? 10000 : 30000,
  connectionTimeoutMillis: 10000
});

// An idle client dropped by the server emits 'error' on the pool. With no
// listener that is an unhandled 'error' event, which terminates the process.
pool.on('error', (err) => {
  console.error('[pg pool] idle client error:', err && err.message ? err.message : err);
});

module.exports = pool;
