'use strict';

const express = require('express');
const pool = require('../db/connection');
const {
  ShippingWorkflowError,
  createRatesForOrder,
  purchaseShipmentForOrder,
  voidShipmentForOrder,
  loadShipmentsForOrder
} = require('../services/shipping-workflow');
const {
  sendPaymentConfirmationForOrder,
  sendShippingConfirmationForOrder
} = require('../services/transactional-email');
const { PAID_ORDER_SQL } = require('../services/admin-customers');

// Allowed order statuses (kept in one place, reused by validation).
const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'completed',
  'cancelled'
];

const ORDER_LIST_SORT_FIELDS = {
  created_at: 'o.created_at',
  total: 'o.total',
  order_number: 'o.order_number',
  status: 'o.status'
};

// node-postgres checks out a SEPARATE pool client for every concurrent
// pool.query(). An unbounded Promise.all over N queries therefore needs N
// clients at once. The pool is capped (see `max` in db/connection.js), and the
// session store needs a client for essentially every request on the site, so a
// single wide fan-out here can starve unrelated traffic. Keep the admin
// dashboard's fan-out well under the pool size.
const SUMMARY_QUERY_CONCURRENCY = 3;

// Runs `thunks` with at most `limit` in flight, preserving result order.
// Rejections are captured (never left unhandled) and the first one is rethrown.
async function runBounded(thunks, limit) {
  const results = new Array(thunks.length);
  let next = 0;
  let failure = null;

  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= thunks.length) return;
      try {
        results[index] = await thunks[index]();
      } catch (err) {
        if (!failure) failure = err;
        return;
      }
    }
  }

  const size = Math.max(1, Math.min(limit, thunks.length));
  await Promise.all(Array.from({ length: size }, worker));
  if (failure) throw failure;
  return results;
}

