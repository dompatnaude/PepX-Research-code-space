'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const fsp = require('fs').promises;
const { formidable } = require('formidable');
const pool = require('../db/connection');
const coaStorage = require('../services/coa-storage');

// ---- constants -------------------------------------------------------

// ---- helpers ---------------------------------------------------------

function toAdminCoa(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name || null,
    variantId: row.variant_id || null,
    variantName: row.variant_name || null,
    batchNumber: row.batch_number || null,
    labName: row.lab_name || null,
    testType: row.test_type || null,
    testDate: row.test_date || null,
    reportDate: row.report_date || null,
    title: row.title || null,
    notes: row.notes || null,
    fileName: row.file_name || null,
    fileMimeType: row.file_mime_type || null,
    fileSize: row.file_size || null,
    hasThumbnail: !!row.thumbnail_storage_key,
    hasFile: !!row.file_storage_key,
    status: row.status,
    createdBy: row.created_by_name || null,
    updatedBy: row.updated_by_name || null,
    publishedBy: row.published_by_name || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    publishedAt: row.published_at || null,
    archivedAt: row.archived_at || null
  };
}

function normalizeText(value, maxLen) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return maxLen ? s.slice(0, maxLen) : s;
}

function parseOptionalDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s;
}

// ---- router factory --------------------------------------------------

