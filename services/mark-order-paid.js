'use strict';
/**
 * The single place a card payment moves an order into the store's own paid state.
 *
 * This mirrors the transition the Zelle confirmation performs in routes/admin.js:
 * payment_status='paid' + paid_at + status='processing'. Writing payment_status
 * alone is NOT enough — the fulfilment, label and reporting queries in
 * services/shipping-workflow.js and routes/admin.js key on status='processing',
 * so an order marked only 'paid' would never reach the ship queue.
 *
 * The notifier is injectable for the same reason the admin router injects it:
 * so tests can observe it without sending mail.
 */
const { sendPaymentConfirmationForOrder } = require('./transactional-email');

async function markOrderPaidByCard(db, orderId, transactionRef, deps = {}) {
  const notifyPaymentConfirmed =
    deps.notifyPaymentConfirmed || ((id) => sendPaymentConfirmationForOrder(id, { pool: db }));

  const result = await db.query(
    `UPDATE orders
        SET payment_status = 'paid',
            paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
            status = CASE WHEN status = 'pending_payment' THEN 'processing' ELSE status END,
            payment_reference = COALESCE(payment_reference, $2),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND COALESCE(payment_status, '') <> 'paid'
      RETURNING id, order_number, payment_status, paid_at, status, total`,
    [orderId, transactionRef || null]
  );
  if (!result.rows.length) return { updated: false };

  // Payment state is durable at this point. Announcing it is best-effort and
  // must never fail the confirmation.
  try {
    await notifyPaymentConfirmed(orderId);
  } catch (emailError) {
    console.error('[card] payment confirmation email failed:', emailError);
  }
  return { updated: true, order: result.rows[0] };
}

module.exports = { markOrderPaidByCard };
