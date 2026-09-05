'use strict';

const fs = require('fs');
const path = require('path');

// Accepted report formats. The browser-declared MIME type is never trusted on
// its own -- sniffMimeType() below re-derives it from the file's magic bytes.
const ACCEPTED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const ACCEPTED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg']);

const EXT_BY_MIME = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg'
};

// Vercel rejects request bodies larger than 4.5 MB before our code ever runs,
// so a 25 MB limit there is a promise the platform cannot keep. Cap below the
// platform limit when we are on it, and keep the roomier limit elsewhere.
// COA_MAX_UPLOAD_MB overrides both.
function maxUploadBytes() {
  const override = Number(process.env.COA_MAX_UPLOAD_MB);
  if (Number.isFinite(override) && override > 0) return Math.round(override * 1024 * 1024);
  const onServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  return (onServerless ? 4 : 25) * 1024 * 1024;
}

function coaUploadDir() {
  return process.env.COA_UPLOAD_DIR || path.join(__dirname, '..', 'uploads', 'coas');
}

// Structured, secret-free logging. Only ids, sizes, types and outcomes.
function logCoa(event, fields) {
  try {
    console.log(JSON.stringify(Object.assign({
      event: 'coa.' + event,
      at: new Date().toISOString()
    }, fields || {})));
  } catch (err) {
    console.log('coa.' + event);
  }
}

// The on-disk directory is a cache, never the source of truth. On a read-only
// or ephemeral filesystem this simply stays false and everything falls back to
// the database. Probed once per process.
let diskWritable = null;
function isDiskWritable() {
  if (diskWritable !== null) return diskWritable;
  try {
    const dir = coaUploadDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    diskWritable = true;
  } catch (err) {
    diskWritable = false;
    logCoa('storage.disk_unavailable', { code: err && err.code, reason: 'falling back to database storage' });
  }
  return diskWritable;
}

// Resolve a storage key to a path inside the upload dir, or null if the key
// tries to escape it.
function safeDiskPath(storageKey) {
  if (!storageKey || typeof storageKey !== 'string') return null;
  const dir = coaUploadDir();
  const full = path.resolve(dir, storageKey);
  const prefix = path.resolve(dir) + path.sep;
  if (full !== path.resolve(dir) && !full.startsWith(prefix)) return null;
  return full;
}

// Derive the real content type from the leading bytes. Returns null when the
// file is not one of the accepted formats, whatever the client claimed.
function sniffMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  return null;
}

function extensionForMime(mimeType) {
  return EXT_BY_MIME[mimeType] || '';
}

// Write bytes. Runs on the caller's transaction client so the file and the
// coas row commit or roll back together.
async function putFile(client, options) {
  const storageKey = options.storageKey;
  const buffer = options.buffer;
  await client.query(
    `INSERT INTO coa_files (storage_key, coa_id, mime_type, byte_size, data)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (storage_key) DO UPDATE SET
       coa_id = EXCLUDED.coa_id,
       mime_type = EXCLUDED.mime_type,
       byte_size = EXCLUDED.byte_size,
       data = EXCLUDED.data`,
    [storageKey, options.coaId || null, options.mimeType, buffer.length, buffer]
  );
}

// Best-effort local copy so a self-hosted deployment can serve from disk.
// Never throws: a failure here must not fail an upload that already committed.
function writeDiskCache(storageKey, buffer) {
  if (!isDiskWritable()) return false;
  const full = safeDiskPath(storageKey);
  if (!full) return false;
  try {
    fs.writeFileSync(full, buffer);
    return true;
  } catch (err) {
    logCoa('storage.disk_write_failed', { storageKey: storageKey, code: err && err.code });
    return false;
  }
}

// Read bytes back. Disk first (cheap), database second (authoritative).
// Returns null when the file is genuinely gone rather than throwing.
async function readFile(pool, storageKey) {
  const full = safeDiskPath(storageKey);
  if (full) {
    try {
      if (fs.existsSync(full)) {
        return { buffer: fs.readFileSync(full), source: 'disk' };
      }
    } catch (err) {
      logCoa('storage.disk_read_failed', { storageKey: storageKey, code: err && err.code });
    }
  }

  const result = await pool.query(
    'SELECT data, mime_type, byte_size FROM coa_files WHERE storage_key = $1',
    [storageKey]
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    buffer: row.data,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    source: 'database'
  };
}

// Remove both copies. Disk removal is best effort.
async function deleteFile(client, storageKey) {
  if (!storageKey) return;
  await client.query('DELETE FROM coa_files WHERE storage_key = $1', [storageKey]);
  const full = safeDiskPath(storageKey);
  if (!full) return;
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (err) {
    logCoa('storage.disk_delete_failed', { storageKey: storageKey, code: err && err.code });
  }
}

module.exports = {
  ACCEPTED_MIME_TYPES,
  ACCEPTED_EXTENSIONS,
  coaUploadDir,
  deleteFile,
  extensionForMime,
  isDiskWritable,
  logCoa,
  maxUploadBytes,
  putFile,
  readFile,
  safeDiskPath,
  sniffMimeType,
  writeDiskCache
};
