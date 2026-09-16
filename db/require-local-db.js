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
//      which sets PEPX_HOSTED_DB_CONFIRM for that one command.
//
// There is deliberately no general allow-hosted switch. Case 3 is opt-in per
// call site: a caller has to pass `hostedAllowed: true` to be eligible at all,
// and the seeder and the repro script never do, because there is no version of
// those that should run against real records. Setting the confirm variable by
// hand therefore unlocks nothing that was not already reviewed as safe.
// ---------------------------------------------------------------------------

const { isLocalConnection, connectionHost } = require('./is-local-connection');

const CONFIRM_VAR = 'PEPX_HOSTED_DB_CONFIRM';
const CONFIRM_VALUE = 'i-understand-this-is-the-hosted-database';

/** True inside the Vercel deployment, and nowhere else by accident. */
function isDeployedRuntime(env) {
  return env.NODE_ENV === 'production' || env.VERCEL === '1';
}

function isHostedConfirmed(env) {
  return env[CONFIRM_VAR] === CONFIRM_VALUE;
}

/**
 * Returns null when this process may proceed, or a ready-to-print explanation
 * when it must not. Pure - it reads only the env object it is handed - so the
 * tests can ask about any combination without spawning anything.
 *
 * context        what is being refused, for the message
 * env            defaults to process.env
 * hostedAllowed  may this caller ever reach a hosted database on purpose?
 * hostedCommand  the `npm run hosted:<x>` that would be the way to do it
 * allowDeployed  false for commands that must stay local even in production
 */
function hostedDatabaseRefusal(options) {
  const {
    context = 'this command',
    env = process.env,
    hostedAllowed = false,
    hostedCommand = null,
    allowDeployed = true
  } = options || {};

  if (allowDeployed && isDeployedRuntime(env)) return null;

  const url = env.DATABASE_URL;
  if (isLocalConnection(url)) return null;

  if (hostedAllowed && isHostedConfirmed(env)) return null;

  const lines = [
    '',
    'Refusing to run ' + context + '.',
    '',
    'DATABASE_URL does not point at a database on this machine.',
    '  resolved host: ' + connectionHost(url),
    '',
    'Local development and the test suite run against the throwaway Postgres',
    'container that `npm run dev` starts (scripts/dev-local.sh). Nothing here',
    'should reach the hosted database.',
    ''
  ];

  if (hostedAllowed && hostedCommand) {
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

  return lines.join('\n');
}

/** Print and exit(1) unless this process may reach the database it is pointed at. */
function requireLocalDatabase(options) {
  const refusal = hostedDatabaseRefusal(options);
  if (refusal === null) return;
  console.error(refusal);
  process.exit(1);
}

module.exports = {
  CONFIRM_VAR,
  CONFIRM_VALUE,
  isDeployedRuntime,
  isHostedConfirmed,
  hostedDatabaseRefusal,
  requireLocalDatabase
};
