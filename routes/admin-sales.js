'use strict';
/**
 * Admin API for site-wide sales (Admin Console -> Site-wide Sale).
 *
 * A sale is a percentage discount applied to every order automatically while
 * it is live, plus the announcement bar that advertises it. The rules for what
 * "live" means are in services/sitewide-sale.js.
 */
const express = require('express');
const pool = require('../db/connection');
const sitewideSale = require('../services/sitewide-sale');

const RETURNING = `RETURNING ${sitewideSale.SALE_COLUMNS}`;

function has(body, key) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function parseOptionalDate(value) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'invalid' : d;
}

function parseOptionalInteger(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

/**
 * Validate a create or update body. On update only the fields that were sent
 * are checked and returned, so toggling `active` alone touches nothing else.
 */
function buildSalePayload(input, isUpdate) {
  const body = input || {};
  const out = {};

  if (!isUpdate || has(body, 'name')) {
    const name = String(body.name == null ? '' : body.name).trim();
    if (!name) return { error: 'Sale name is required.' };
    if (name.length > 60) return { error: 'Sale name must be 60 characters or fewer.' };
    out.name = name;
  }

  if (!isUpdate || has(body, 'discount_percent')) {
    const percent = Number(body.discount_percent);
    if (!Number.isFinite(percent) || percent <= 0) {
      return { error: 'Discount percent must be greater than 0.' };
    }
    if (percent > 100) return { error: 'Discount percent cannot exceed 100.' };
    out.discount_percent = Math.round(percent * 100) / 100;
  }

  if (has(body, 'banner_text') || !isUpdate) {
    const text = String(body.banner_text == null ? '' : body.banner_text).trim();
    if (text.length > 240) return { error: 'Announcement text must be 240 characters or fewer.' };
    out.banner_text = text || null;
  }

  if (has(body, 'show_banner') || !isUpdate) {
    out.show_banner = body.show_banner == null ? true : !!body.show_banner;
  }
  if (has(body, 'banner_scroll') || !isUpdate) {
    out.banner_scroll = !!body.banner_scroll;
  }

  if (has(body, 'starts_at') || !isUpdate) {
    const startsAt = parseOptionalDate(body.starts_at);
    if (startsAt === 'invalid') return { error: 'Start date is invalid.' };
    out.starts_at = startsAt ? startsAt.toISOString() : null;
  }
  if (has(body, 'expires_at') || !isUpdate) {
    const expiresAt = parseOptionalDate(body.expires_at);
    if (expiresAt === 'invalid') return { error: 'End date is invalid.' };
    out.expires_at = expiresAt ? expiresAt.toISOString() : null;
  }

  if (has(body, 'usage_limit') || !isUpdate) {
    const usageLimit = parseOptionalInteger(body.usage_limit);
    if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 0)) {
      return { error: 'Maximum uses must be a whole number, or blank for unlimited.' };
    }
    out.usage_limit = usageLimit;
  }

  if (has(body, 'active') || !isUpdate) {
    out.active = body.active == null ? true : !!body.active;
  }

  return { payload: out };
}

function decorate(row, liveId) {
  const status = sitewideSale.saleStatus(row);
  return Object.assign({}, row, {
    status,
    // Two sales can be live at once; only the larger discount is applied.
    applied_now: status === 'active' && liveId != null && Number(row.id) === Number(liveId),
    remaining_uses: row.usage_limit == null
      ? null
      : Math.max(Number(row.usage_limit) - Number(row.total_used || 0), 0),
    banner_preview: String(row.banner_text || '').trim() || sitewideSale.defaultBannerText(row),
  });
}

function createAdminSalesRouter(requireAuth, deps) {
  const db = (deps && deps.pool) || pool;
  const router = express.Router();

  async function requireAdmin(req, res, next) {
    try {
      const userId = (req.user && req.user.id) || (req.session && req.session.userId);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const result = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
      const role = result.rows.length ? result.rows[0].role : null;
      if (role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      req.adminUserId = userId;
      return next();
    } catch (error) {
      return next(error);
    }
  }

  const gate = [requireAuth, requireAdmin];

  router.get('/sales', gate, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT ${sitewideSale.SALE_COLUMNS} FROM sitewide_sales ORDER BY created_at DESC, id DESC`
      );
      const live = await sitewideSale.getLiveSale(db);
      const liveId = live ? live.id : null;
      res.json({
        sales: result.rows.map((row) => decorate(row, liveId)),
        live_sale_id: liveId,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to list site-wide sales.' });
    }
  });

  router.post('/sales', gate, async (req, res) => {
    try {
      const built = buildSalePayload(req.body, false);
      if (built.error) return res.status(400).json({ error: built.error });
      const p = built.payload;
      if (p.starts_at && p.expires_at && new Date(p.expires_at) < new Date(p.starts_at)) {
        return res.status(400).json({ error: 'End date cannot be earlier than start date.' });
      }
      const result = await db.query(
        `INSERT INTO sitewide_sales (
            name, discount_percent, banner_text, show_banner, banner_scroll,
            starts_at, expires_at, usage_limit, active, created_by, updated_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
         ${RETURNING}`,
        [p.name, p.discount_percent, p.banner_text, p.show_banner, p.banner_scroll,
          p.starts_at, p.expires_at, p.usage_limit, p.active, req.adminUserId]
      );
      sitewideSale.clearPublicSaleCache();
      const live = await sitewideSale.getLiveSale(db);
      res.status(201).json({ sale: decorate(result.rows[0], live ? live.id : null) });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create site-wide sale.' });
    }
  });

  router.put('/sales/:id', gate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid sale id.' });

      const existingRes = await db.query(
        `SELECT ${sitewideSale.SALE_COLUMNS} FROM sitewide_sales WHERE id = $1`, [id]
      );
      if (!existingRes.rows.length) return res.status(404).json({ error: 'Sale not found.' });

      const built = buildSalePayload(req.body, true);
      if (built.error) return res.status(400).json({ error: built.error });
      const next = Object.assign({}, existingRes.rows[0], built.payload);

      if (next.starts_at && next.expires_at && new Date(next.expires_at) < new Date(next.starts_at)) {
        return res.status(400).json({ error: 'End date cannot be earlier than start date.' });
      }

      const result = await db.query(
        `UPDATE sitewide_sales
            SET name = $1,
                discount_percent = $2,
                banner_text = $3,
                show_banner = $4,
                banner_scroll = $5,
                starts_at = $6,
                expires_at = $7,
                usage_limit = $8,
                active = $9,
                updated_by = $10,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $11
          ${RETURNING}`,
        [next.name, next.discount_percent, next.banner_text, next.show_banner, next.banner_scroll,
          next.starts_at, next.expires_at, next.usage_limit, next.active, req.adminUserId, id]
      );
      sitewideSale.clearPublicSaleCache();
      const live = await sitewideSale.getLiveSale(db);
      res.json({ sale: decorate(result.rows[0], live ? live.id : null) });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update site-wide sale.' });
    }
  });

  // Permanent delete. Orders placed during the sale keep their discount amount
  // and the sale's name (orders.promo_code); only the link back to this row is
  // cleared, by the ON DELETE SET NULL on orders.sitewide_sale_id.
  router.delete('/sales/:id', gate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid sale id.' });
      const result = await db.query(
        'DELETE FROM sitewide_sales WHERE id = $1 RETURNING id, name', [id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Sale not found.' });
      sitewideSale.clearPublicSaleCache();
      res.json({ deleted: true, sale: result.rows[0] });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete site-wide sale.' });
    }
  });

  return router;
}

module.exports = createAdminSalesRouter;
module.exports.buildSalePayload = buildSalePayload;
