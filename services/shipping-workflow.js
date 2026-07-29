'use strict';

const pool = require('../db/connection');
const {
  getEasyPostClient,
  getShipFromAddress,
  sanitizeRate,
  sanitizeShipmentRecord,
  sanitizeTrackerStatus,
  validateDestinationAddress,
  validatePackageInput,
  buildShipmentCreateParams,
  addressesMatch,
  formatAddressForComparison
} = require('./easypost');

class ShippingWorkflowError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status || 500;
    this.code = code || 'shipping-workflow-error';
    this.details = details || null;
  }
}

function normalizeId(value) {
  const id = parseInt(value, 10);
  return Number.isInteger(id) ? id : null;
}

async function loadOrder(orderId, db) {
  const result = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!result.rows.length) {
    throw new ShippingWorkflowError(404, 'Order not found', 'order-not-found');
  }
  return result.rows[0];
}

async function loadShipmentByProviderId(db, orderId, providerShipmentId, forUpdate) {
  const sql = 'SELECT * FROM shipments WHERE order_id = $1 AND provider_shipment_id = $2' + (forUpdate ? ' FOR UPDATE' : '');
  const result = await db.query(sql, [orderId, providerShipmentId]);
  return result.rows[0] || null;
}

async function loadShipmentsForOrder(db, orderId) {
  const result = await db.query(
    'SELECT * FROM shipments WHERE order_id = $1 ORDER BY created_at DESC, id DESC',
    [orderId]
  );
  return result.rows.map(sanitizeShipmentRecord);
}

function buildOrderResponseShipment(shipmentRow) {
  if (!shipmentRow) return null;
  return sanitizeShipmentRecord(shipmentRow);
}

async function createRatesForOrder(options) {
  const db = options.pool || pool;
  const client = options.client || getEasyPostClient({ env: options.env });
  const orderId = normalizeId(options.orderId);
  if (!orderId) {
    throw new ShippingWorkflowError(400, 'Invalid order id', 'invalid-order-id');
  }

  const order = await loadOrder(orderId, db);
  if (String(order.status || '').toLowerCase() === 'cancelled') {
    throw new ShippingWorkflowError(409, 'Cancelled orders cannot be shipped', 'order-cancelled');
  }
  if (String(order.status || '').toLowerCase() === 'pending_payment') {
    throw new ShippingWorkflowError(409, 'Order must be paid before shipping rates can be retrieved', 'order-unpaid');
  }

  let packageInfo;
  let destination;
  try {
    packageInfo = validatePackageInput(options.package || options.body || options);
    destination = validateDestinationAddress(order);
  } catch (error) {
    if (error instanceof ShippingWorkflowError) {
      throw error;
    }
    throw new ShippingWorkflowError(error.status || 422, error.message || 'Invalid shipping input', error.code || 'invalid-shipping-input');
  }
  const shipFrom = getShipFromAddress(options.env);
  const originalAddress = formatAddressForComparison(destination);

  let verifiedAddress = null;
  let verification = null;
  try {
    verifiedAddress = await client.Address.createAndVerify({
      ...destination,
      verify_strict: true
    });
    verification = verifiedAddress && verifiedAddress.verifications ? verifiedAddress.verifications.delivery || null : null;
  } catch (error) {
    const message = error && error.message ? error.message : 'Address verification failed';
    throw new ShippingWorkflowError(422, message, 'address-verification-failed');
  }

  const suggestedAddress = formatAddressForComparison(verifiedAddress);
  const addressChanged = !addressesMatch(originalAddress, suggestedAddress);
  if (addressChanged && !options.confirmVerifiedAddress) {
    throw new ShippingWorkflowError(409, 'Address verification returned a suggested correction. Confirmation is required before rates can be retrieved.', 'address-verification-confirmation-required', {
      originalAddress,
      suggestedAddress,
      verification: verification && {
        success: !!verification.success,
        errors: verification.errors || [],
        details: verification.details || null
      }
    });
  }

  let shipment;
  try {
    shipment = await client.Shipment.create(buildShipmentCreateParams({
      toAddress: addressChanged ? verifiedAddress : destination,
      fromAddress: shipFrom,
      packageInfo
    }));
  } catch (error) {
    const message = error && error.message ? error.message : 'EasyPost shipment creation failed';
    throw new ShippingWorkflowError(502, message, 'easypost-shipment-create-failed');
  }

  const rates = Array.isArray(shipment.rates) ? shipment.rates.map(sanitizeRate).filter(Boolean) : [];
  if (!rates.length) {
    throw new ShippingWorkflowError(422, 'No shipping rates were returned for this shipment.', 'no-rates-returned');
  }
  rates.sort(function (left, right) {
    return Number(left.price) - Number(right.price);
  });

  const insertResult = await db.query(
    `INSERT INTO shipments (
      order_id,
      provider,
      provider_shipment_id,
      provider_tracker_id,
      shipment_status,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING *`,
    [
      orderId,
      'easypost',
      shipment.id,
      shipment.tracker && shipment.tracker.id ? shipment.tracker.id : null,
      'rated'
    ]
  );

  return {
    order: order,
    shipment: buildOrderResponseShipment(insertResult.rows[0]),
    addressVerification: {
      originalAddress,
      suggestedAddress,
      needsConfirmation: addressChanged,
      verification: verification && {
        success: !!verification.success,
        errors: verification.errors || [],
        details: verification.details || null
      }
    },
    rates: rates
  };
}

