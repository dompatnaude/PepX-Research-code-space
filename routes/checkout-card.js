'use strict';
/**
 * Card checkout rail.
 *
 * The browser never tells this server that a payment succeeded — it only asks
 * this server to go and check. The payment host's signed answer is the only
 * thing that marks an order paid, so a browser that dies mid-flight leaves a
 * recoverable order and never a false one.
 */
const express = require('express');
const maef = require('../services/maef-card');
const { markOrderPaidByCard } = require('../services/mark-order-paid');

const money = (n) => Math.round(Number(n) * 100) / 100;

function createCheckoutCardRouter({ pool, requireAuth }) {
  const router = express.Router();

  async function loadOwnedOrder(req, res) {
    const orderId = parseInt(req.body && req.body.order_id, 10);
    if (!Number.isInteger(orderId)) {
      res.status(400).json({ error: 'Invalid order id' });
      return null;
    }
    const r = await pool.query(
      `SELECT id, user_id, status, total, shipping_cost, payment_method, payment_status,
              maef_session_token, maef_ref, order_number,
              shipping_name, shipping_email, shipping_address, shipping_city,
              shipping_state, shipping_zip, shipping_country
         FROM orders WHERE id = $1`,
      [orderId]
    );
    if (!r.rows.length) { res.status(404).json({ error: 'Order not found' }); return null; }
    const order = r.rows[0];
    // Ownership is the authorisation. An order id alone must never be enough.
    if (String(order.user_id) !== String(req.user && req.user.id)) {
      res.status(404).json({ error: 'Order not found' });
      return null;
    }
    return order;
  }

  // ── availability: the operator master switch. The card option stays hidden
  // until this says yes, so the store never shows a rail that cannot charge.
  router.get('/availability', requireAuth, (req, res) => {
    const c = maef.config();
    return res.json({ available: Boolean(c.enabled && c.base && c.secret) });
  });

  // ── prepare: hand the browser the frame address + a ticket so the buyer can
  // type their card BEFORE the order exists. Carries no order data.
  router.post('/prepare', requireAuth, async (req, res) => {
    if (!maef.available()) return res.status(503).json({ error: 'card_unavailable' });
    return res.json({
      embed_pay: maef.config().base + '/secure-card/',
      frame_ticket: maef.frameTicket(),
    });
  });

  // ── mint a payment session for an order the buyer already placed ──────────
  router.post('/session', requireAuth, async (req, res) => {
    try {
      if (!maef.available()) return res.status(503).json({ error: 'card_unavailable' });
      const order = await loadOwnedOrder(req, res);
      if (!order) return undefined;
      if (order.payment_method !== 'card') return res.status(400).json({ error: 'not_a_card_order' });
      if (order.payment_status === 'paid') return res.status(409).json({ error: 'already_paid' });

      const itemsRes = await pool.query(
        'SELECT product_id, variant_id, price AS unit_price, quantity FROM order_items WHERE order_id = $1 ORDER BY id',
        [order.id]
      );

      let ref = order.maef_ref;
      if (!ref) {
        ref = maef.neutralRef();
        await pool.query('UPDATE orders SET maef_ref = $2 WHERE id = $1', [order.id, ref]);
      }

      const { token } = await maef.mintSession({
        orderId: order.id,
        ref,
        total: money(order.total),
        shipping: money(order.shipping_cost || 0),
        items: itemsRes.rows,
      });

      await pool.query('UPDATE orders SET maef_session_token = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [order.id, token]);

      const nameParts = String(order.shipping_name || '').trim().split(/\s+/);
      return res.json({
        session_token: token,
        amount: money(order.total),
        embed_pay: maef.config().base + '/secure-card/',
        frame_ticket: maef.frameTicket(),
        billing: {
          email: order.shipping_email || '',
          first_name: nameParts[0] || '',
          last_name: nameParts.slice(1).join(' ') || '',
          address_1: order.shipping_address || '',
          city: order.shipping_city || '',
          state: order.shipping_state || '',
          postcode: order.shipping_zip || '',
          country: order.shipping_country || 'US',
        },
      });
    } catch (err) {
      console.error('[card] session mint failed:', err && err.message, err && err.upstreamStatus);
      return res.status(502).json({ error: 'session_unavailable' });
    }
  });

  // ── confirm: ask the payment host, then settle ───────────────────────────
  router.post('/confirm', requireAuth, async (req, res) => {
    try {
      if (!maef.available()) return res.status(503).json({ error: 'card_unavailable' });
      const order = await loadOwnedOrder(req, res);
      if (!order) return undefined;
      if (order.payment_status === 'paid') {
        return res.json({ paid: true, order_number: order.order_number });
      }
      if (!order.maef_session_token) return res.status(400).json({ paid: false, error: 'no_session' });

      const st = await maef.sessionStatus(order.maef_session_token);
      if (!st.paid) return res.json({ paid: false, state: st.state || '' });

      // The captured amount must equal what this store charged for, to the cent.
      if (st.amount == null || Math.abs(st.amount - money(order.total)) > 0.005) {
        console.error('[card] amount mismatch', { orderId: order.id, host: st.amount, store: money(order.total) });
        return res.status(409).json({ paid: false, error: 'amount_mismatch' });
      }

      const result = await markOrderPaidByCard(pool, order.id, st.transId);
      return res.json({
        paid: true,
        order_number: (result.order && result.order.order_number) || order.order_number,
      });
    } catch (err) {
      console.error('[card] confirm failed:', err && err.message);
      return res.status(502).json({ paid: false, error: 'confirm_unavailable' });
    }
  });

  return router;
}

module.exports = { createCheckoutCardRouter };
