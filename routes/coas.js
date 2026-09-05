'use strict';

const express = require('express');
const pool = require('../db/connection');
const coaStorage = require('../services/coa-storage');

// Shared helpers -------------------------------------------------------

function toPublicCoa(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name || null,
    productImageUrl: row.product_image_url || null,
    variantId: row.variant_id || null,
    variantName: row.variant_name || null,
    batchNumber: row.batch_number || null,
    labName: row.lab_name || null,
    testType: row.test_type || null,
    testDate: row.test_date || null,
    reportDate: row.report_date || null,
    title: row.title || null,
    fileType: row.file_mime_type
      ? (row.file_mime_type.includes('pdf') ? 'pdf' : 'image')
      : null,
    hasThumbnail: !!row.thumbnail_storage_key,
    publishedAt: row.published_at || null
  };
}

// Router factory -------------------------------------------------------

function createCoasRouter() {
  const router = express.Router();

  // GET /api/coas
  router.get('/', async (req, res) => {
    try {
      const params = [];
      const where = ["c.status = 'published'"];

      const search = String(req.query.search || '').trim();
      if (search) {
        params.push('%' + search + '%');
        const p = '$' + params.length;
        where.push(
          '(p.name ILIKE ' + p +
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

      const whereSql = 'WHERE ' + where.join(' AND ');

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || 24));
      const offset = (page - 1) * pageSize;

      params.push(pageSize);
      const limitParam = '$' + params.length;
      params.push(offset);
      const offsetParam = '$' + params.length;

      const sql = `
        SELECT c.id, c.product_id, c.variant_id, c.batch_number, c.lab_name,
               c.test_type, c.test_date, c.report_date, c.title,
               c.file_mime_type, c.thumbnail_storage_key, c.published_at,
               p.name AS product_name, p.image_url AS product_image_url,
               pv.name AS variant_name
          FROM coas c
          JOIN products p ON p.id = c.product_id
          LEFT JOIN product_variants pv ON pv.id = c.variant_id
         ${whereSql}
         ORDER BY c.published_at DESC NULLS LAST, c.id DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}
      `;

      const countSql = `
        SELECT COUNT(*)::int AS total
          FROM coas c
          JOIN products p ON p.id = c.product_id
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
        coas: rows.rows.map(toPublicCoa),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      });
    } catch (err) {
    console.error('[coa list] failed', err && err.stack ? err.stack : err);
    return res.status(503).json({
      error: 'COA information is temporarily unavailable.',
      unavailable: true,
      coas: [],
      pagination: { page: 1, pageSize: 0, total: 0, totalPages: 0 }
    });
  }
  });

  // GET /api/coas/:id
  router.get('/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(404).json({ error: 'Not found' });

      const result = await pool.query(
        `SELECT c.id, c.product_id, c.variant_id, c.batch_number, c.lab_name,
                c.test_type, c.test_date, c.report_date, c.title,
                c.file_mime_type, c.thumbnail_storage_key, c.published_at,
                p.name AS product_name, p.image_url AS product_image_url,
                pv.name AS variant_name
           FROM coas c
           JOIN products p ON p.id = c.product_id
           LEFT JOIN product_variants pv ON pv.id = c.variant_id
          WHERE c.id = $1 AND c.status = 'published'`,
        [id]
      );

      if (!result.rows.length) return res.status(404).json({ error: 'Not found' });

      return res.json({ coa: toPublicCoa(result.rows[0]) });
    } catch (err) {
    console.error('[coa detail] failed', err && err.stack ? err.stack : err);
    return res.status(503).json({ error: 'COA information is temporarily unavailable.', unavailable: true });
  }
  });

  // GET /api/coas/:id/file -- serves the report for published COAs only.
  // Answers with a buffer rather than piping a stream: a deleted or unreadable
  // file becomes a clean 404 instead of an unhandled 'error' event on a stream,
  // which in Node terminates the process.
  router.get('/:id/file', async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(404).end();

        const result = await pool.query(
          `SELECT file_storage_key, file_name, file_mime_type
FROM coas
WHERE id = $1 AND status = 'published'`,
          [id]
        );

        const row = result.rows[0];
        if (!row || !row.file_storage_key) return res.status(404).end();

        const stored = await coaStorage.readFile(pool, row.file_storage_key);
        if (!stored || !stored.buffer || !stored.buffer.length) {
          coaStorage.logCoa('file.missing', {
              scope: 'public', coaId: id, storageKey: row.file_storage_key
          });
          return res.status(404).end();
        }

        const mime = row.file_mime_type || stored.mimeType || 'application/octet-stream';
        const displayName = String(row.file_name || row.file_storage_key).replace(/["\r\n]/g, '');
            res.setHeader('Content-Type', mime);
            res.setHeader('Content-Length', String(stored.buffer.length));
            res.setHeader('Content-Disposition', 'inline; filename="' + displayName + '"');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Cache-Control', 'private, max-age=300');
            return res.end(stored.buffer);
          } catch (err) {
            console.error('[coa public file] failed', err && err.stack ? err.stack : err);
            return res.status(503).end();
          }
      });

      // GET /api/coas/:id/thumbnail -- serves the thumbnail for published COAs.
      router.get('/:id/thumbnail', async (req, res) => {
          try {
            const id = parseInt(req.params.id, 10);
            if (!id) return res.status(404).end();

            const result = await pool.query(
              `SELECT thumbnail_storage_key
FROM coas
WHERE id = $1 AND status = 'published'`,
              [id]
            );

            const row = result.rows[0];
            if (!row || !row.thumbnail_storage_key) return res.status(404).end();

            const stored = await coaStorage.readFile(pool, row.thumbnail_storage_key);
            if (!stored || !stored.buffer || !stored.buffer.length) return res.status(404).end();

            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Content-Length', String(stored.buffer.length));
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Cache-Control', 'private, max-age=300');
            return res.end(stored.buffer);
          } catch (err) {
            console.error('[coa public thumbnail] failed', err && err.stack ? err.stack : err);
            return res.status(503).end();
          }
      });

      return router;
    }

    module.exports = createCoasRouter;