function createAdminCoasRouter(requireAuth) {
  const router = express.Router();

  async function requireAdmin(req, res, next) {
    try {
      const userId = (req.user && req.user.id) || (req.session && req.session.userId);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const result = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
      const role = result.rows.length ? result.rows[0].role : null;
      if (role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
      req.adminUserId = userId;
      return next();
    } catch (err) {
      return next(err);
    }
  }

  const gate = [requireAuth, requireAdmin];

  // GET /api/admin/coas
  router.get('/coas', gate, async (req, res) => {
    try {
      const params = [];
      const where = [];

      const status = String(req.query.status || '').trim();
      if (['draft', 'published', 'archived'].includes(status)) {
        params.push(status);
        where.push('c.status = $' + params.length);
      }

      const search = String(req.query.search || '').trim();
      if (search) {
        params.push('%' + search + '%');
        const p = '$' + params.length;
        where.push(
          '(COALESCE(p.name, c.product_name) ILIKE ' + p +
          ' OR pv.name ILIKE ' + p +
          ' OR c.batch_number ILIKE ' + p +
          ' OR c.lab_name ILIKE ' + p + ')'
        );
      }

      const productId = parseInt(req.query.product_id, 10);
      if (productId > 0) {
        params.push(productId);
        where.push('c.product_id = $' + params.length);
      }

      const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || 25));
      const offset = (page - 1) * pageSize;

      params.push(pageSize);
      const limitParam = '$' + params.length;
      params.push(offset);
      const offsetParam = '$' + params.length;

      const sql = `
        SELECT c.id, c.product_id, c.variant_id, c.batch_number, c.lab_name,
               c.test_type, c.test_date, c.report_date, c.title, c.notes,
               c.file_name, c.file_mime_type, c.file_size,
               c.file_storage_key, c.thumbnail_storage_key,
               c.status, c.created_at, c.updated_at, c.published_at, c.archived_at,
               c.created_by, c.updated_by, c.published_by,
               COALESCE(p.name, c.product_name) AS product_name,
               pv.name AS variant_name,
               u1.name AS created_by_name,
               u2.name AS updated_by_name,
               u3.name AS published_by_name
          FROM coas c
          LEFT JOIN products p ON p.id = c.product_id
          LEFT JOIN product_variants pv ON pv.id = c.variant_id
          LEFT JOIN users u1 ON u1.id = c.created_by
          LEFT JOIN users u2 ON u2.id = c.updated_by
          LEFT JOIN users u3 ON u3.id = c.published_by
         ${whereSql}
         ORDER BY c.updated_at DESC, c.id DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}
      `;

      const countSql = `
        SELECT COUNT(*)::int AS total
          FROM coas c
          LEFT JOIN products p ON p.id = c.product_id
          LEFT JOIN product_variants pv ON pv.id = c.variant_id
         ${whereSql}
      `;

      const countParams = params.slice(0, params.length - 2);
      const [rows, countRow] = await Promise.all([
        pool.query(sql, params),
        pool.query(countSql, countParams)
      ]);

      const total = (countRow.rows[0] && countRow.rows[0].total) || 0;

      return res.json({
        coas: rows.rows.map(toAdminCoa),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
        limits: { maxUploadBytes: coaStorage.maxUploadBytes() }
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load COAs' });
    }
  });

  // POST /api/admin/coas — create draft
  router.post('/coas', gate, async (req, res) => {
    try {
      const body = req.body || {};
      const productId = parseInt(body.product_id, 10);
      if (!productId) return res.status(400).json({ error: 'product_id is required' });

      // Validate product exists
      const prodCheck = await pool.query('SELECT id FROM products WHERE id = $1', [productId]);
      if (!prodCheck.rows.length) return res.status(400).json({ error: 'Product not found' });

      // Validate variant belongs to product if provided
      const variantId = parseInt(body.variant_id, 10) || null;
      if (variantId) {
        const varCheck = await pool.query(
          'SELECT id FROM product_variants WHERE id = $1 AND product_id = $2',
          [variantId, productId]
        );
        if (!varCheck.rows.length) {
          return res.status(400).json({ error: 'Variant does not belong to the specified product' });
        }
      }

      const result = await pool.query(
        `INSERT INTO coas
           (product_id, variant_id, batch_number, lab_name, test_type,
            test_date, report_date, title, notes, status, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$10)
         RETURNING id`,
        [
          productId,
          variantId,
          normalizeText(body.batch_number, 100),
          normalizeText(body.lab_name, 255),
          normalizeText(body.test_type, 100),
          parseOptionalDate(body.test_date),
          parseOptionalDate(body.report_date),
          normalizeText(body.title, 255),
          normalizeText(body.notes, 10000),
          req.adminUserId
        ]
      );

      return res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create COA' });
    }
  });

  // GET /api/admin/coas/:id
  router.get('/coas/:id', gate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(404).json({ error: 'Not found' });

      const result = await pool.query(
        `SELECT c.id, c.product_id, c.variant_id, c.batch_number, c.lab_name,
                c.test_type, c.test_date, c.report_date, c.title, c.notes,
                c.file_name, c.file_mime_type, c.file_size,
                c.file_storage_key, c.thumbnail_storage_key,
                c.status, c.created_at, c.updated_at, c.published_at, c.archived_at,
                c.created_by, c.updated_by, c.published_by,
                COALESCE(p.name, c.product_name) AS product_name, pv.name AS variant_name,
                u1.name AS created_by_name,
                u2.name AS updated_by_name,
                u3.name AS published_by_name
           FROM coas c
           LEFT JOIN products p ON p.id = c.product_id
           LEFT JOIN product_variants pv ON pv.id = c.variant_id
           LEFT JOIN users u1 ON u1.id = c.created_by
           LEFT JOIN users u2 ON u2.id = c.updated_by
           LEFT JOIN users u3 ON u3.id = c.published_by
          WHERE c.id = $1`,
        [id]
      );

      if (!result.rows.length) return res.status(404).json({ error: 'Not found' });

      return res.json({ coa: toAdminCoa(result.rows[0]) });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load COA' });
    }
  });

  // PUT /api/admin/coas/:id — update metadata
  router.put('/coas/:id', gate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(404).json({ error: 'Not found' });

      const existing = await pool.query('SELECT id, product_id, status FROM coas WHERE id = $1', [id]);
      if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

      const body = req.body || {};
      const productId = parseInt(body.product_id, 10) || existing.rows[0].product_id;

      const prodCheck = await pool.query('SELECT id FROM products WHERE id = $1', [productId]);
      if (!prodCheck.rows.length) return res.status(400).json({ error: 'Product not found' });

      const variantId = parseInt(body.variant_id, 10) || null;
      if (variantId) {
        const varCheck = await pool.query(
          'SELECT id FROM product_variants WHERE id = $1 AND product_id = $2',
          [variantId, productId]
        );
        if (!varCheck.rows.length) {
          return res.status(400).json({ error: 'Variant does not belong to the specified product' });
        }
      }

      await pool.query(
        `UPDATE coas SET
           product_id   = $1,
           variant_id   = $2,
           batch_number = $3,
           lab_name     = $4,
           test_type    = $5,
           test_date    = $6,
           report_date  = $7,
           title        = $8,
           notes        = $9,
           updated_by   = $10,
           updated_at   = NOW()
         WHERE id = $11`,
        [
          productId,
          variantId,
          normalizeText(body.batch_number, 100),
          normalizeText(body.lab_name, 255),
          normalizeText(body.test_type, 100),
          parseOptionalDate(body.test_date),
          parseOptionalDate(body.report_date),
          normalizeText(body.title, 255),
          normalizeText(body.notes, 10000),
          req.adminUserId,
          id
        ]
      );

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update COA' });
    }
  });

  // POST /api/admin/coas/:id/publish
  router.post('/coas/:id/publish', gate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(404).json({ error: 'Not found' });

      const result = await pool.query(
        'SELECT id, product_id, file_storage_key, status FROM coas WHERE id = $1',
        [id]
      );
      const row = result.rows[0];
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (!row.file_storage_key) {
        return res.status(400).json({ error: 'A report file must be uploaded before publishing' });
      }
      if (!row.product_id) {
        return res.status(400).json({ error: 'A product must be associated before publishing' });
      }
      if (row.status === 'archived') {
        return res.status(400).json({ error: 'Archived COAs cannot be re-published; create a new record' });
      }

      await pool.query(
        `UPDATE coas SET
           status       = 'published',
           published_by = $1,
           published_at = NOW(),
           updated_by   = $1,
           updated_at   = NOW()
         WHERE id = $2`,
        [req.adminUserId, id]
      );

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to publish COA' });
    }
  });

  // POST /api/admin/coas/:id/unpublish
  router.post('/coas/:id/unpublish', gate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(404).json({ error: 'Not found' });

      const result = await pool.query('SELECT id, status FROM coas WHERE id = $1', [id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Not found' });

      await pool.query(
        `UPDATE coas SET
           status     = 'draft',
           updated_by = $1,
           updated_at = NOW()
         WHERE id = $2`,
        [req.adminUserId, id]
      );

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to unpublish COA' });
    }
  });

  // POST /api/admin/coas/:id/archive
  router.post('/coas/:id/archive', gate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(404).json({ error: 'Not found' });

      const result = await pool.query('SELECT id, status FROM coas WHERE id = $1', [id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Not found' });

      await pool.query(
        `UPDATE coas SET
           status      = 'archived',
           archived_at = NOW(),
           updated_by  = $1,
           updated_at  = NOW()
         WHERE id = $2`,
        [req.adminUserId, id]
      );

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to archive COA' });
    }
  });

  // DELETE /api/admin/coas/:id — only draft/archived records
  router.delete('/coas/:id', gate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(404).json({ error: 'Not found' });

      const result = await pool.query(
        'SELECT id, status, file_storage_key, thumbnail_storage_key FROM coas WHERE id = $1',
        [id]
      );
      const row = result.rows[0];
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (row.status === 'published') {
        return res.status(400).json({ error: 'Published COAs must be archived before deletion' });
      }

      // Remove the record and its stored bytes together, so a delete can never
        // leave a file behind that nothing points at.
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          if (row.file_storage_key) await coaStorage.deleteFile(client, row.file_storage_key);
          if (row.thumbnail_storage_key) await coaStorage.deleteFile(client, row.thumbnail_storage_key);
          await client.query('DELETE FROM coas WHERE id = $1', [id]);
          await client.query('COMMIT');
        } catch (txErr) {
          try { await client.query('ROLLBACK'); } catch (rollbackErr) { /* connection already broken */ }
          throw txErr;
        } finally {
          client.release();
        }
        coaStorage.logCoa('deleted', { coaId: id, adminUserId: req.adminUserId });
        return res.json({ ok: true });

    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete COA' });
    }
  });

  // POST /api/admin/coas/:id/file -- upload or replace the report file.
  //
  // Order of operations: validate the request -> validate the admin (gate) ->
  // load the COA -> parse the upload into a scratch directory -> validate size,
  // extension and the REAL content type -> write the file bytes and the coas row
  // inside ONE transaction -> respond. Every failure path rolls the transaction
  // back and deletes the scratch file, so a failed upload can never leave a
  // half-created record or an orphaned file behind.
  router.post('/coas/:id/file', gate, async (req, res) => {
      const startedAt = Date.now();
      let scratchPath = null;
      let client = null;

      try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(404).json({ error: 'COA not found' });

        const existing = await pool.query(
          'SELECT id, product_id, file_storage_key FROM coas WHERE id = $1',
          [id]
        );
        if (!existing.rows.length) return res.status(404).json({ error: 'COA not found' });
        const coaRow = existing.rows[0];

        const maxBytes = coaStorage.maxUploadBytes();
        const maxMb = Math.round(maxBytes / (1024 * 1024));

        coaStorage.logCoa('upload.start', {
            coaId: id,
            productId: coaRow.product_id,
            adminUserId: req.adminUserId,
            maxBytes: maxBytes
        });

        // Parse into the OS scratch directory. It is writable on every host we run
        // on, including read-only serverless filesystems where the old code called
        // mkdirSync inside the deployment and threw EROFS.
        const form = formidable({
            uploadDir: os.tmpdir(),
            maxFileSize: maxBytes,
            maxFiles: 1,
            keepExtensions: false,
            filename: function () { return 'coa-upload-' + crypto.randomUUID(); }
        });

        let files;
        try {
          const parsed = await form.parse(req);
          files = parsed[1];
        } catch (parseErr) {
          const msg = String((parseErr && parseErr.message) || '').toLowerCase();
          const tooBig = msg.includes('maxfilesize') || msg.includes('max file size') || msg.includes('size');
          coaStorage.logCoa('upload.parse_failed', {
              coaId: id, tooBig: tooBig, code: parseErr && parseErr.code
          });
          return res.status(400).json({
              error: tooBig
              ? ('File exceeds the ' + maxMb + ' MB limit.')
              : 'The uploaded file could not be read. Please try again.'
          });
        }

        const fileArr = (files && (files.file || files.report)) || null;
        const uploaded = Array.isArray(fileArr) ? fileArr[0] : fileArr;
        if (!uploaded || !uploaded.filepath) {
          coaStorage.logCoa('upload.no_file', { coaId: id });
          return res.status(400).json({ error: 'No file was received. Please choose a file and try again.' });
        }
        scratchPath = uploaded.filepath;

        const originalName = String(uploaded.originalFilename || '').trim();
        const declaredMime = String(uploaded.mimetype || '').toLowerCase().trim();
        const originalExt = path.extname(originalName).toLowerCase();

        if (originalExt && !coaStorage.ACCEPTED_EXTENSIONS.has(originalExt)) {
          coaStorage.logCoa('upload.rejected_extension', { coaId: id, ext: originalExt });
          return res.status(400).json({ error: 'Unsupported file type. Accepted formats: PDF, PNG, JPG.' });
        }

        const buffer = await fsp.readFile(scratchPath);
        if (!buffer.length) {
          return res.status(400).json({ error: 'The uploaded file is empty.' });
        }
        if (buffer.length > maxBytes) {
          return res.status(400).json({ error: 'File exceeds the ' + maxMb + ' MB limit.' });
        }

        // Trust the bytes, not the browser-declared type.
        const mimeType = coaStorage.sniffMimeType(buffer);
        if (!mimeType || !coaStorage.ACCEPTED_MIME_TYPES.has(mimeType)) {
          coaStorage.logCoa('upload.rejected_content', {
              coaId: id, declaredMime: declaredMime, bytes: buffer.length
          });
          return res.status(400).json({
              error: 'Unsupported file type. The file contents are not a PDF, PNG or JPG.'
          });
        }

        const storageKey = crypto.randomUUID() + coaStorage.extensionForMime(mimeType);
        const displayName =
        (path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)) || storageKey;
        const previousKey = coaRow.file_storage_key;

        client = await pool.connect();
        try {
          await client.query('BEGIN');
          await coaStorage.putFile(client, {
              storageKey: storageKey, coaId: id, mimeType: mimeType, buffer: buffer
          });
          await client.query(
            `UPDATE coas SET
file_storage_key = $1,
file_name = $2,
file_mime_type = $3,
file_size = $4,
thumbnail_storage_key = NULL,
updated_by = $5,
updated_at = NOW()
WHERE id = $6`,
            [storageKey, displayName, mimeType, buffer.length, req.adminUserId, id]
          );
          if (previousKey && previousKey !== storageKey) {
            await coaStorage.deleteFile(client, previousKey);
          }
          await client.query('COMMIT');
        } catch (txErr) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackErr) {
            coaStorage.logCoa('upload.rollback_failed', { coaId: id, code: rollbackErr && rollbackErr.code });
          }
          throw txErr;
        } finally {
          client.release();
          client = null;
        }

        // Local copy is a cache only, and only after the transaction committed.
        coaStorage.writeDiskCache(storageKey, buffer);

        coaStorage.logCoa('upload.success', {
            coaId: id,
            productId: coaRow.product_id,
            adminUserId: req.adminUserId,
            storageKey: storageKey,
            fileName: displayName,
            mimeType: mimeType,
            bytes: buffer.length,
            ms: Date.now() - startedAt
        });

        return res.json({
            ok: true,
            storageKey: storageKey,
            mimeType: mimeType,
            fileName: displayName,
            fileSize: buffer.length
        });
      } catch (err) {
        coaStorage.logCoa('upload.failed', {
            coaId: parseInt(req.params.id, 10) || null,
            adminUserId: req.adminUserId || null,
            code: err && err.code,
            message: err && err.message
        });
        console.error('[coa upload] unexpected failure', err && err.stack ? err.stack : err);
        return res.status(500).json({
            error: 'Unable to save the report file. The COA record was not changed.'
        });
      } finally {
        if (client) { try { client.release(); } catch (releaseErr) { /* already released */ } }
        if (scratchPath) {
          try { await fsp.unlink(scratchPath); } catch (unlinkErr) { /* already gone */ }
        }
      }
  });

  // GET /api/admin/coas/:id/file -- admin preview, any status.
  // Reads through the storage layer (disk cache first, database second) and
  // answers with a buffer rather than piping a stream, so a missing or
  // unreadable file is a clean 404 instead of an unhandled stream error.
  router.get('/coas/:id/file', gate, async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(404).json({ error: 'Not found' });

        const result = await pool.query(
          'SELECT file_storage_key, file_name, file_mime_type FROM coas WHERE id = $1',
          [id]
        );
        const row = result.rows[0];
        if (!row || !row.file_storage_key) {
          return res.status(404).json({ error: 'No report file is attached to this COA' });
        }

        const stored = await coaStorage.readFile(pool, row.file_storage_key);
        if (!stored || !stored.buffer || !stored.buffer.length) {
          coaStorage.logCoa('file.missing', {
              scope: 'admin', coaId: id, storageKey: row.file_storage_key
          });
          return res.status(404).json({ error: 'The stored report file is no longer available' });
        }

        const mime = row.file_mime_type || stored.mimeType || 'application/octet-stream';
        const displayName = String(row.file_name || row.file_storage_key).replace(/["\r\n]/g, '');
            res.setHeader('Content-Type', mime);
            res.setHeader('Content-Length', String(stored.buffer.length));
            res.setHeader('Content-Disposition', 'inline; filename="' + displayName + '"');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            return res.end(stored.buffer);
          } catch (err) {
            console.error('[coa admin file] failed', err && err.stack ? err.stack : err);
            return res.status(500).json({ error: 'Unable to load the report file' });
          }
      });

      // GET /api/admin/coas-products — products with their active variants for the COA form dropdown
  // Reuses products + product_variants tables (same data as the admin Products page).
  router.get('/coas-products', gate, async (req, res) => {
    try {
      const prodResult = await pool.query(
        'SELECT id, name FROM products WHERE active = true ORDER BY name ASC'
      );
      const products = prodResult.rows;

      if (!products.length) return res.json({ products: [] });

      const ids = products.map(function (p) { return p.id; });
      const placeholders = ids.map(function (_, i) { return '$' + (i + 1); }).join(',');
      const varResult = await pool.query(
        'SELECT id, product_id, name FROM product_variants WHERE product_id IN (' + placeholders + ') AND active = true ORDER BY product_id, name ASC',
        ids
      );

      // Group variants by product_id
      const varsByProduct = {};
      varResult.rows.forEach(function (v) {
        if (!varsByProduct[v.product_id]) varsByProduct[v.product_id] = [];
        varsByProduct[v.product_id].push({ id: v.id, name: v.name });
      });

      const withVariants = products.map(function (p) {
        return { id: p.id, name: p.name, variants: varsByProduct[p.id] || [] };
      });

      return res.json({ products: withVariants });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load products' });
    }
  });

  // GET /api/admin/coas-variants?product_id=X
  router.get('/coas-variants', gate, async (req, res) => {
    try {
      const productId = parseInt(req.query.product_id, 10);
      if (!productId) return res.json({ variants: [] });

      const result = await pool.query(
        "SELECT id, name FROM product_variants WHERE product_id = $1 AND active = true ORDER BY name ASC",
        [productId]
      );
      return res.json({ variants: result.rows });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load variants' });
    }
  });

  return router;
    }

    module.exports = createAdminCoasRouter;
