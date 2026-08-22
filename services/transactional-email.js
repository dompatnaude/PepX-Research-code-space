/**
 * services/transactional-email.js
 * ------------------------------------------------------------------
 * Database orchestration for the two customer transactional emails.
 *
 * Mirrors the easypost.js / shipping-workflow.js split used elsewhere:
 * services/email.js is the provider client + templates, this module
 * owns the database reads, the state guards and the duplicate-send
 * protection.
 *
 *   sendPaymentConfirmationForOrder(orderId)  - after payment is paid
 *   sendShippingConfirmationForOrder(orderId) - after a label is bought
 *
 * Contract: neither function EVER throws and neither changes the order
 * beyond its own send-claim column. A message that cannot be delivered
 * is logged and reported in the return value; payment confirmation and
 * label purchase are never rolled back because of an email.
 *
 * Every step emits an [email-debug] line carrying booleans, ids and
 * reason codes only - never an address body, never a key, never a
 * provider payload.
 * ------------------------------------------------------------------
 */

'use strict';

const defaultPool = require('../db/connection');
const {
  sendPaymentConfirmation,
  sendShippingConfirmation,
  resolveRecipient,
  isPaymentConfirmed
} = require('./email');

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

// Newest live shipment that actually carries a tracking number.
const SHIPMENT_QUERY =
  'SELECT carrier, service, tracking_number, tracking_url, shipment_status, purchased_at ' +
  'FROM shipments ' +
  'WHERE order_id = $1 ' +
  '  AND is_voided = false ' +
  "  AND tracking_number IS NOT NULL AND tracking_number <> '' " +
  'ORDER BY purchased_at DESC NULLS LAST, id DESC ' +
  'LIMIT 1';

// Claim columns are fixed identifiers chosen in code, never user input.
const CLAIM_COLUMNS = {
  payment: 'payment_confirmation_sent_at',
  shipping: 'shipping_confirmation_sent_at'
};

function claimQuery(column) {
  return 'UPDATE orders SET ' + column + ' = NOW() ' +
    'WHERE id = $1 AND ' + column + ' IS NULL RETURNING id';
}

function releaseQuery(column) {
  return 'UPDATE orders SET ' + column + ' = NULL WHERE id = $1';
}

/**
 * Shared pipeline: load -> guard -> atomically claim -> gather -> send.
 * The claim is a conditional UPDATE, so only the statement that flips
 * the column from NULL wins. Repeated admin clicks, endpoint retries
 * and concurrent workers can never produce a second message.
 */
async function claimAndSend(spec) {
  const opts = spec.options || {};
  const db = opts.pool || defaultPool;
  const logger = opts.logger || console;
  const env = opts.env || process.env;
  const orderId = spec.orderId;
  const column = spec.column;
  const kind = spec.kind;

  const debug = (message, detail) => {
    if (typeof logger.log === 'function') {
      logger.log('[email-debug] ' + kind + ' ' + message, detail === undefined ? '' : detail);
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

    // State guard: the database decides whether this email is allowed yet.
    const gate = await spec.guard(order, db);
    debug('state guard', { order_id: orderId, allowed: gate.ok, reason: gate.reason || null });
    if (!gate.ok) {
      return { sent: false, reason: gate.reason };
    }

    debug('recipient resolved', {
      order_id: orderId,
      has_recipient: Boolean(resolveRecipient(order))
    });

    const claimResult = await db.query(claimQuery(column), [orderId]);
    const acquired = Boolean(claimResult && claimResult.rows && claimResult.rows.length);
    debug('duplicate claim', { order_id: orderId, acquired });
    if (!acquired) {
      return { sent: false, reason: 'already_sent' };
    }
    claimed = true;

    const itemsResult = await db.query(ITEMS_QUERY, [orderId]);
    const items = (itemsResult && itemsResult.rows) || [];

    debug('resend call attempted', { order_id: orderId, item_count: items.length });
    const result = await spec.send(order, {
      items,
      shipment: gate.shipment || null,
      env,
      resend: opts.resend
    });
    debug('resend call succeeded', {
      order_id: orderId,
      message_id: (result && result.id) || null
    });

    return { sent: true, id: (result && result.id) || null, to: (result && result.to) || null };
  } catch (error) {
    if (claimed) {
      try {
        await db.query(releaseQuery(column), [orderId]);
      } catch (releaseError) {
        logger.error('Transactional email claim release failed:', releaseError);
      }
    }
    debug('error caught', {
      order_id: orderId,
      claim_released: claimed,
      error_name: (error && error.name) || 'Error'
    });
    // Never surface provider detail to the customer; log it for us.
    logger.error(kind + ' email failed:', error);
    return { sent: false, reason: 'send_failed' };
  }
}

/**
 * Email 1. Only sends once the database itself says the money arrived:
 * payment_status = 'paid' (or a paid_at stamp on legacy rows).
 */
async function sendPaymentConfirmationForOrder(orderId, options) {
  const opts = options || {};
  return claimAndSend({
    orderId,
    options: opts,
    kind: 'payment-confirmation',
    column: CLAIM_COLUMNS.payment,
    guard: async (order) => {
      if (!isPaymentConfirmed(order)) {
        return { ok: false, reason: 'payment_not_confirmed' };
      }
      return { ok: true };
    },
    send: opts.send || sendPaymentConfirmation
  });
}

/**
 * Email 2. Only sends once a real tracking number exists on a live
 * shipment for this order. No tracking, no email.
 */
async function sendShippingConfirmationForOrder(orderId, options) {
  const opts = options || {};
  return claimAndSend({
    orderId,
    options: opts,
    kind: 'shipping-confirmation',
    column: CLAIM_COLUMNS.shipping,
    guard: async (order, db) => {
      const shipmentResult = await db.query(SHIPMENT_QUERY, [orderId]);
      const shipment = (shipmentResult && shipmentResult.rows && shipmentResult.rows[0]) || null;
      const trackingNumber = String(
        (shipment && shipment.tracking_number) || order.tracking_number || ''
      ).trim();
      if (!trackingNumber) {
        return { ok: false, reason: 'no_tracking_number' };
      }
      return { ok: true, shipment: shipment || null };
    },
    send: opts.send || sendShippingConfirmation
  });
}

module.exports = {
  sendPaymentConfirmationForOrder,
  sendShippingConfirmationForOrder,
  ORDER_QUERY,
  ITEMS_QUERY,
  SHIPMENT_QUERY,
  CLAIM_COLUMNS,
  claimQuery,
  releaseQuery
};
