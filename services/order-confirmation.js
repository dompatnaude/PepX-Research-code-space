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
 *
 * Every step emits an [email-debug] line so a silent failure in a
 * serverless environment is visible in the platform logs. These lines
 * carry booleans, ids and reason codes only - never an address body,
 * never a key, never a provider payload.
 * ------------------------------------------------------------------
 */

'use strict';

const defaultPool = require('../db/connection');
const { sendOrderConfirmation, resolveRecipient } = require('./email');

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
  const env = opts.env || process.env;
  const debug = (message, detail) => {
    if (typeof logger.log === 'function') {
      logger.log('[email-debug] ' + message, detail === undefined ? '' : detail);
    }
  };

  let claimed = false;

  try {
    debug('config present', {
      order_id: orderId,
      resend_key: Boolean(env.RESEND_API_KEY),
      from_email: Boolean(env.ORDER_FROM_EMAIL),
      site_url: Boolean(env.SITE_URL)
    });

    const orderResult = await db.query(ORDER_QUERY, [orderId]);
    const order = (orderResult && orderResult.rows && orderResult.rows[0]) || null;
    debug('order lookup', { order_id: orderId, found: Boolean(order) });
    if (!order) {
      return { sent: false, reason: 'order_not_found' };
    }

    debug('recipient resolved', {
      order_id: orderId,
      has_recipient: Boolean(resolveRecipient(order))
    });

    const claimResult = await db.query(CLAIM_QUERY, [orderId]);
    const acquired = Boolean(claimResult && claimResult.rows && claimResult.rows.length);
    debug('duplicate claim', { order_id: orderId, acquired: acquired });
    if (!acquired) {
      return { sent: false, reason: 'already_sent' };
    }
    claimed = true;

    const itemsResult = await db.query(ITEMS_QUERY, [orderId]);
    const items = (itemsResult && itemsResult.rows) || [];

    debug('resend call attempted', { order_id: orderId, item_count: items.length });
    const result = await send(order, { items: items, env: env, resend: opts.resend });
    debug('resend call succeeded', { order_id: orderId, message_id: (result && result.id) || null });

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
    debug('error caught', {
      order_id: orderId,
      claim_released: claimed,
      error_name: (error && error.name) || 'Error'
    });
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
