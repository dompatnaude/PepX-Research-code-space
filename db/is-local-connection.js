'use strict';

/**
 * True when a Postgres connection string points at a database on this machine.
 *
 * Used for two things:
 *   * db/connection.js turns TLS off for local connections (a throwaway local
 *     container serves plain TCP; every hosted database we use requires TLS);
 *   * scripts/assert-local-db.js refuses to run the local-only dev commands
 *     against anything else.
 */
function isLocalConnection(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === 'host.docker.internal'
    );
  } catch (error) {
    return false;
  }
}

/** Host of a connection string, with credentials stripped. Safe to print. */
function connectionHost(url) {
  if (!url) return '(unset)';
  try {
    const parsed = new URL(url);
    return parsed.hostname + (parsed.port ? ':' + parsed.port : '');
  } catch (error) {
    return '(unparseable)';
  }
}

module.exports = { isLocalConnection, connectionHost };
