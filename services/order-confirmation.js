/**
 * services/order-confirmation.js
 * ------------------------------------------------------------------
 * Database orchestration for the customer order receipt.
 *
 * Mirrors the easypost.js / shipping-workflow.js split used elsewhere
 * in this project: services/email.js is the provider client + template,
 * this module owns the database reads and the duplicate-send guard.
 *
 * Contract: sendOrderConfirmationForOrder() NEVER throws and never
 * changes the order. A receipt that cannot be delivered is logged and
 * reported in the return value; the order itself is untouched.
 * ------------------------------------------------------------------
 */

'use strict';

const defaultPool = require('../db/connection');
const { sendOrderConfirmation } = require('./email');

// Authoritative order values, plus the account name/email for the
// greeting and the fallback recipient. Selected server-side only.
const ORDER_QUERY =
  'SELECT o.*, u.name AS customer_name, u.email AS customer_email ' +
  'FROM orders o ' +
  'LEFT JOIN users u ON u.id = o.user_id ' +
  'WHERE o.id = $1';

const ITEMS_QUERY =
  'SELECT name, variant_name, price, quantity ' +
  'FROM order_items ' +
  'WHERE order_id = $1 ' +
  'ORDER BY id ASC';

// Atomically claim the send. Only the statement that flips the column
// from NULL affects a row, so repeated requests, retries, page
// refreshes and concurrent workers can never produce a second receipt.
const CLAIM_QUERY =
  'UPDATE orders ' +
  'SET order_confirmation_sent_at = NOW() ' +
  'WHERE id = $1 AND order_confirmation_sent_at IS NULL ' +
  'RETURNING id';

// Releases a claim that was taken but whose send then failed, so the
// receipt can legitimately be retried later.
const RELEASE_CLAIM_QUERY =
  'UPDATE orders SET order_confirmation_sent_at = NULL WHERE id = $1';

async function sendOrderConfirmationForOrder(orderId, options) {
  const opts = options || {};
  const db = opts.pool || defaultPool;
  const logger = opts.logger || console;
  const send = opts.send || sendOrderConfirmation;

  let claimed = false;

  try {
    const orderResult = await db.query(ORDER_QUERY, [orderId]);
    const order = (orderResult && orderResult.rows && orderResult.rows[0]) || null;
    if (!order) {
      return { sent: false, reason: 'order_not_found' };
    }

    const claimResult = await db.query(CLAIM_QUERY, [orderId]);
    if (!claimResult || !claimResult.rows || !claimResult.rows.length) {
      return { sent: false, reason: 'already_sent' };
    }
    claimed = true;

    const itemsResult = await db.query(ITEMS_QUERY, [orderId]);
    const items = (itemsResult && itemsResult.rows) || [];

    const result = await send(order, {
      items: items,
      env: opts.env || process.env,
      resend: opts.resend
    });

    return {
      sent: true,
      id: (result && result.id) || null,
      to: (result && result.to) || null
    };
  } catch (error) {
    if (claimed) {
      try {
        await db.query(RELEASE_CLAIM_QUERY, [orderId]);
      } catch (releaseError) {
        logger.error('Order confirmation claim release failed:', releaseError);
      }
    }
    // Never surface provider detail to the customer; log it for us.
    logger.error('Order confirmation email failed:', error);
    return { sent: false, reason: 'send_failed' };
  }
}

module.exports = {
  sendOrderConfirmationForOrder,
  ORDER_QUERY,
  ITEMS_QUERY,
  CLAIM_QUERY,
  RELEASE_CLAIM_QUERY
};
