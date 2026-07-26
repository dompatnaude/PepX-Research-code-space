'use strict';

const express = require('express');
const pool = require('../db/connection');
const shipping = require('../services/shipping');

// Allowed order statuses (kept in one place, reused by validation).
const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'completed',
  'cancelled'
];

function money(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Factory. Takes the app's existing requireAuth middleware so we reuse
 * the exact same session/authentication logic (no duplicate auth).
 */
function createAdminRouter(requireAuth) {
  const router = express.Router();

  // --- requireAdmin -------------------------------------------------
  // 1. runs requireAuth first (verifies logged in, sets req.user)
  // 2. looks up the user's role in the DB
  // 3. blocks anyone whose role !== 'admin'
  async function requireAdmin(req, res, next) {
    try {
      const userId = (req.user && req.user.id) || (req.session && req.session.userId);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const result = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
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

  // Every admin route is gated by requireAuth THEN requireAdmin.
  const gate = [requireAuth, requireAdmin];

  // --- GET /api/admin/orders ---------------------------------------
  // list all orders, with optional ?search= and ?status= filters
  router.get('/orders', gate, async (req, res) => {
    try {
      const params = [];
      const where = [];
      const status = (req.query.status || '').trim();
      if (status && ORDER_STATUSES.indexOf(status) !== -1) {
        params.push(status);
        where.push('o.status = $' + params.length);
      }
      const search = (req.query.search || '').trim();
      if (search) {
        params.push('%' + search + '%');
        const p = '$' + params.length;
        where.push('(o.order_number ILIKE ' + p +
          ' OR o.shipping_name ILIKE ' + p +
          ' OR o.shipping_email ILIKE ' + p +
          ' OR o.tracking_number ILIKE ' + p + ')');
      }
      const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
      const sql =
        'SELECT o.id, o.order_number, o.status, o.total, o.created_at, ' +
        'o.shipping_name, o.shipping_email, o.tracking_number, o.carrier, ' +
        'o.shipping_label_url, o.shipped_at, ' +
        "CASE WHEN o.shipped_at IS NOT NULL THEN 'shipped' " +
        "WHEN o.shipping_label_url IS NOT NULL THEN 'label_created' " +
        "ELSE 'unfulfilled' END AS fulfillment_status " +
        'FROM orders o ' + whereSql + ' ORDER BY o.created_at DESC';
      const result = await pool.query(sql, params);
      res.json({ orders: result.rows, statuses: ORDER_STATUSES });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to list orders' });
    }
  });

  // --- GET /api/admin/orders/:id -----------------------------------
  router.get('/orders/:id', gate, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }
      const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      if (orderRes.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      const order = orderRes.rows[0];
      const itemsRes = await pool.query(
        "SELECT id, product_id, variant_id, " +
        "CASE WHEN variant_name IS NOT NULL AND variant_name <> '' THEN name || ' (' || variant_name || ')' ELSE name END AS name, " +
        'price, quantity FROM order_items WHERE order_id = $1 ORDER BY id ASC',
        [orderId]
      );
      const customer = {
        name: order.shipping_name,
        email: order.shipping_email
      };
      const shippingAddress = {
        name: order.shipping_name,
        address: order.shipping_address,
        city: order.shipping_city,
        state: order.shipping_state,
        zip: order.shipping_zip,
        email: order.shipping_email
      };
      res.json({
        order: order,
        customer: customer,
        shipping_address: shippingAddress,
        items: itemsRes.rows,
        totals: {
          subtotal: order.subtotal,
          subtotal_before_discount: order.subtotal_before_discount,
          discount_amount: order.discount_amount,
          promo_code: order.promo_code,
          shipping_cost: order.shipping_cost,
          total: order.total
        },
        status: order.status,
        tracking: {
          tracking_number: order.tracking_number,
          carrier: order.carrier,
          shipping_label_url: order.shipping_label_url,
          shipping_label_created_at: order.shipping_label_created_at,
          shipped_at: order.shipped_at
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  // --- PUT /api/admin/orders/:id/status ----------------------------
  router.put('/orders/:id/status', gate, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }
      const status = (req.body && req.body.status || '').trim();
      if (ORDER_STATUSES.indexOf(status) === -1) {
        return res.status(400).json({ error: 'Invalid status', allowed: ORDER_STATUSES });
      }
      // When moving to shipped, stamp shipped_at if not already set.
      const setShipped = status === 'shipped';
      const sql = setShipped
        ? 'UPDATE orders SET status = $1, shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, status, shipped_at'
        : 'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, status, shipped_at';
      const result = await pool.query(sql, [status, orderId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  // --- POST /api/admin/orders/:id/label ----------------------------
  // placeholder shipping-label workflow via services/shipping.js
  router.post('/orders/:id/label', gate, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }
      const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      if (orderRes.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      const order = orderRes.rows[0];
      const itemsRes = await pool.query(
        'SELECT product_id, name, price, quantity FROM order_items WHERE order_id = $1 ORDER BY id ASC',
        [orderId]
      );
      order.items = itemsRes.rows;

      // Delegate to the provider abstraction (stub for now).
      const label = await shipping.createShippingLabel(order);

      const updated = await pool.query(
        'UPDATE orders SET tracking_number = $1, carrier = $2, shipping_label_url = $3, ' +
        'shipping_label_created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP ' +
        'WHERE id = $4 RETURNING id, tracking_number, carrier, shipping_label_url, shipping_label_created_at, status',
        [label.tracking_number, label.carrier, label.label_url, orderId]
      );
      res.status(201).json({
        order: updated.rows[0],
        label: label
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create shipping label' });
    }
  });

  // --- PUT /api/admin/orders/:id/shipping --------------------------
  // manually save/override tracking info
  router.put('/orders/:id/shipping', gate, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }
      const body = req.body || {};
      const result = await pool.query(
        'UPDATE orders SET tracking_number = $1, carrier = $2, shipping_label_url = $3, ' +
        'updated_at = CURRENT_TIMESTAMP WHERE id = $4 ' +
        'RETURNING id, tracking_number, carrier, shipping_label_url, status',
        [
          body.tracking_number != null ? body.tracking_number : null,
          body.carrier != null ? body.carrier : null,
          body.shipping_label_url != null ? body.shipping_label_url : null,
          orderId
        ]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to save shipping info' });
    }
  });

  return router;
}

module.exports = createAdminRouter;
module.exports.ORDER_STATUSES = ORDER_STATUSES;
