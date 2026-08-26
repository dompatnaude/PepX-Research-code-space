'use strict';

const pool = require('../db/connection');

/**
 * Runs `run` inside a single database transaction.
 *
 * Falls back to running the statements directly on `db` when the object cannot
 * hand out a client -- test fixtures pass a plain `{ query }` stub, and there
 * is nothing to roll back in that case.
 */
async function withTransaction(db, run) {
  const target = db || pool;
  if (typeof target.connect !== 'function') {
    return run(target);
  }
  const client = await target.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Surface the original failure, not the rollback failure.
    }
    throw error;
  } finally {
    if (typeof client.release === 'function') client.release();
  }
}

module.exports = { withTransaction };