function money(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function buildOrderWhereSql(query) {
  const params = [];
  const where = [];

  const status = (query.status || '').trim();
  if (status && ORDER_STATUSES.indexOf(status) !== -1) {
    params.push(status);
    where.push('o.status = $' + params.length);
  }

  const view = String(query.view || '').trim().toLowerCase();
  if (view === 'unfulfilled') {
    where.push("(o.shipped_at IS NULL AND o.status IN ('paid','processing'))");
  } else if (view === 'ready_to_ship') {
    where.push("(o.shipped_at IS NULL AND o.status = 'processing')");
  } else if (view === 'fulfilled') {
    where.push("(o.shipped_at IS NOT NULL OR o.status IN ('shipped','completed'))");
  } else if (view === 'shipped') {
    where.push("(o.shipped_at IS NOT NULL OR o.status = 'shipped')");
  } else if (view === 'delivered') {
    where.push("o.status = 'completed'");
  } else if (view === 'pending_payment') {
    where.push("o.status = 'pending_payment'");
  } else if (view === 'paid') {
    // Same definition the dashboard's Paid-orders count uses, so the card and
    // its drill-down can never disagree. Payment lives in payment_status /
    // paid_at; `status` has already moved on to processing/shipped/completed.
    where.push(PAID_ORDER_SQL);
  } else if (view === 'canceled') {
    where.push("o.status = 'cancelled'");
  } else if (view === 'refunded') {
    where.push('1 = 0');
  } else if (view === 'missing_tracking') {
    where.push("(COALESCE(TRIM(o.tracking_number), '') = '' AND (o.shipped_at IS NOT NULL OR o.status IN ('shipped','completed')))");
  } else if (view === 'label_not_purchased') {
    where.push("(COALESCE(TRIM(o.shipping_label_url), '') = '' AND o.status IN ('paid','processing'))");
  }

  const search = (query.search || '').trim();
  if (search) {
    params.push('%' + search + '%');
    const p = '$' + params.length;
    where.push('(o.order_number ILIKE ' + p +
      ' OR o.shipping_name ILIKE ' + p +
      ' OR o.shipping_email ILIKE ' + p +
      ' OR o.tracking_number ILIKE ' + p + ')');
  }

  const startDate = parseDate(query.start_date || query.startDate);
  if (startDate) {
    params.push(startDate.toISOString());
    where.push('o.created_at >= $' + params.length);
  }

  const endDate = parseDate(query.end_date || query.endDate);
  if (endDate) {
    params.push(endDate.toISOString());
    where.push('o.created_at <= $' + params.length);
  }

  return {
    params,
    whereSql: where.length ? ('WHERE ' + where.join(' AND ')) : ''
  };
}

/**
 * Factory. Takes the app's existing requireAuth middleware so we reuse
 * the exact same session/authentication logic (no duplicate auth).
 */
function createAdminRouter(requireAuth, deps) {
  deps = deps || {};
  const router = express.Router();
  const db = deps.pool || pool;
  const shippingClient = deps.client || null;

  // Customer emails are fired from this router, each one after the state it
  // announces is already durable. Injectable so tests never reach the network.
  const notifyPaymentConfirmed = deps.notifyPaymentConfirmed ||
    ((orderId) => sendPaymentConfirmationForOrder(orderId, { pool: db }));
  const notifyOrderShipped = deps.notifyOrderShipped ||
    ((orderId) => sendShippingConfirmationForOrder(orderId, { pool: db }));

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

  // Every admin route is gated by requireAuth THEN requireAdmin.
  const gate = [requireAuth, requireAdmin];

  router.get('/summary', gate, async (req, res) => {
    try {
      const [
        statusCountsRes,
        requiringFulfillmentRes,
        missingTrackingRes,
        labelIssuesRes,
        paidOrdersRes,
        sales30Res,
        recentOrdersRes,
        lowStockRes,
        outOfStockRes,
        customersRes
      ] = await runBounded([
        () => db.query(
          `SELECT status, COUNT(*)::int AS count
             FROM orders
            GROUP BY status`
        ),
        () => db.query(
          `SELECT COUNT(*)::int AS count
             FROM orders
            WHERE status IN ('paid','processing')
              AND shipped_at IS NULL`
        ),
        () => db.query(
          `SELECT COUNT(*)::int AS count
             FROM orders
            WHERE COALESCE(TRIM(tracking_number), '') = ''
              AND (shipped_at IS NOT NULL OR status IN ('shipped','completed'))`
        ),
        () => db.query(
          `SELECT COUNT(*)::int AS count
             FROM orders
            WHERE COALESCE(TRIM(shipping_label_url), '') = ''
              AND status IN ('paid','processing')`
        ),
        // Payment state is tracked separately from fulfillment state.
        // Confirming payment sets payment_status='paid' and moves `status`
        // straight to 'processing', so counting status='paid' reports zero.
        // PAID_ORDER_SQL is the admin-wide definition of a paid order (also
        // used for customer lifetime spend): payment_status='paid', or a
        // legacy row with no payment_status that is past pending_payment --
        // cancelled and refunded excluded in both cases.
        () => db.query(
          `SELECT COUNT(*)::int AS count
             FROM orders o
            WHERE ${PAID_ORDER_SQL}`
        ),
        () => db.query(
          `SELECT COUNT(*)::int AS order_count,
                  COALESCE(SUM(total), 0) AS sales_total,
                  COALESCE(AVG(total), 0) AS avg_order_value
             FROM orders
            WHERE created_at >= NOW() - INTERVAL '30 days'`
        ),
        () => db.query(
          `SELECT id, order_number, status, total, created_at, shipping_name, shipping_email, tracking_number, carrier
             FROM orders
            ORDER BY created_at DESC
            LIMIT 8`
        ),
        () => db.query(
          `SELECT pv.id, pv.product_id, pv.name, pv.stock_quantity, p.name AS product_name
             FROM product_variants pv
             JOIN products p ON p.id = pv.product_id
            WHERE pv.active = true
              AND pv.stock_quantity > 0
              AND pv.stock_quantity <= 5
            ORDER BY pv.stock_quantity ASC, pv.updated_at DESC
            LIMIT 8`
        ),
        () => db.query(
          `SELECT pv.id, pv.product_id, pv.name, pv.stock_quantity, p.name AS product_name
             FROM product_variants pv
             JOIN products p ON p.id = pv.product_id
            WHERE pv.active = true
              AND pv.stock_quantity <= 0
            ORDER BY pv.updated_at DESC
            LIMIT 8`
        ),
        () => db.query(
          `SELECT id, name, email, created_at
             FROM users
            WHERE COALESCE(role, 'customer') <> 'admin'
            ORDER BY created_at DESC
            LIMIT 8`
        )
      ], SUMMARY_QUERY_CONCURRENCY);

      let promoSummary = {
        redemptions_30d: 0,
        discount_total_30d: 0
      };
      try {
        const promoRes = await db.query(
          `SELECT COUNT(*)::int AS redemptions_30d,
                  COALESCE(SUM(discount_amount), 0) AS discount_total_30d
             FROM promo_code_redemptions
            WHERE redeemed_at >= NOW() - INTERVAL '30 days'`
        );
        promoSummary = {
          redemptions_30d: Number(promoRes.rows[0].redemptions_30d || 0),
          discount_total_30d: Number(promoRes.rows[0].discount_total_30d || 0)
        };
      } catch (err) {
        promoSummary = {
          redemptions_30d: 0,
          discount_total_30d: 0
        };
      }

      const statusCounts = Object.create(null);
      statusCountsRes.rows.forEach((row) => {
        statusCounts[String(row.status || '')] = Number(row.count || 0);
      });

      return res.json({
        counts: {
          pending_payment: Number(statusCounts.pending_payment || 0),
          paid: Number(paidOrdersRes.rows[0].count || 0),
          processing: Number(statusCounts.processing || 0),
          shipped: Number(statusCounts.shipped || 0),
          completed: Number(statusCounts.completed || 0),
          cancelled: Number(statusCounts.cancelled || 0),
          requiring_fulfillment: Number(requiringFulfillmentRes.rows[0].count || 0),
          missing_tracking: Number(missingTrackingRes.rows[0].count || 0),
          label_not_purchased: Number(labelIssuesRes.rows[0].count || 0)
        },
        sales: {
          order_count_30d: Number(sales30Res.rows[0].order_count || 0),
          sales_total_30d: Number(sales30Res.rows[0].sales_total || 0),
          average_order_value_30d: Number(sales30Res.rows[0].avg_order_value || 0)
        },
        discounts: promoSummary,
        recent_orders: recentOrdersRes.rows,
        recent_customers: customersRes.rows,
        low_stock_variants: lowStockRes.rows,
        out_of_stock_variants: outOfStockRes.rows
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to load admin summary' });
    }
  });

  // --- GET /api/admin/orders ---------------------------------------
  // list all orders, with optional ?search= and ?status= filters
  router.get('/orders', gate, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size || req.query.pageSize, 10) || 25));
      const sortByInput = String(req.query.sort_by || req.query.sortBy || 'created_at').trim();
      const sortBySql = ORDER_LIST_SORT_FIELDS[sortByInput] || ORDER_LIST_SORT_FIELDS.created_at;
      const sortDir = String(req.query.sort_dir || req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      const offset = (page - 1) * pageSize;

      const whereBuilt = buildOrderWhereSql(req.query || {});
      const whereSql = whereBuilt.whereSql;
      const params = whereBuilt.params.slice();

      const countSql = 'SELECT COUNT(*)::int AS total_count FROM orders o ' + whereSql;
      const countRes = await db.query(countSql, params);
      const totalCount = Number((countRes.rows[0] && countRes.rows[0].total_count) || 0);

      params.push(pageSize);
      const limitParam = '$' + params.length;
      params.push(offset);
      const offsetParam = '$' + params.length;

      const sql =
        'SELECT o.id, o.order_number, o.status, o.total, o.created_at, ' +
        'o.shipping_name, o.shipping_email, o.tracking_number, o.carrier, ' +
        'o.shipping_label_url, o.shipped_at, o.shipping_service, ' +
        '(SELECT COALESCE(SUM(oi.quantity), 0)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count, ' +
        "COALESCE(o.payment_status, CASE WHEN o.status = 'pending_payment' THEN 'awaiting_payment' ELSE 'paid' END) AS payment_status, " +
        "CASE WHEN o.status = 'completed' THEN 'delivered' " +
        "WHEN o.shipped_at IS NOT NULL THEN 'shipped' " +
        "WHEN o.shipping_label_url IS NOT NULL THEN 'label_created' " +
        "ELSE 'unfulfilled' END AS fulfillment_status, " +
        "CASE WHEN COALESCE(TRIM(o.tracking_number), '') = '' THEN 'missing' ELSE 'available' END AS tracking_status " +
        'FROM orders o ' + whereSql +
        ' ORDER BY ' + sortBySql + ' ' + sortDir + ', o.id DESC ' +
        'LIMIT ' + limitParam + ' OFFSET ' + offsetParam;
      const result = await db.query(sql, params);
      res.json({
        orders: result.rows,
        statuses: ORDER_STATUSES,
        pagination: {
          page,
          page_size: pageSize,
          total_count: totalCount,
          total_pages: Math.max(1, Math.ceil(totalCount / pageSize))
        }
      });
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
      const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      if (orderRes.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      const order = orderRes.rows[0];
      const itemsRes = await db.query(
        "SELECT id, product_id, variant_id, name, variant_name, variant_price, price, quantity " +
        'FROM order_items WHERE order_id = $1 ORDER BY id ASC',
        [orderId]
      );
      const customerStatsRes = await db.query(
        `SELECT COUNT(*)::int AS order_count,
                COALESCE(SUM(total), 0) AS total_spend,
                MAX(created_at) AS last_order_at
           FROM orders
          WHERE shipping_email = $1`,
        [order.shipping_email || null]
      );
      const customer = {
        name: order.shipping_name,
        email: order.shipping_email,
        phone: order.shipping_phone || null,
        order_count: Number(customerStatsRes.rows[0] && customerStatsRes.rows[0].order_count || 0),
        total_spend: Number(customerStatsRes.rows[0] && customerStatsRes.rows[0].total_spend || 0),
        last_order_at: customerStatsRes.rows[0] ? customerStatsRes.rows[0].last_order_at : null
      };
      const shippingAddress = {
        name: order.shipping_name,
        address: order.shipping_address,
        city: order.shipping_city,
        state: order.shipping_state,
        zip: order.shipping_zip,
        country: order.shipping_country || null,
        phone: order.shipping_phone || null,
        email: order.shipping_email
      };
      const shipmentRows = await loadShipmentsForOrder(pool, orderId);
      const latestShipment = shipmentRows.length ? shipmentRows[0] : null;
      const timeline = [];
      timeline.push({ type: 'order_placed', at: order.created_at, label: 'Order placed' });
      if (latestShipment && latestShipment.purchasedAt) {
        timeline.push({ type: 'label_purchased', at: latestShipment.purchasedAt, label: 'Shipping label purchased' });
      } else if (order.shipping_label_created_at) {
        timeline.push({ type: 'label_purchased', at: order.shipping_label_created_at, label: 'Shipping label purchased' });
      }
      if ((latestShipment && latestShipment.trackingNumber) || order.tracking_number) {
        timeline.push({ type: 'tracking_added', at: latestShipment && latestShipment.updatedAt || order.updated_at || order.shipping_label_created_at || order.created_at, label: 'Tracking added' });
      }
      if (order.shipped_at) {
        timeline.push({ type: 'shipped', at: order.shipped_at, label: 'Order marked shipped' });
      }
      timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

      res.json({
        order: order,
        customer: customer,
        shipping_address: shippingAddress,
        items: itemsRes.rows,
        shipments: shipmentRows,
        totals: {
          subtotal: order.subtotal,
          subtotal_before_discount: order.subtotal_before_discount,
          discount_amount: order.discount_amount,
          promo_code: order.promo_code,
          shipping_cost: order.shipping_cost,
          total: order.total
        },
        status: order.status,
        payment_method: order.payment_method || null,
        payment_status: order.payment_status || (order.status === 'pending_payment' ? 'awaiting_payment' : 'paid'),
        paid_at: order.paid_at || null,
      emails: {
        payment_confirmation_sent_at: order.payment_confirmation_sent_at || null,
        shipping_confirmation_sent_at: order.shipping_confirmation_sent_at || null
      },
        tracking: {
          tracking_number: latestShipment && latestShipment.trackingNumber || order.tracking_number,
          carrier: latestShipment && latestShipment.carrier || order.carrier,
          shipping_label_url: latestShipment && latestShipment.labelUrl || order.shipping_label_url,
          shipping_label_created_at: latestShipment && latestShipment.purchasedAt || order.shipping_label_created_at,
          shipped_at: order.shipped_at
        },
        fulfillment_status: order.status === 'completed'
          ? 'delivered'
          : (order.shipped_at ? 'shipped' : ((latestShipment && latestShipment.labelUrl) || order.shipping_label_url ? 'label_created' : 'unfulfilled')),
        customer_status: {
          label: order.status === 'completed' ? 'Delivered' : (order.status === 'cancelled' ? 'Canceled' : 'In progress')
        },
        timeline
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
      const result = await db.query(sql, [status, orderId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  router.get('/orders/:id/shipments', gate, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }
      const shipments = await loadShipmentsForOrder(db, orderId);
      return res.json({ shipments: shipments });
    } catch (error) {
      if (error instanceof ShippingWorkflowError) {
        return res.status(error.status || 500).json({ error: error.message });
      }
      console.error(error);
      res.status(500).json({ error: 'Failed to load shipments' });
    }
  });

  router.post('/orders/:id/shipping/rates', gate, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }
      const result = await createRatesForOrder({
        pool: db,
        client: shippingClient,
        orderId: orderId,
        body: req.body || {},
        package: req.body || {},
        confirmVerifiedAddress: !!(req.body && (req.body.confirmVerifiedAddress || req.body.confirm_verified_address)),
        env: process.env
      });
      return res.json(result);
    } catch (error) {
      if (error instanceof ShippingWorkflowError) {
        return res.status(error.status || 500).json({ error: error.message, code: error.code, details: error.details || undefined });
      }
      console.error(error);
      res.status(500).json({ error: 'Failed to retrieve shipping rates' });
    }
  });

  router.post('/orders/:id/shipping/purchase', gate, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }
      const result = await purchaseShipmentForOrder({
        pool: db,
        client: shippingClient,
        orderId: orderId,
        shipmentId: req.body && (req.body.shipmentId || req.body.shipment_id),
        rateId: req.body && (req.body.rateId || req.body.rate_id),
        env: process.env
      });
      // The label is bought and the shipment row is saved, so carrier and
      // tracking number now exist. Announce it; delivery is best-effort and
      // must never fail the purchase.
      const purchased = (result && result.label) || {};
      console.log('[shipping-email-debug] label purchased', {
        orderId,
        hasTracking: Boolean(purchased.trackingNumber),
        hasCarrier: Boolean(purchased.carrier)
      });
      console.log('[email-config-debug]', {
        resendKeyPresent: Boolean(process.env.RESEND_API_KEY),
        fromEmailPresent: Boolean(process.env.ORDER_FROM_EMAIL),
        siteUrlPresent: Boolean(process.env.SITE_URL)
      });

      try {
        console.log('[shipping-email-debug] notifier called', { orderId });
        const shippingEmail = await notifyOrderShipped(orderId);
        console.log('[shipping-email-debug] notifier result', {
          orderId,
          sent: Boolean(shippingEmail && shippingEmail.sent),
          reason: (shippingEmail && shippingEmail.reason) || 'sent'
        });
      } catch (emailError) {
        console.error('Shipping confirmation email failed:', emailError);
      }

      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof ShippingWorkflowError) {
        return res.status(error.status || 500).json({ error: error.message, code: error.code, details: error.details || undefined });
      }
      console.error(error);
      res.status(500).json({ error: 'Failed to purchase shipping label' });
    }
  });

  router.post('/orders/:id/shipping/void', gate, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }
      const result = await voidShipmentForOrder({
        pool: db,
        client: shippingClient,
        orderId: orderId,
        shipmentId: req.body && (req.body.shipmentId || req.body.shipment_id),
        env: process.env
      });
      return res.json(result);
    } catch (error) {
      if (error instanceof ShippingWorkflowError) {
        return res.status(error.status || 500).json({ error: error.message, code: error.code, details: error.details || undefined });
      }
      console.error(error);
      res.status(500).json({ error: 'Failed to void shipping label' });
    }
  });

  router.post('/orders/:id/confirm-zelle-payment', gate, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }
      const orderRes = await db.query('SELECT id, payment_method, payment_status, status FROM orders WHERE id = $1', [orderId]);
      if (!orderRes.rows.length) {
        return res.status(404).json({ error: 'Order not found' });
      }
      const order = orderRes.rows[0];
      if (order.payment_method !== 'zelle') {
        return res.status(400).json({ error: 'Order is not a Zelle order' });
      }
      if (order.payment_status === 'paid') {
        return res.status(409).json({ error: 'Zelle payment already confirmed' });
      }
      const result = await db.query(
        `UPDATE orders
            SET payment_status = 'paid',
                paid_at = CURRENT_TIMESTAMP,
                zelle_confirmed_by = $1,
                status = 'processing',
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING id, order_number, payment_status, paid_at, status`,
        [req.adminUserId, orderId]
      );
      // Payment state is durable at this point. Announce it; delivery is
      // best-effort and must never fail the confirmation.
      const updatedOrder = result.rows[0] || {};
      console.log('[payment-email-debug] payment updated', {
        orderId,
        paymentStatus: updatedOrder.payment_status,
        paidAtPresent: Boolean(updatedOrder.paid_at)
      });
      console.log('[email-config-debug]', {
        resendKeyPresent: Boolean(process.env.RESEND_API_KEY),
        fromEmailPresent: Boolean(process.env.ORDER_FROM_EMAIL),
        siteUrlPresent: Boolean(process.env.SITE_URL)
      });

      try {
        console.log('[payment-email-debug] notifier called', { orderId });
        const paymentEmail = await notifyPaymentConfirmed(orderId);
        console.log('[payment-email-debug] notifier result', {
          orderId,
          sent: Boolean(paymentEmail && paymentEmail.sent),
          reason: (paymentEmail && paymentEmail.reason) || 'sent'
        });
      } catch (emailError) {
        console.error('Payment confirmation email failed:', emailError);
      }

      return res.json(result.rows[0]);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to confirm Zelle payment' });
    }
  });

  // Send a transactional email for an order that already reached the state it
  // announces, but never received it - e.g. the state changed while an older
  // build was serving the request. The service keeps every guarantee: it will
  // not send unless the database says the order is paid / has tracking, and the
  // send-claim still makes it at-most-once, so this cannot duplicate a receipt.
  router.post('/orders/:id/send-email', gate, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }
      const kind = String((req.body && req.body.kind) || '').trim().toLowerCase();
      if (kind !== 'payment' && kind !== 'shipping') {
        return res.status(400).json({ error: "kind must be 'payment' or 'shipping'" });
      }

      const outcome = kind === 'payment'
        ? await notifyPaymentConfirmed(orderId)
        : await notifyOrderShipped(orderId);

      console.log('[admin-email-debug] manual send', {
        orderId,
        kind,
        sent: Boolean(outcome && outcome.sent),
        reason: (outcome && outcome.reason) || 'sent'
      });

      return res.json({
        order_id: orderId,
        kind,
        sent: Boolean(outcome && outcome.sent),
        reason: (outcome && outcome.reason) || 'sent'
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to send order email' });
    }
  });

  return router;
}

module.exports = createAdminRouter;
module.exports.ORDER_STATUSES = ORDER_STATUSES;
