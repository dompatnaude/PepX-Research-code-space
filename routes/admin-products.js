'use strict';

const express = require('express');
const pool = require('../db/connection');
const { withTransaction } = require('../services/db-transaction');

function toBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return fallback;
}

function normalizeText(value, maxLen) {
  if (value == null) return '';
  const normalized = String(value).trim();
  if (!normalized) return '';
  if (maxLen && normalized.length > maxLen) return normalized.slice(0, maxLen);
  return normalized;
}

function parsePrice(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function parseStock(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) return null;
  return num;
}

function validateSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function buildPayload(body, isUpdate) {
  const src = body || {};
  const payload = {
    name: normalizeText(src.name, 255),
    slug: normalizeText(src.slug, 255).toLowerCase(),
    description: normalizeText(src.description, 20000),
    category: normalizeText(src.category, 100),
    image_url: normalizeText(src.image_url, 2000),
    sku: normalizeText(src.sku, 100),
    active: toBoolean(src.active, true)
  };

  const price = parsePrice(src.price);
  if (price == null) {
    return { error: 'price must be a non-negative number' };
  }
  payload.price = price;

  const stockQuantity = parseStock(src.stock_quantity);
  if (stockQuantity == null) {
    return { error: 'stock_quantity must be an integer greater than or equal to 0' };
  }
  payload.stock_quantity = stockQuantity;

  if (!isUpdate) {
    if (!payload.name) return { error: 'name is required' };
    if (!payload.slug) return { error: 'slug is required' };
  }

  if (payload.slug && !validateSlug(payload.slug)) {
    return { error: 'slug must contain only lowercase letters, numbers, and hyphens' };
  }

  return { payload: payload };
}

