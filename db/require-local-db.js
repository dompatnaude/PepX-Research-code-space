'use strict';

// ---------------------------------------------------------------------------
// The one place that decides whether this process may talk to a database that
// is not on this machine.
//
// Everything that can reach Postgres asks here first: the server, the test
// runner, the migration runner and the scripts that write. The answer is no
// unless one of three things is true.
//
//   1. This is the real deployment. Vercel sets NODE_ENV=production and
//      VERCEL=1; a local shell does not set either by accident.
//   2. The connection string points at this machine - see is-local-connection.
//   3. The caller is one of the few commands that exist to touch the hosted
//      database on purpose AND it was invoked through `npm run hosted:*`,
//      which sets PEPX_HOSTED_DB_CONFIRM=production for that one command.
//
// There is deliberately no general allow-hosted switch. Case 3 is opt-in per
// call site: a caller has to pass `hostedAllowed: true` to be eligible at all,
// and the seeder and the repro script never do, because there is no version of
// those that should run against real records. The confirmation is compared
// exactly - present-but-anything is not enough, and neither is a different
// case or a stray space - so an old or half-remembered value fails closed.
//
// When a hosted run does go ahead it says so, naming the host and the database
// and nothing else: never the user, the password or the connection string.
// ---------------------------------------------------------------------------

const {
  isLocalConnection,
  connectionHost,
  connectionDatabase
} = require('./is-local-connection');

const CONFIRM_VAR = 'PEPX_HOSTED_DB_CONFIRM';
const CONFIRM_VALUE = 'production';

/** True inside the Vercel deployment, and nowhere else by accident. */
function isDeployedRuntime(env) {
  return env.NODE_ENV === 'production' || env.VERCEL === '1';
}

/** Exact match only. A set-but-wrong value is treated as no confirmation. */
function isHostedConfirmed(env) {
  return env[CONFIRM_VAR] === CONFIRM_VALUE;
}

/** Host and database name, credentials stripped. The only thing we ever print. */
function describeTarget(url) {
  return {
    host: connectionHost(url),
    database: connectionDatabase(url)
  };
}

/**
 * Why this process may or may not proceed. Pure - it reads only the env object
 * it is handed - so the tests can ask about any combination without spawning.
 *
 * Returns { allowed, reason, refusal, target }.
 */
function evaluate(options) {
  const {
    context = 'this command',
    env = process.env,
    hostedAllowed = false,
    hostedCommand = null,
    allowDeployed = true
  } = options || {};

  const url = env.DATABASE_URL;
  const target = describeTarget(url);

  if (allowDeployed && isDeployedRuntime(env)) {
    return { allowed: true, reason: 'deployed', refusal: null, target };
  }

  if (isLocalConnection(url)) {
    return { allowed: true, reason: 'local', refusal: null, target };
  }

  if (hostedAllowed && isHostedConfirmed(env)) {
    return { allowed: true, reason: 'confirmed', refusal: null, target, context };
  }

  const lines = [
    '',
    'Refusing to run ' + context + '.',
    '',
    'DATABASE_URL does not point at a database on this machine.',
    '  host:     ' + target.host,
    '  database: ' + target.database,
    '',
    'Local development and the test suite run against the throwaway Postgres',
    'container that `npm run dev` starts (scripts/dev-local.sh). Nothing here',
    'should reach the hosted database.',
    ''
  ];

  if (hostedAllowed && hostedCommand) {
    const wrongValue = env[CONFIRM_VAR] !== undefined && env[CONFIRM_VAR] !== '';
    if (wrongValue) {
      lines.push(
        CONFIRM_VAR + ' is set, but not to the value this requires, so it does',
        'not count.',
        ''
      );
    }
    lines.push(
      'If you really do mean the hosted database, that is a separate, explicit',
      'command:',
      '',
      '    npm run ' + hostedCommand,
      ''
    );
  } else {
    lines.push(
      'This command has no hosted mode. It writes throwaway data, so there is',
      'no version of it that should run against real records.',
      ''
    );
  }

  return { allowed: false, reason: 'refused', refusal: lines.join('\n'), target };
}

/** Kept for callers that only want the message. */
function hostedDatabaseRefusal(options) {
  return evaluate(options).refusal;
}

let announced = false;

/** Print and exit(1) unless this process may reach the database it is pointed at. */
function requireLocalDatabase(options) {
  const verdict = evaluate(options);

  if (!verdict.allowed) {
    console.error(verdict.refusal);
    process.exit(1);
  }

  // A deliberate hosted run says what it is pointed at, once per process, and
  // never more than the host and the database name.
  if (verdict.reason === 'confirmed' && !announced) {
    announced = true;
    console.error('');
    console.error('[hosted] Running ' + (verdict.context || 'this command') + ' against the hosted database.');
    console.error('[hosted]   host:     ' + verdict.target.host);
    console.error('[hosted]   database: ' + verdict.target.database);
    console.error('');
  }
}

module.exports = {
  CONFIRM_VAR,
  CONFIRM_VALUE,
  isDeployedRuntime,
  isHostedConfirmed,
  describeTarget,
  evaluate,
  hostedDatabaseRefusal,
  requireLocalDatabase
};