async function purchaseShipmentForOrder(options) {
  const db = options.pool || pool;
  const client = options.client || getEasyPostClient({ env: options.env });
  const orderId = normalizeId(options.orderId);
  const shipmentId = String(options.shipmentId || '').trim();
  const rateId = String(options.rateId || '').trim();

  if (!orderId) throw new ShippingWorkflowError(400, 'Invalid order id', 'invalid-order-id');
  if (!shipmentId) throw new ShippingWorkflowError(400, 'Shipment id is required', 'missing-shipment-id');
  if (!rateId) throw new ShippingWorkflowError(400, 'Rate id is required', 'missing-rate-id');

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const order = await loadOrder(orderId, conn);
    if (String(order.status || '').toLowerCase() === 'cancelled') {
      throw new ShippingWorkflowError(409, 'Cancelled orders cannot purchase labels', 'order-cancelled');
    }
    if (String(order.status || '').toLowerCase() === 'pending_payment') {
      throw new ShippingWorkflowError(409, 'Order must be paid before purchasing a label', 'order-unpaid');
    }

    const activeLabelResult = await conn.query(
      `SELECT id FROM shipments
        WHERE order_id = $1
          AND purchased_at IS NOT NULL
          AND is_voided = false
        LIMIT 1`,
      [orderId]
    );
    if (activeLabelResult.rows.length) {
      throw new ShippingWorkflowError(409, 'This order already has an active purchased label.', 'duplicate-purchase');
    }

    const shipmentRow = await loadShipmentByProviderId(conn, orderId, shipmentId, true);
    if (!shipmentRow) {
      throw new ShippingWorkflowError(404, 'Shipment not found for this order', 'shipment-not-found');
    }
    if (shipmentRow.purchased_at) {
      throw new ShippingWorkflowError(409, 'This shipment has already been purchased.', 'duplicate-purchase');
    }
    if (shipmentRow.is_voided) {
      throw new ShippingWorkflowError(409, 'This shipment has been voided.', 'shipment-voided');
    }

    let remoteShipment;
    try {
      remoteShipment = await client.Shipment.retrieve(shipmentId);
    } catch (error) {
      const message = error && error.message ? error.message : 'EasyPost shipment retrieval failed';
      throw new ShippingWorkflowError(502, message, 'easypost-shipment-retrieve-failed');
    }

    const selectedRate = Array.isArray(remoteShipment.rates)
      ? remoteShipment.rates.find(function (rate) { return String(rate.id || '') === rateId; })
      : null;
    if (!selectedRate) {
      throw new ShippingWorkflowError(400, 'The selected rate does not belong to this shipment.', 'invalid-rate');
    }

    let purchasedShipment;
    try {
      purchasedShipment = await client.Shipment.buy(shipmentId, rateId);
      if (!purchasedShipment.postage_label || !purchasedShipment.postage_label.label_pdf_url) {
        try {
          purchasedShipment = await client.Shipment.convertLabelFormat(shipmentId, 'PDF');
        } catch (conversionError) {
          purchasedShipment = purchasedShipment || remoteShipment;
        }
      }
    } catch (error) {
      const message = error && error.message ? error.message : 'EasyPost label purchase failed';
      throw new ShippingWorkflowError(502, message, 'easypost-purchase-failed');
    }

    const tracker = purchasedShipment.tracker || remoteShipment.tracker || null;
    const postageLabel = purchasedShipment.postage_label || remoteShipment.postage_label || {};
    const labelUrl = postageLabel.label_pdf_url || postageLabel.label_url || null;
    const labelFormat = postageLabel.label_pdf_url ? 'PDF' : (postageLabel.label_file_type || 'PDF');
    const purchasedAt = new Date().toISOString();
    const shipmentStatus = 'label_created';
    const trackingNumber = purchasedShipment.tracking_code || remoteShipment.tracking_code || (tracker && tracker.tracking_code) || null;
    const trackingUrl = tracker && tracker.public_url ? tracker.public_url : null;
    const carrier = selectedRate.carrier || null;
    const service = selectedRate.service || null;
    const labelCost = Number(selectedRate.rate || 0);
    const currency = selectedRate.currency || 'USD';

    const shipmentUpdate = await conn.query(
      `UPDATE shipments
          SET rate_id = $1,
              carrier = $2,
              service = $3,
              tracking_number = $4,
              tracking_url = $5,
              label_url = $6,
              label_format = $7,
              label_cost = $8,
              currency = $9,
              shipment_status = $10,
              provider_tracker_id = $11,
              purchased_at = $12,
              updated_at = CURRENT_TIMESTAMP,
              is_voided = false,
              voided_at = NULL
        WHERE id = $13
        RETURNING *`,
      [
        rateId,
        carrier,
        service,
        trackingNumber,
        trackingUrl,
        labelUrl,
        labelFormat,
        labelCost,
        currency,
        shipmentStatus,
        tracker && tracker.id ? tracker.id : shipmentRow.provider_tracker_id || null,
        purchasedAt,
        shipmentRow.id
      ]
    );

    const orderUpdate = await conn.query(
      `UPDATE orders
          SET tracking_number = $1,
              carrier = $2,
              shipping_label_url = $3,
              shipping_label_created_at = CURRENT_TIMESTAMP,
              status = CASE WHEN status = 'paid' THEN 'processing' ELSE status END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *`,
      [trackingNumber, carrier, labelUrl, orderId]
    );

    await conn.query('COMMIT');
    return {
      order: orderUpdate.rows[0],
      shipment: buildOrderResponseShipment(shipmentUpdate.rows[0]),
      label: {
        shipmentId,
        rateId,
        carrier,
        service,
        trackingNumber,
        trackingUrl,
        labelUrl,
        labelFormat,
        labelCost,
        currency,
        shipmentStatus,
        purchasedAt
      }
    };
  } catch (error) {
    await conn.query('ROLLBACK');
    if (error instanceof ShippingWorkflowError) {
      throw error;
    }
    throw error;
  } finally {
    conn.release();
  }
}