function createAdminProductsRouter(requireAuth, deps) {
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

  router.get('/', gate, async (req, res) => {
    try {
      const result = await db.query(
        'SELECT p.id, p.name, p.slug, p.description, p.price, p.category, p.image_url, p.sku, p.stock_quantity, p.active, p.created_at, ' +
        '(SELECT SUM(pv.stock_quantity) FROM product_variants pv WHERE pv.product_id = p.id AND pv.active = true) AS variant_stock_total ' +
        'FROM products p ORDER BY p.created_at DESC'
      );
      res.json({ products: result.rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to list products' });
    }
  });

  router.post('/', gate, async (req, res) => {
    try {
      const built = buildPayload(req.body, false);
      if (built.error) {
        return res.status(400).json({ error: built.error });
      }
      const p = built.payload;
      const result = await db.query(
        'INSERT INTO products (name, slug, description, price, category, image_url, sku, stock_quantity, active) ' +
        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, name, slug, description, price, category, image_url, sku, stock_quantity, active, created_at',
        [p.name, p.slug, p.description || null, p.price, p.category || null, p.image_url || null, p.sku || null, p.stock_quantity, p.active]
      );
      res.status(201).json({ product: result.rows[0] });
    } catch (error) {
      if (error && error.code === '23505') {
        return res.status(409).json({ error: 'slug or sku already exists' });
      }
      console.error(error);
      res.status(500).json({ error: 'Failed to create product' });
    }
  });

  router.put('/:id', gate, async (req, res) => {
    try {
      const productId = parseInt(req.params.id, 10);
      if (!Number.isInteger(productId)) {
        return res.status(400).json({ error: 'Invalid product id' });
      }
      const built = buildPayload(req.body, true);
      if (built.error) {
        return res.status(400).json({ error: built.error });
      }
      const p = built.payload;
      const result = await db.query(
        'UPDATE products SET name = $1, slug = $2, description = $3, price = $4, category = $5, image_url = $6, sku = $7, stock_quantity = $8, active = $9, updated_at = CURRENT_TIMESTAMP ' +
        'WHERE id = $10 RETURNING id, name, slug, description, price, category, image_url, sku, stock_quantity, active, created_at',
        [p.name, p.slug, p.description || null, p.price, p.category || null, p.image_url || null, p.sku || null, p.stock_quantity, p.active, productId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.json({ product: result.rows[0] });
    } catch (error) {
      if (error && error.code === '23505') {
        return res.status(409).json({ error: 'slug or sku already exists' });
      }
      console.error(error);
      res.status(500).json({ error: 'Failed to update product' });
    }
  });

  // Permanently deletes a product.
  //
  // This is a real DELETE, not `SET active = false` -- the row leaves the
  // database, so it disappears from the admin Products list and from the
  // customer-facing catalog at the same time. Disable/Enable
  // (PUT /:id/status) remains available as the reversible soft option.
  //
  // Historical orders are preserved. order_items keeps its own snapshot of the
  // line item (name, price, quantity, variant_name, variant_price) and
  // migration 031 changed order_items.product_id to ON DELETE SET NULL, so
  // past orders keep every figure they were placed with and only lose the
  // pointer to a catalog entry that no longer exists. COA records are detached
  // the same way, keeping a product_name/product_slug snapshot. Live cart rows
  // and product variants cascade away with the product.
  router.delete('/:id', gate, async (req, res) => {
    try {
      const productId = parseInt(req.params.id, 10);
      if (!Number.isInteger(productId)) {
        return res.status(400).json({ error: 'Invalid product id' });
      }

      const existing = await db.query('SELECT id, name, slug FROM products WHERE id = $1', [productId]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }
      const product = existing.rows[0];

      const result = await withTransaction(db, async (client) => {
        // Freeze what history needs before the links are severed.
        await client.query(
          "UPDATE order_items SET name = $2 WHERE product_id = $1 AND (name IS NULL OR BTRIM(name) = '')",
          [productId, product.name]
        );
        await client.query(
          'UPDATE coas SET product_name = COALESCE(product_name, $2), product_slug = COALESCE(product_slug, $3) WHERE product_id = $1',
          [productId, product.name, product.slug]
        );

        const orderRefs = await client.query(
          'SELECT COUNT(*)::int AS count FROM order_items WHERE product_id = $1',
          [productId]
        );
        const coaRefs = await client.query(
          'SELECT COUNT(*)::int AS count FROM coas WHERE product_id = $1',
          [productId]
        );

        const deleted = await client.query(
          'DELETE FROM products WHERE id = $1 RETURNING id, name, slug',
          [productId]
        );

        return {
          deleted: deleted.rows[0],
          orderItemsPreserved: Number((orderRefs.rows[0] && orderRefs.rows[0].count) || 0),
          coasDetached: Number((coaRefs.rows[0] && coaRefs.rows[0].count) || 0)
        };
      });

      if (!result.deleted) {
        return res.status(404).json({ error: 'Product not found' });
      }

      return res.json({
        deleted: true,
        mode: 'hard_delete',
        product: result.deleted,
        order_items_preserved: result.orderItemsPreserved,
        coas_detached: result.coasDetached
      });
    } catch (error) {
      // A constraint we do not know about still points at this product. Say so
      // rather than silently falling back to disabling the row.
      if (error && error.code === '23503') {
        return res.status(409).json({
          error: 'This product is still referenced by other records and could not be deleted. Disable it instead.'
        });
      }
      console.error(error);
      res.status(500).json({ error: 'Failed to delete product' });
    }
  });

  router.put('/:id/status', gate, async (req, res) => {
    try {
      const productId = parseInt(req.params.id, 10);
      if (!Number.isInteger(productId)) {
        return res.status(400).json({ error: 'Invalid product id' });
      }
      const active = toBoolean(req.body && req.body.active, null);
      if (active == null) {
        return res.status(400).json({ error: 'active must be true or false' });
      }
      const result = await db.query(
        'UPDATE products SET active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, active',
        [active, productId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.json({ product: result.rows[0] });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update product status' });
    }
  });

  return router;
}

module.exports = createAdminProductsRouter;
