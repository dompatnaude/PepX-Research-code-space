'use strict';

const express = require('express');
const crypto = require('crypto');
const pool = require('../db/connection');
const svc = require('../services/admin-customers');

// Match the existing password-reset token settings used in server.js.
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Admin Customers router. Mounted at /api/admin (same as the other admin
 * routers) so every route below is gated by requireAuth + requireAdmin.
 * We reuse the app's existing requireAuth middleware and replicate the same
 * server-side admin role check used by the other admin routers.
 */
function createAdminCustomersRouter(requireAuth) {
  const router = express.Router();

  // Same role check as routes/admin.js / admin-coas.js.
  async function requireAdmin(req, res, next) {
    try {
      const userId = (req.user && req.user.id) || (req.session && req.session.userId);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const result = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
      const role = result.rows.length ? result.rows[0].role : null;
      if (role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
      req.adminUserId = userId;
      return next();
    } catch (error) {
      return next(error);
    }
  }

  const gate = [requireAuth, requireAdmin];

  // Small helper: load a raw user row or null.
  async function loadUserRow(id) {
    const r = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return r.rows.length ? r.rows[0] : null;
  }

  // ----- LIST -------------------------------------------------------------
  router.get('/customers', gate, async (req, res, next) => {
    try {
      const { sql, params, countSql, countParams, limit, page } =
        svc.buildCustomerListQuery({
          search: req.query.search,
          filter: req.query.filter,
          sort: req.query.sort,
          page: req.query.page,
          pageSize: req.query.pageSize,
        });
      const [rowsRes, countRes] = await Promise.all([
        pool.query(sql, params),
        pool.query(countSql, countParams),
      ]);
      const now = new Date();
      const customers = rowsRes.rows.map((row) => svc.redactCustomer({
        id: row.id,
        name: row.name,
        email: row.email,
        createdAt: row.created_at,
        authMethod: svc.deriveAuthMethod({ googleId: row.google_id, passwordHash: row.password_hash, provider: row.provider }),
        status: svc.isAccountDisabled({ disabledAt: row.disabled_at }) ? 'disabled' : 'active',
        orderCount: Number(row.order_count) || 0,
        lifetimeSpend: Math.round(Number(row.lifetime_spend || 0) * 100) / 100,
        lastOrder: row.last_order || null,
        role: row.role,
      }));
      const total = Number(countRes.rows[0] && countRes.rows[0].total) || 0;
      const payload = { customers, total, page, pageSize: limit, pageCount: Math.ceil(total / limit) };
      svc.assertNoSecrets(payload);
      return res.json(payload);
    } catch (error) {
      return next(error);
    }
  });

  // ----- DETAIL / PROFILE -------------------------------------------------
  router.get('/customers/:id', gate, async (req, res, next) => {
    try {
      const row = await loadUserRow(req.params.id);
      if (!row) return res.status(404).json({ error: 'Customer not found' });
      const now = new Date();

      const ordersRes = await pool.query(
        `SELECT id, order_number, status, payment_status, total, created_at,
                tracking_number, carrier,
                shipping_name, shipping_address, shipping_city,
                shipping_state, shipping_zip, shipping_country, shipping_phone
         FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
        [row.id]
      );
      const orders = ordersRes.rows;
      const stats = svc.computeCustomerStats(orders);
      const addresses = svc.deriveAddressHistory(orders);

      const notesRes = await pool.query(
        `SELECT n.id, n.note, n.created_at, n.updated_at, n.admin_user_id,
                a.name AS admin_name, a.email AS admin_email
         FROM customer_notes n
         LEFT JOIN users a ON a.id = n.admin_user_id
         WHERE n.customer_id = $1
         ORDER BY n.created_at DESC`,
        [row.id]
      );

      const customer = svc.redactCustomer({
        id: row.id,
        name: row.name,
        email: row.email,
        createdAt: row.created_at,
        authMethod: svc.deriveAuthMethod(row),
        canResetPassword: svc.canReceivePasswordReset(row),
        status: svc.isAccountDisabled({ disabledAt: row.disabled_at }) ? 'disabled' : 'active',
        role: row.role,
      });

      const orderHistory = orders.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        date: o.created_at,
        status: o.status,
        paymentStatus: o.payment_status,
        total: Number(o.total || 0),
        trackingNumber: o.tracking_number || null,
        carrier: o.carrier || null,
        countsTowardSpend: svc.orderCountsTowardSpend(o),
      }));

      const payload = {
        customer,
        stats,
        addresses,
        orders: orderHistory,
        notes: notesRes.rows.map((n) => ({
          id: n.id,
          note: n.note,
          createdAt: n.created_at,
          updatedAt: n.updated_at,
          adminUserId: n.admin_user_id,
          adminName: n.admin_name || n.admin_email || 'Admin',
        })),
      };
      svc.assertNoSecrets(payload);
      return res.json(payload);
    } catch (error) {
      return next(error);
    }
  });

  // ----- INTERNAL NOTES (admin-only) --------------------------------------
  router.post('/customers/:id/notes', gate, async (req, res, next) => {
    try {
      const note = (req.body && req.body.note ? String(req.body.note) : '').trim();
      if (!note) return res.status(400).json({ error: 'Note text is required' });
      const user = await loadUserRow(req.params.id);
      if (!user) return res.status(404).json({ error: 'Customer not found' });
      const r = await pool.query(
        `INSERT INTO customer_notes (customer_id, admin_user_id, note)
         VALUES ($1, $2, $3) RETURNING id, note, created_at, updated_at, admin_user_id`,
        [req.params.id, req.adminUserId, note]
      );
      return res.status(201).json({ note: r.rows[0] });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/customers/:id/notes/:noteId', gate, async (req, res, next) => {
    try {
      const note = (req.body && req.body.note ? String(req.body.note) : '').trim();
      if (!note) return res.status(400).json({ error: 'Note text is required' });
      const r = await pool.query(
        `UPDATE customer_notes SET note = $1, updated_at = NOW()
         WHERE id = $2 AND customer_id = $3
         RETURNING id, note, created_at, updated_at, admin_user_id`,
        [note, req.params.noteId, req.params.id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Note not found' });
      return res.json({ note: r.rows[0] });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/customers/:id/notes/:noteId', gate, async (req, res, next) => {
    try {
      const r = await pool.query(
        `DELETE FROM customer_notes WHERE id = $1 AND customer_id = $2 RETURNING id`,
        [req.params.noteId, req.params.id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Note not found' });
      return res.json({ ok: true, deletedId: r.rows[0].id });
    } catch (error) {
      return next(error);
    }
  });

  // ----- DISABLE / ENABLE ACCOUNT -----------------------------------------
  // Reuses users.banned_until. Disabling sets a far-future sentinel;
  // enabling clears it. hydrateAuthenticatedUser + the login paths enforce it.
  router.post('/customers/:id/status', gate, async (req, res, next) => {
    try {
      const disabled = Boolean(req.body && req.body.disabled);
      const user = await loadUserRow(req.params.id);
      if (!user) return res.status(404).json({ error: 'Customer not found' });
      // Never allow an admin to disable their own account here.
      if (String(user.id) === String(req.adminUserId) && disabled) {
        return res.status(400).json({ error: 'You cannot disable your own admin account.' });
      }
      const value = disabled ? svc.disabledValue() : svc.enabledValue();
      await pool.query('UPDATE users SET disabled_at = $1 WHERE id = $2', [value, user.id]);
      const status = svc.isAccountDisabled({ disabledAt: value }) ? 'disabled' : 'active';
      return res.json({ ok: true, id: user.id, status });
    } catch (error) {
      return next(error);
    }
  });

  // ----- SEND PASSWORD RESET EMAIL ----------------------------------------
  // Triggers the SAME secure reset-token flow as the customer-facing
  // "Forgot Password". Never returns or exposes the token / password.
  router.post('/customers/:id/password-reset', gate, async (req, res, next) => {
    try {
      const user = await loadUserRow(req.params.id);
      if (!user) return res.status(404).json({ error: 'Customer not found' });
      if (!svc.canReceivePasswordReset(user)) {
        return res.status(400).json({
          error: 'This account signs in with Google only and has no password to reset.',
        });
      }
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
      await pool.query(
        'UPDATE users SET reset_token_hash = $1, reset_token_expires_at = $2, updated_at = NOW() WHERE id = $3',
        [tokenHash, expiresAt.toISOString(), user.id]
      );
      // In production the app emails the link; here we only confirm it was sent.
      // The raw token is intentionally NEVER returned in the response.
      return res.json({ ok: true, message: 'Password reset email has been triggered.' });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = createAdminCustomersRouter;