async function voidShipmentForOrder(options) {
  const db = options.pool || pool;
  const client = options.client || getEasyPostClient({ env: options.env });
  const orderId = normalizeId(options.orderId);
  const shipmentId = String(options.shipmentId || '').trim();

  if (!orderId) throw new ShippingWorkflowError(400, 'Invalid order id', 'invalid-order-id');
  if (!shipmentId) throw new ShippingWorkflowError(400, 'Shipment id is required', 'missing-shipment-id');

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const order = await loadOrder(orderId, conn);
    const shipmentRow = await loadShipmentByProviderId(conn, orderId, shipmentId, true);
    if (!shipmentRow) {
      throw new ShippingWorkflowError(404, 'Shipment not found for this order', 'shipment-not-found');
    }
    if (!shipmentRow.purchased_at) {
      throw new ShippingWorkflowError(409, 'This label has not been purchased yet.', 'label-not-purchased');
    }
    if (shipmentRow.is_voided) {
      throw new ShippingWorkflowError(409, 'This label has already been voided.', 'label-already-voided');
    }

    let refundedShipment;
    try {
      refundedShipment = await client.Shipment.refund(shipmentId);
    } catch (error) {
      const message = error && error.message ? error.message : 'EasyPost void request failed';
      throw new ShippingWorkflowError(422, message, 'easypost-void-failed');
    }

    const refundStatus = String(refundedShipment.refund_status || '').toLowerCase();
    if (refundStatus === 'rejected') {
      throw new ShippingWorkflowError(422, 'This label is not eligible to be voided or refunded.', 'label-not-eligible');
    }

    const shipmentUpdate = await conn.query(
      `UPDATE shipments
          SET shipment_status = $1,
              is_voided = true,
              voided_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *`,
      ['voided', shipmentRow.id]
    );

    await conn.query(
      `UPDATE orders
          SET tracking_number = NULL,
              carrier = NULL,
              shipping_label_url = NULL,
              shipping_label_created_at = NULL,
              status = CASE WHEN status = 'shipped' THEN 'processing' ELSE status END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [orderId]
    );

    await conn.query('COMMIT');
    return {
      order,
      shipment: buildOrderResponseShipment(shipmentUpdate.rows[0]),
      refund: {
        shipmentId,
        refundStatus
      }
    };
  } catch (error) {
    await conn.query('ROLLBACK');
    if (error instanceof ShippingWorkflowError) {
      throw error;
    }
    throw error;
  } finally {
    conn.release();
  }
}

async function handleEasyPostWebhook(options) {
  const db = options.pool || pool;
  const payload = options.payload || {};
  const eventId = String(payload.id || payload.event_id || '').trim();
  const eventType = String(payload.description || payload.type || '').trim();
  const result = payload.result || null;
  const tracker = result && String(result.object || '').toLowerCase() === 'tracker' ? result : null;
  if (!eventId) {
    throw new ShippingWorkflowError(400, 'Webhook event id is missing', 'missing-event-id');
  }

  const trackerStatus = sanitizeTrackerStatus(tracker && tracker.status);
  const trackerId = tracker && tracker.id ? String(tracker.id) : null;
  const shipmentId = tracker && tracker.shipment_id ? String(tracker.shipment_id) : null;
  const trackingNumber = tracker && tracker.tracking_code ? String(tracker.tracking_code) : null;

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const inserted = await conn.query(
      `INSERT INTO shipment_webhook_events (event_id, provider, event_type, tracker_status, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING id`,
      [eventId, 'easypost', eventType, trackerStatus]
    );

    if (!inserted.rows.length) {
      await conn.query('COMMIT');
      return { duplicate: true };
    }

    let shipmentRow = null;
    if (trackerId) {
      const byTracker = await conn.query(
        'SELECT * FROM shipments WHERE provider_tracker_id = $1 LIMIT 1 FOR UPDATE',
        [trackerId]
      );
      shipmentRow = byTracker.rows[0] || null;
    }
    if (!shipmentRow && shipmentId) {
      const byShipment = await conn.query(
        'SELECT * FROM shipments WHERE provider_shipment_id = $1 LIMIT 1 FOR UPDATE',
        [shipmentId]
      );
      shipmentRow = byShipment.rows[0] || null;
    }
    if (!shipmentRow && trackingNumber) {
      const byTracking = await conn.query(
        'SELECT * FROM shipments WHERE tracking_number = $1 LIMIT 1 FOR UPDATE',
        [trackingNumber]
      );
      shipmentRow = byTracking.rows[0] || null;
    }

    if (!shipmentRow) {
      await conn.query('COMMIT');
      return { ignored: true };
    }

    const orderResult = await conn.query('SELECT status FROM orders WHERE id = $1 LIMIT 1', [shipmentRow.order_id]);
    const orderStatus = String(orderResult.rows[0] && orderResult.rows[0].status || '').toLowerCase();

    const nextShipmentStatus = trackerStatus === 'delivered' ? 'delivered' : trackerStatus;

    await conn.query(
      `UPDATE shipments
          SET provider_tracker_id = COALESCE($1, provider_tracker_id),
              tracking_number = COALESCE($2, tracking_number),
              shipment_status = $3,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $4`,
      [trackerId, trackingNumber, nextShipmentStatus, shipmentRow.id]
    );

    if (['paid', 'processing', 'shipped'].indexOf(orderStatus) === -1) {
      await conn.query('COMMIT');
      return { updated: true, shipmentStatus: nextShipmentStatus };
    }

    if (trackerStatus === 'delivered') {
      await conn.query(
        `UPDATE orders
            SET status = CASE WHEN status IN ('paid','processing','shipped') THEN 'completed' ELSE status END,
                shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP),
                tracking_number = COALESCE($1, tracking_number),
                carrier = COALESCE($2, carrier),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $3`,
        [trackingNumber, tracker && tracker.carrier ? tracker.carrier : null, shipmentRow.order_id]
      );
    } else if (['pre_transit', 'in_transit', 'out_for_delivery', 'available_for_pickup', 'return_to_sender', 'failure', 'cancelled'].indexOf(trackerStatus) !== -1) {
      await conn.query(
        `UPDATE orders
            SET status = CASE WHEN status IN ('paid','processing') THEN 'shipped' ELSE status END,
                shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP),
                tracking_number = COALESCE($1, tracking_number),
                carrier = COALESCE($2, carrier),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $3`,
        [trackingNumber, tracker && tracker.carrier ? tracker.carrier : null, shipmentRow.order_id]
      );
    }

    await conn.query('COMMIT');
    return { updated: true, shipmentStatus: nextShipmentStatus };
  } catch (error) {
    await conn.query('ROLLBACK');
    if (error instanceof ShippingWorkflowError) {
      throw error;
    }
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  ShippingWorkflowError,
  createRatesForOrder,
  purchaseShipmentForOrder,
  voidShipmentForOrder,
  handleEasyPostWebhook,
  loadShipmentsForOrder,
  buildOrderResponseShipment
};