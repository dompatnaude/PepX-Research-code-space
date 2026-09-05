'use strict';

// One-time, idempotent, additive backfill.
//
// COA report files used to live only on the local filesystem. Production runs
// on a read-only, per-invocation serverless filesystem and never had them, so
// published COAs pointed at files that could not be served. This copies any
// file that still exists on disk into the coa_files table.
//
// It only ever INSERTs. It never edits or deletes a coas row, and it never
// deletes anything from disk. Running it twice is a no-op.

require('dotenv').config();
const fs = require('fs');
const pool = require('../db/connection');
const coaStorage = require('../services/coa-storage');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const { rows } = await pool.query(
    `SELECT c.id, c.file_storage_key, c.file_name, c.file_mime_type
     FROM coas c
     WHERE c.file_storage_key IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM coa_files f WHERE f.storage_key = c.file_storage_key)
     ORDER BY c.id`
  );

  console.log('COAs whose file is not yet in the database:', rows.length);
  if (!rows.length) {
    console.log('Nothing to do.');
    return;
  }

  let copied = 0;
  const missing = [];

  for (const row of rows) {
    const diskPath = coaStorage.safeDiskPath(row.file_storage_key);
    if (!diskPath || !fs.existsSync(diskPath)) {
      missing.push({ coaId: row.id, storageKey: row.file_storage_key });
      console.log('  coa', row.id, 'file NOT on disk:', row.file_storage_key);
      continue;
    }

    const buffer = fs.readFileSync(diskPath);
    const mimeType = row.file_mime_type || coaStorage.sniffMimeType(buffer) || 'application/octet-stream';

    console.log('  coa', row.id, '->', row.file_storage_key, buffer.length, 'bytes', mimeType,
      dryRun ? '(dry run)' : '');

    if (!dryRun) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await coaStorage.putFile(client, {
          storageKey: row.file_storage_key,
          coaId: row.id,
          mimeType: mimeType,
          buffer: buffer
        });
        await client.query('COMMIT');
        copied += 1;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (rollbackErr) { /* ignore */ }
        throw err;
      } finally {
        client.release();
      }
    }
  }

  console.log('Copied into coa_files:', copied);
  if (missing.length) {
    console.log('Still missing bytes (no disk copy available):');
    missing.forEach((m) => console.log('  coa', m.coaId, m.storageKey));
    console.log('These COAs keep their metadata; re-upload the report from the admin panel.');
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Backfill failed:', err && err.stack ? err.stack : err);
    pool.end();
    process.exitCode = 1;
  });
