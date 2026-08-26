'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { formidable } = require('formidable');
const pool = require('../db/connection');

// ---- constants -------------------------------------------------------

const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg'
]);

const ACCEPTED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

// ---- helpers ---------------------------------------------------------

function coaUploadDir() {
  return process.env.COA_UPLOAD_DIR || path.join(__dirname, '..', 'uploads', 'coas');
}

function ensureUploadDir() {
  const dir = coaUploadDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeExt(mime) {
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  return '';
}

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
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
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

      // Remove stored files
      const dir = coaUploadDir();
      if (row.file_storage_key) {
        const fp = path.join(dir, row.file_storage_key);
        if (fp.startsWith(dir) && fs.existsSync(fp)) fs.unlinkSync(fp);
      }
      if (row.thumbnail_storage_key) {
        const tp = path.join(dir, row.thumbnail_storage_key);
        if (tp.startsWith(dir) && fs.existsSync(tp)) fs.unlinkSync(tp);
      }

      await pool.query('DELETE FROM coas WHERE id = $1', [id]);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete COA' });
    }
  });

  // POST /api/admin/coas/:id/file — upload or replace the report file
  router.post('/coas/:id/file', gate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(404).json({ error: 'Not found' });

      const existing = await pool.query(
        'SELECT id, file_storage_key, thumbnail_storage_key FROM coas WHERE id = $1',
        [id]
      );
      if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

      const dir = ensureUploadDir();

      const form = formidable({
        uploadDir: dir,
        maxFileSize: MAX_FILE_SIZE,
        maxFiles: 1,
        keepExtensions: false,
        filename: () => crypto.randomUUID() // temporary name, renamed after MIME check
      });

      let fields, files;
      try {
        [fields, files] = await form.parse(req);
      } catch (parseErr) {
        const msg = String(parseErr && parseErr.message || '').toLowerCase();
        if (msg.includes('maxfilesize') || msg.includes('size')) {
          return res.status(400).json({ error: 'File exceeds the 25 MB size limit' });
        }
        return res.status(400).json({ error: 'File upload failed' });
      }

      const fileArr = files.file || files.report;
      const uploaded = Array.isArray(fileArr) ? fileArr[0] : fileArr;
      if (!uploaded || !uploaded.filepath) {
        return res.status(400).json({ error: 'No file received' });
      }

      const mime = (uploaded.mimetype || '').toLowerCase().trim();
      const origName = uploaded.originalFilename || uploaded.newFilename || '';
      const origExt = path.extname(origName).toLowerCase();

      // Validate MIME type
      if (!ACCEPTED_MIME_TYPES.has(mime)) {
        fs.unlinkSync(uploaded.filepath);
        return res.status(400).json({ error: 'Unsupported file type. Accepted: PDF, PNG, JPG, JPEG' });
      }

      // Validate extension matches MIME
      if (origExt && !ACCEPTED_EXTENSIONS.has(origExt)) {
        fs.unlinkSync(uploaded.filepath);
        return res.status(400).json({ error: 'File extension does not match accepted types' });
      }

      const ext = safeExt(mime);
      const storageKey = crypto.randomUUID() + ext;
      const finalPath = path.join(dir, storageKey);

      fs.renameSync(uploaded.filepath, finalPath);

      const oldRow = existing.rows[0];

      // Remove old file if being replaced
      if (oldRow.file_storage_key && oldRow.file_storage_key !== storageKey) {
        const oldPath = path.join(dir, oldRow.file_storage_key);
        if (oldPath.startsWith(dir) && fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
      if (oldRow.thumbnail_storage_key) {
        const oldThumb = path.join(dir, oldRow.thumbnail_storage_key);
        if (oldThumb.startsWith(dir) && fs.existsSync(oldThumb)) {
          fs.unlinkSync(oldThumb);
        }
      }

      const sanitizedName = path.basename(origName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || storageKey;

      await pool.query(
        `UPDATE coas SET
           file_storage_key      = $1,
           file_name             = $2,
           file_mime_type        = $3,
           file_size             = $4,
           thumbnail_storage_key = NULL,
           updated_by            = $5,
           updated_at            = NOW()
         WHERE id = $6`,
        [
          storageKey,
          sanitizedName,
          mime,
          uploaded.size || null,
          req.adminUserId,
          id
        ]
      );

      return res.json({ ok: true, storageKey, mimeType: mime, fileName: sanitizedName });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  // GET /api/admin/coas/:id/file — serve the file for admin preview (any status)
  router.get('/coas/:id/file', gate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(404).end();

      const result = await pool.query(
        'SELECT file_storage_key, file_name, file_mime_type FROM coas WHERE id = $1',
        [id]
      );
      const row = result.rows[0];
      if (!row || !row.file_storage_key) return res.status(404).end();

      const dir = coaUploadDir();
      const filePath = path.join(dir, row.file_storage_key);
      if (!filePath.startsWith(dir)) return res.status(400).end();
      if (!fs.existsSync(filePath)) return res.status(404).end();

      const mime = row.file_mime_type || 'application/octet-stream';
      const displayName = row.file_name || row.file_storage_key;
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', 'inline; filename="' + displayName.replace(/"/g, '') + '"');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      return res.status(500).end();
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
