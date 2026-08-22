'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const createAdminRouter = require('../../routes/admin');
const {
  buildPaymentConfirmationEmail,
  buildShippingConfirmationEmail,
  buildTrackingUrl,
  isPaymentConfirmed,
  SUPPORT_EMAIL
} = require('../../services/email');
const {
  sendPaymentConfirmationForOrder,
  sendShippingConfirmationForOrder
} = require('../../services/transactional-email');

// A deliberately fake key. Nothing in this file may ever reach the network.
const TEST_ENV = {
  RESEND_API_KEY: 're_test_key_must_never_be_rendered',
  ORDER_FROM_EMAIL: 'PepX Research <orders@pepxresearch.com>',
  SITE_URL: 'https://pepxresearch.com'
};

const REPO = path.join(__dirname, '..', '..');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseOrder(overrides) {
  return Object.assign(
    {
      id: 42,
      order_number: 'PX100042',
      user_id: 'user-1',
      status: 'pending_payment',
      created_at: '2026-08-20T15:04:05.000Z',
      subtotal: '240.00',
      discount_amount: '0',
      promo_code: null,
      shipping_cost: '12.35',
      total: '252.35',
      shipping_name: 'Dana Reyes',
      shipping_email: 'dana@lab.example',
      shipping_address: '11 Douglas Ave Suite 253',
      shipping_city: 'Elgin',
      shipping_state: 'IL',
      shipping_zip: '60120',
      shipping_country: 'United States',
      payment_method: 'zelle',
      payment_status: 'awaiting_payment',
      paid_at: null,
      tracking_number: null,
      carrier: null,
      customer_name: 'Dana Reyes',
      customer_email: 'account@lab.example'
    },
    overrides || {}
  );
}

function paidOrder(overrides) {
  return baseOrder(Object.assign({
    status: 'processing',
    payment_status: 'paid',
    paid_at: '2026-08-21T10:00:00.000Z'
  }, overrides || {}));
}

function orderItems() {
  return [
    { name: 'GLP-2TZ', variant_name: '10 mg', price: '110.00', quantity: 2 },
    { name: 'GHK-CU', variant_name: null, price: '20.00', quantity: 1 }
  ];
}

function uspsShipment(overrides) {
  return Object.assign({
    carrier: 'USPS',
    service: 'Ground Advantage',
    tracking_number: '9400111899223197428490',
    tracking_url: 'https://track.easypost.com/djE6dHJrX2FiYzEyMw',
    shipment_status: 'label_created',
    purchased_at: '2026-08-22T12:00:00.000Z'
  }, overrides || {});
}

function createMockResend(behavior) {
  const sent = [];
  return {
    sent,
    emails: {
      async send(message) {
        sent.push(message);
        if (behavior === 'throw') {
          throw new Error('Resend network failure with secret ' + TEST_ENV.RESEND_API_KEY);
        }
        if (behavior === 'error') {
          return { data: null, error: { message: 'The domain is not verified' } };
        }
        return { data: { id: 'resend-message-1' }, error: null };
      }
    }
  };
}

function createMockPool(seed) {
  const state = {
    order: clone((seed && seed.order) || baseOrder()),
    items: clone((seed && seed.items) || orderItems()),
    shipment: (seed && seed.shipment) ? clone(seed.shipment) : null,
    paymentSentAt: (seed && seed.paymentSentAt) || null,
    shippingSentAt: (seed && seed.shippingSentAt) || null,
    queries: []
  };

  return {
    state,
    async query(sql, params) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      state.queries.push({ sql: normalized, params: clone(params || []) });

      if (normalized.startsWith('SELECT o.*')) {
        return { rows: state.order ? [clone(state.order)] : [] };
      }
      if (normalized.startsWith('SELECT name, variant_name')) {
        return { rows: clone(state.items) };
      }
      if (normalized.startsWith('SELECT carrier, service, tracking_number')) {
        return { rows: state.shipment ? [clone(state.shipment)] : [] };
      }
      if (normalized.startsWith('UPDATE orders SET payment_confirmation_sent_at = NOW()')) {
        if (state.paymentSentAt) return { rows: [] };
        state.paymentSentAt = '2026-08-22T12:00:01.000Z';
        return { rows: [{ id: state.order.id }] };
      }
      if (normalized.startsWith('UPDATE orders SET shipping_confirmation_sent_at = NOW()')) {
        if (state.shippingSentAt) return { rows: [] };
        state.shippingSentAt = '2026-08-22T12:00:01.000Z';
        return { rows: [{ id: state.order.id }] };
      }
      if (normalized.startsWith('UPDATE orders SET payment_confirmation_sent_at = NULL')) {
        state.paymentSentAt = null;
        return { rows: [] };
      }
      if (normalized.startsWith('UPDATE orders SET shipping_confirmation_sent_at = NULL')) {
        state.shippingSentAt = null;
        return { rows: [] };
      }
      throw new Error('Unexpected query in test: ' + normalized);
    }
  };
}

function silentLogger() {
  const errors = [];
  return { errors, error(...args) { errors.push(args); }, log() {} };
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(REPO, relativePath), 'utf8');
}

// --- no email at order creation ----------------------------------------

test('order creation no longer sends any customer email', () => {
  const source = readSource('routes/orders.js');
  assert.ok(!/sendOrderConfirmationForOrder/.test(source), 'old receipt trigger still present');
  assert.ok(!/services\/order-confirmation/.test(source), 'old orchestration service still required');
  assert.ok(!/services\/transactional-email/.test(source), 'order creation must not send email');
  assert.ok(!/sendPaymentConfirmationForOrder|sendShippingConfirmationForOrder/.test(source));
  // The order itself must still be created and returned.
  assert.match(source, /await client\.query\("COMMIT"\)/);
  assert.match(source, /res\.status\(201\)\.json\(\{/);
});

test('the retired order-confirmation service is gone and nothing imports it', () => {
  assert.equal(fs.existsSync(path.join(REPO, 'services', 'order-confirmation.js')), false);
  for (const file of ['routes/orders.js', 'routes/admin.js', 'server.js']) {
    assert.ok(!/order-confirmation/.test(readSource(file)), file + ' still references it');
  }
});

// --- email 1: payment confirmed ----------------------------------------

test('an unpaid order can never trigger the payment email', async () => {
  const statuses = [null, '', 'awaiting_payment', 'pending', 'failed', 'refunded'];
  for (const status of statuses) {
    const pool = createMockPool({ order: baseOrder({ payment_status: status, paid_at: null }) });
    const resend = createMockResend();
    const result = await sendPaymentConfirmationForOrder(42, {
      pool, resend, env: TEST_ENV, logger: silentLogger()
    });
    assert.equal(result.sent, false, 'sent for status: ' + String(status));
    assert.equal(result.reason, 'payment_not_confirmed');
    assert.equal(resend.sent.length, 0);
    assert.equal(pool.state.paymentSentAt, null, 'an unpaid order must not be claimed');
  }
});

test('the payment email sends once the database says the order is paid', async () => {
  const pool = createMockPool({ order: paidOrder() });
  const resend = createMockResend();
  const result = await sendPaymentConfirmationForOrder(42, {
    pool, resend, env: TEST_ENV, logger: silentLogger()
  });

  assert.equal(result.sent, true);
  assert.equal(resend.sent.length, 1);
  const message = resend.sent[0];
  assert.equal(message.to, 'dana@lab.example');
  assert.equal(message.subject, 'Payment Confirmed — Order #PX100042');
  assert.match(message.html, /Payment Confirmed/);
  assert.match(message.html, /PAID/);
  assert.ok(message.text && message.text.length > 0, 'missing plain-text part');
});

test('a paid_at stamp with no payment_status still counts as paid', async () => {
  const order = baseOrder({ payment_status: null, paid_at: '2026-08-21T10:00:00.000Z' });
  assert.equal(isPaymentConfirmed(order), true);
  const pool = createMockPool({ order });
  const resend = createMockResend();
  const result = await sendPaymentConfirmationForOrder(42, {
    pool, resend, env: TEST_ENV, logger: silentLogger()
  });
  assert.equal(result.sent, true);
});

test('confirming payment twice still sends exactly one payment email', async () => {
  const pool = createMockPool({ order: paidOrder() });
  const resend = createMockResend();
  const logger = silentLogger();

  const first = await sendPaymentConfirmationForOrder(42, { pool, resend, env: TEST_ENV, logger });
  const second = await sendPaymentConfirmationForOrder(42, { pool, resend, env: TEST_ENV, logger });
  const third = await sendPaymentConfirmationForOrder(42, { pool, resend, env: TEST_ENV, logger });

  assert.equal(first.sent, true);
  assert.equal(second.reason, 'already_sent');
  assert.equal(third.reason, 'already_sent');
  assert.equal(resend.sent.length, 1, 'more than one payment email was sent');
});

test('the payment email content is built from the order row', () => {
  const message = buildPaymentConfirmationEmail({
    order: paidOrder({ discount_amount: '15.00', promo_code: 'LAB15', total: '237.35' }),
    items: orderItems(),
    env: TEST_ENV
  });

  for (const body of [message.html, message.text]) {
    assert.match(body, /PX100042/);
    assert.match(body, /GLP-2TZ/);
    assert.match(body, /GHK-CU/);
    assert.ok(body.includes('$110.00'), 'unit price missing');
    assert.ok(body.includes('$220.00'), 'line total missing');
    assert.ok(body.includes('$240.00'), 'subtotal missing');
    assert.ok(body.includes('$15.00'), 'discount missing');
    assert.ok(body.includes('$12.35'), 'shipping missing');
    assert.ok(body.includes('$237.35'), 'total missing');
    assert.match(body, /Elgin, IL 60120/);
  }
  assert.match(message.html, /Dana/);
  assert.match(message.text, /Payment status: Paid/);
  assert.match(message.text, /Qty 2 x \$110\.00 = \$220\.00/);
  assert.match(message.html, /account\.html\?tab=orders&amp;order_id=42/);
  assert.match(message.html, /View Order/);
});

test('a Resend failure never breaks payment confirmation and stays retryable', async () => {
  const pool = createMockPool({ order: paidOrder() });
  const logger = silentLogger();

  const failed = await sendPaymentConfirmationForOrder(42, {
    pool, resend: createMockResend('throw'), env: TEST_ENV, logger
  });
  assert.equal(failed.sent, false);
  assert.equal(failed.reason, 'send_failed');
  assert.equal(logger.errors.length, 1, 'the failure was not logged');
  assert.equal(pool.state.paymentSentAt, null, 'claim was not released for retry');

  // The payment itself is untouched: only the claim column was written.
  const orderWrites = pool.state.queries.filter((entry) =>
    entry.sql.startsWith('UPDATE orders') && !entry.sql.includes('payment_confirmation_sent_at'));
  assert.equal(orderWrites.length, 0, 'payment state was modified by an email failure');

  const retry = createMockResend();
  const retried = await sendPaymentConfirmationForOrder(42, {
    pool, resend: retry, env: TEST_ENV, logger
  });
  assert.equal(retried.sent, true);
  assert.equal(retry.sent.length, 1);
});

// --- email 2: shipped + tracking ---------------------------------------

test('no shipping email is sent while there is no tracking number', async () => {
  const cases = [
    { shipment: null, order: paidOrder() },
    { shipment: uspsShipment({ tracking_number: '' }), order: paidOrder() },
    { shipment: uspsShipment({ tracking_number: null }), order: paidOrder() }
  ];
  for (const seed of cases) {
    const pool = createMockPool(seed);
    const resend = createMockResend();
    const result = await sendShippingConfirmationForOrder(42, {
      pool, resend, env: TEST_ENV, logger: silentLogger()
    });
    assert.equal(result.sent, false);
    assert.equal(result.reason, 'no_tracking_number');
    assert.equal(resend.sent.length, 0);
    assert.equal(pool.state.shippingSentAt, null, 'must not claim without tracking');
  }
});

test('a purchased label sends the shipping email with the real carrier and tracking number', async () => {
  const pool = createMockPool({ order: paidOrder(), shipment: uspsShipment() });
  const resend = createMockResend();
  const result = await sendShippingConfirmationForOrder(42, {
    pool, resend, env: TEST_ENV, logger: silentLogger()
  });

  assert.equal(result.sent, true);
  assert.equal(resend.sent.length, 1);
  const message = resend.sent[0];
  assert.equal(message.subject, 'Your PepX Research Order Has Shipped — #PX100042');
  assert.match(message.html, /Your Order Has Shipped/);
  assert.match(message.html, /USPS/);
  assert.match(message.html, /9400111899223197428490/);
  assert.match(message.html, /TRACK YOUR PACKAGE/);
  assert.match(message.text, /Carrier: USPS/);
  assert.match(message.text, /Tracking number: 9400111899223197428490/);
  assert.match(message.text, /Track your package: https:\/\/track\.easypost\.com\//);
});

test('purchasing a label twice still sends exactly one shipping email', async () => {
  const pool = createMockPool({ order: paidOrder(), shipment: uspsShipment() });
  const resend = createMockResend();
  const logger = silentLogger();

  const first = await sendShippingConfirmationForOrder(42, { pool, resend, env: TEST_ENV, logger });
  const second = await sendShippingConfirmationForOrder(42, { pool, resend, env: TEST_ENV, logger });

  assert.equal(first.sent, true);
  assert.equal(second.reason, 'already_sent');
  assert.equal(resend.sent.length, 1, 'more than one shipping email was sent');
});

test('a Resend failure never breaks label purchase and stays retryable', async () => {
  const pool = createMockPool({ order: paidOrder(), shipment: uspsShipment() });
  const logger = silentLogger();

  const failed = await sendShippingConfirmationForOrder(42, {
    pool, resend: createMockResend('error'), env: TEST_ENV, logger
  });
  assert.equal(failed.sent, false);
  assert.equal(failed.reason, 'send_failed');
  assert.equal(pool.state.shippingSentAt, null, 'claim was not released for retry');

  const shipmentWrites = pool.state.queries.filter((entry) => /^UPDATE shipments/.test(entry.sql));
  assert.equal(shipmentWrites.length, 0, 'the shipment was modified by an email failure');

  const retried = await sendShippingConfirmationForOrder(42, {
    pool, resend: createMockResend(), env: TEST_ENV, logger
  });
  assert.equal(retried.sent, true);
});

// --- tracking URLs ------------------------------------------------------

test('EasyPost tracking URL wins when one was stored', () => {
  assert.equal(
    buildTrackingUrl({
      carrier: 'USPS',
      trackingNumber: '9400111899223197428490',
      trackingUrl: 'https://track.easypost.com/abc'
    }),
    'https://track.easypost.com/abc'
  );
});

test('supported carriers get a real, URL-encoded tracking link', () => {
  assert.equal(
    buildTrackingUrl({ carrier: 'USPS', trackingNumber: '9400 111' }),
    'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400%20111'
  );
  assert.equal(
    buildTrackingUrl({ carrier: 'UPS', trackingNumber: '1Z999AA10123456784' }),
    'https://www.ups.com/track?tracknum=1Z999AA10123456784'
  );
  assert.equal(
    buildTrackingUrl({ carrier: 'FedEx', trackingNumber: '770123456789' }),
    'https://www.fedex.com/fedextrack/?trknbr=770123456789'
  );
  // EasyPost carrier variants still resolve to the right carrier.
  assert.match(buildTrackingUrl({ carrier: 'UPSDAP', trackingNumber: '1Z9' }), /ups\.com\/track/);
});

test('an unknown carrier never produces a fabricated tracking link', () => {
  for (const carrier of ['DHL', 'OnTrac', 'Unknown', '', null]) {
    assert.equal(
      buildTrackingUrl({ carrier, trackingNumber: 'ABC123' }),
      null,
      'invented a link for carrier: ' + String(carrier)
    );
  }
  assert.equal(buildTrackingUrl({ carrier: 'USPS', trackingNumber: '' }), null);
});

test('a non-http stored tracking URL is rejected rather than rendered', () => {
  const url = buildTrackingUrl({
    carrier: 'DHL',
    trackingNumber: 'ABC123',
    trackingUrl: 'javascript:alert(1)'
  });
  assert.equal(url, null);
});

test('an unknown carrier still shows the tracking number, without a broken CTA', () => {
  const message = buildShippingConfirmationEmail({
    order: paidOrder(),
    items: orderItems(),
    shipment: uspsShipment({ carrier: 'OnTrac', tracking_url: null }),
    env: TEST_ENV
  });
  assert.match(message.html, /9400111899223197428490/);
  assert.ok(!/TRACK YOUR PACKAGE/.test(message.html), 'rendered a CTA with no destination');
  assert.ok(!/tools\.usps\.com|ups\.com\/track|fedex\.com/.test(message.html), 'guessed a carrier URL');
  assert.match(message.text, /Use this tracking number with your carrier/);
});

test('the tracking number itself is clickable when a URL exists', () => {
  const message = buildShippingConfirmationEmail({
    order: paidOrder(),
    items: orderItems(),
    shipment: uspsShipment({ tracking_url: null }),
    env: TEST_ENV
  });
  const expected = 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490';
  assert.ok(
    message.html.includes('<a href="' + expected + '"'),
    'tracking number is not a link to the carrier'
  );
  assert.match(message.html, /TRACK YOUR PACKAGE/);
});

test('shipment status is shown when the record has one', () => {
  const message = buildShippingConfirmationEmail({
    order: paidOrder(),
    items: orderItems(),
    shipment: uspsShipment({ shipment_status: 'in_transit' }),
    env: TEST_ENV
  });
  assert.match(message.html, /In transit/);
  assert.match(message.text, /Status: In transit/);
});

// --- trigger wiring -----------------------------------------------------

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    finished: false,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; this.finished = true; return this; },
    send(payload) { this.body = payload; this.finished = true; return this; }
  };
}

async function invokeRoute(router, method, routePath, reqOverrides) {
  const layer = router.stack.find((entry) =>
    entry.route && entry.route.path === routePath &&
    entry.route.methods[String(method).toLowerCase()]);
  if (!layer) throw new Error('Route not found: ' + method + ' ' + routePath);

  const handles = layer.route.stack.map((entry) => entry.handle);
  const req = Object.assign({
    params: {}, body: {}, headers: {}, session: {}, user: null,
    get(name) { return this.headers[String(name || '').toLowerCase()] || ''; }
  }, reqOverrides || {});
  const res = createMockResponse();

  async function run(index) {
    if (index >= handles.length || res.finished) return;
    const handler = handles[index];
    if (handler.length >= 3) {
      await handler(req, res, async function next(err) {
        if (err) throw err;
        await run(index + 1);
      });
      return;
    }
    const result = handler(req, res);
    if (result && typeof result.then === 'function') await result;
  }

  await run(0);
  return { req, res };
}

function createAdminMockPool(orderRow) {
  const state = { order: clone(orderRow), queries: [] };
  return {
    state,
    async query(sql, params) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      const lower = normalized.toLowerCase();
      state.queries.push({ sql: normalized, params: clone(params || []) });

      if (lower.startsWith('select role from users where id = $1')) {
        return { rows: [{ role: 'admin' }] };
      }
      if (lower.startsWith('select id, payment_method, payment_status, status from orders')) {
        return { rows: state.order ? [clone(state.order)] : [] };
      }
      if (lower.startsWith("update orders set payment_status = 'paid'")) {
        state.order.payment_status = 'paid';
        state.order.status = 'processing';
        return {
          rows: [{
            id: state.order.id,
            order_number: state.order.order_number,
            payment_status: 'paid',
            paid_at: '2026-08-22T12:00:00.000Z',
            status: 'processing'
          }]
        };
      }
      throw new Error('Unexpected admin query in test: ' + normalized);
    }
  };
}

test('confirming a Zelle payment triggers the payment email after the update commits', async () => {
  const db = createAdminMockPool({
    id: 42, order_number: 'PX100042', payment_method: 'zelle',
    payment_status: 'awaiting_payment', status: 'pending_payment'
  });
  const calls = [];
  // Await next() so the whole middleware chain completes before we assert.
  const router = createAdminRouter(async (req, res, next) => {
    req.user = { id: 'admin-1' };
    await next();
  }, {
    pool: db,
    notifyPaymentConfirmed: async (orderId) => {
      // The payment must already be durable when the email is triggered.
      assert.equal(db.state.order.payment_status, 'paid');
      calls.push(orderId);
      return { sent: true };
    }
  });

  const { res } = await invokeRoute(router, 'post', '/orders/:id/confirm-zelle-payment', {
    params: { id: '42' }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.payment_status, 'paid');
  assert.deepEqual(calls, [42]);
});

test('an email failure never fails the Zelle confirmation response', async () => {
  const db = createAdminMockPool({
    id: 42, order_number: 'PX100042', payment_method: 'zelle',
    payment_status: 'awaiting_payment', status: 'pending_payment'
  });
  // Await next() so the whole middleware chain completes before we assert.
  const router = createAdminRouter(async (req, res, next) => {
    req.user = { id: 'admin-1' };
    await next();
  }, {
    pool: db,
    notifyPaymentConfirmed: async () => { throw new Error('resend exploded'); }
  });

  const { res } = await invokeRoute(router, 'post', '/orders/:id/confirm-zelle-payment', {
    params: { id: '42' }
  });

  assert.equal(res.statusCode, 200, 'a broken email must not fail payment confirmation');
  assert.equal(res.body.payment_status, 'paid');
});

test('the shipping email is triggered from the label-purchase route, after the purchase', () => {
  const source = readSource('routes/admin.js');
  const purchaseAt = source.indexOf("router.post('/orders/:id/shipping/purchase'");
  assert.ok(purchaseAt > -1, 'purchase route not found');
  const routeBody = source.slice(purchaseAt, purchaseAt + 1800);

  const workflowAt = routeBody.indexOf('await purchaseShipmentForOrder(');
  const notifyAt = routeBody.indexOf('await notifyOrderShipped(orderId)');
  assert.ok(workflowAt > -1, 'label purchase call not found');
  assert.ok(notifyAt > workflowAt, 'the email must be sent after the label is purchased');
  assert.match(routeBody.slice(workflowAt, notifyAt), /try \{\s*$/m, 'send must be wrapped in try/catch');
  assert.match(
    routeBody.slice(notifyAt),
    /catch \(emailError\) \{\s*\n\s*console\.error\('Shipping confirmation email failed:', emailError\);/
  );
});

test('neither email is triggered from browser-side code', () => {
  for (const file of ['script.js', 'admin.js', 'auth-page.js', 'checkout.html', 'order-confirmation.html']) {
    const source = readSource(file);
    assert.ok(
      !/sendPaymentConfirmationForOrder|sendShippingConfirmationForOrder|transactional-email/.test(source),
      file + ' triggers a customer email from the browser'
    );
  }
});

// --- security -----------------------------------------------------------

test('customer-controlled values are HTML-escaped in both emails', () => {
  const hostile = {
    shipping_name: 'Dana <script>alert(1)</script> Reyes',
    customer_name: 'Dana <script>alert(1)</script> Reyes',
    shipping_address: '11 "Douglas" & Ave'
  };
  const items = [{ name: '<img src=x onerror=alert(1)>', price: '110.00', quantity: 1 }];

  const messages = [
    buildPaymentConfirmationEmail({ order: paidOrder(hostile), items, env: TEST_ENV }),
    buildShippingConfirmationEmail({
      order: paidOrder(hostile), items, shipment: uspsShipment(), env: TEST_ENV
    })
  ];

  for (const message of messages) {
    assert.ok(!message.html.includes('<script>'), 'unescaped script tag');
    assert.ok(!message.html.includes('<img src=x'), 'unescaped item name');
    assert.match(message.html, /&lt;script&gt;/);
    assert.match(message.html, /&quot;Douglas&quot;/);
    assert.match(message.html, /&amp;/);
  }
});

test('a hostile tracking number cannot break out of the tracking markup', () => {
  const message = buildShippingConfirmationEmail({
    order: paidOrder(),
    items: orderItems(),
    shipment: uspsShipment({ tracking_number: '9400"><script>alert(1)</script>', tracking_url: null }),
    env: TEST_ENV
  });
  assert.ok(!message.html.includes('<script>'), 'unescaped tracking number');
  assert.ok(!message.html.includes('"><script'), 'tracking number escaped its attribute');
});

test('no secret or credential is ever rendered into either email', () => {
  const leaky = {
    password_hash: '$2a$10$notarealhashvalue',
    session_token: 'sess_should_not_leak',
    admin_notes: 'internal only - flagged account',
    zelle_confirmed_by: 'admin-1'
  };

  const messages = [
    buildPaymentConfirmationEmail({ order: paidOrder(leaky), items: orderItems(), env: TEST_ENV }),
    buildShippingConfirmationEmail({
      order: paidOrder(leaky), items: orderItems(), shipment: uspsShipment(), env: TEST_ENV
    })
  ];

  for (const message of messages) {
    const rendered = message.html + '\n' + message.text + '\n' + message.subject;
    assert.ok(!rendered.includes(TEST_ENV.RESEND_API_KEY), 'API key leaked');
    assert.ok(!rendered.includes('$2a$10$notarealhashvalue'), 'password hash leaked');
    assert.ok(!rendered.includes('sess_should_not_leak'), 'session token leaked');
    assert.ok(!rendered.includes('internal only'), 'admin notes leaked');
  }
});

test('both emails carry PepX branding, the real support address and the site disclaimer', () => {
  const messages = [
    buildPaymentConfirmationEmail({ order: paidOrder(), items: orderItems(), env: TEST_ENV }),
    buildShippingConfirmationEmail({
      order: paidOrder(), items: orderItems(), shipment: uspsShipment(), env: TEST_ENV
    })
  ];
  for (const message of messages) {
    assert.match(message.html, /Need Assistance\?/);
    assert.ok(message.html.includes(SUPPORT_EMAIL), 'support address missing');
    assert.ok(message.text.includes(SUPPORT_EMAIL), 'support address missing from text');
    assert.match(message.html, /For research use only\. Not for human consumption\./);
    assert.ok(message.html.includes('pepxresearch.com'), 'site link missing');
    assert.match(message.html, /max-width:600px/);
    assert.equal(message.from, 'PepX Research <orders@pepxresearch.com>');
  }
});

test('diagnostics report presence only and never leak secrets or addresses', async () => {
  const pool = createMockPool({ order: paidOrder() });
  const lines = [];
  const logger = {
    log(...args) { lines.push(args.map((a) => JSON.stringify(a)).join(' ')); },
    error() {}
  };

  await sendPaymentConfirmationForOrder(42, {
    pool, resend: createMockResend(), env: TEST_ENV, logger
  });

  const output = lines.join('\n');
  assert.match(output, /\[email-debug\] payment-confirmation state guard/);
  assert.match(output, /\[email-debug\] payment-confirmation duplicate claim/);
  assert.match(output, /\[email-debug\] payment-confirmation resend call succeeded/);
  assert.ok(!output.includes(TEST_ENV.RESEND_API_KEY), 'API key appeared in diagnostics');
  assert.ok(!output.includes('dana@lab.example'), 'recipient appeared in diagnostics');
  assert.match(output, /"resend_key":true/);
});

// --- migration / deploy --------------------------------------------------

test('migration 030 adds both send-guard columns without touching order data', () => {
  const sql = readSource(path.join('db', 'migrations', '030_transactional_email_state.sql'));
  assert.match(sql, /ADD COLUMN IF NOT EXISTS payment_confirmation_sent_at/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS shipping_confirmation_sent_at/);
  assert.ok(!/DROP|DELETE|TRUNCATE|UPDATE /i.test(sql), 'migration is not purely additive');
});

test('deploys still run pending migrations via the build step', () => {
  const pkg = JSON.parse(readSource('package.json'));
  assert.equal(pkg.scripts['vercel-build'], 'node scripts/migrate.js');
});

test('the admin order detail reports both email states', () => {
  const source = readSource('routes/admin.js');
  assert.match(source, /payment_confirmation_sent_at: order\.payment_confirmation_sent_at/);
  assert.match(source, /shipping_confirmation_sent_at: order\.shipping_confirmation_sent_at/);
  const ui = readSource('admin.js');
  assert.match(ui, /Payment email/);
  assert.match(ui, /Shipping email/);
});

// --- regression: production wiring reaches the real service -------------
// A production incident looked like a wiring bug: payment was confirmed and a
// label was purchased, both routes returned success, yet no Resend call was
// ever made. These tests pin the wiring so a genuinely undefined or no-op
// notifier can never ship.

test('the admin router as production builds it reaches the real email service', async () => {
  const seen = [];
  const db = {
    async query(sql, params) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      const lower = normalized.toLowerCase();
      seen.push(normalized);

      if (lower.startsWith('select role from users where id = $1')) {
        return { rows: [{ role: 'admin' }] };
      }
      if (lower.startsWith('select id, payment_method, payment_status, status from orders')) {
        return { rows: [{ id: 42, order_number: 'PX100042', payment_method: 'zelle', payment_status: 'awaiting_payment', status: 'pending_payment' }] };
      }
      if (lower.startsWith("update orders set payment_status = 'paid'")) {
        return { rows: [{ id: 42, order_number: 'PX100042', payment_status: 'paid', paid_at: '2026-08-22T12:00:00.000Z', status: 'processing' }] };
      }
      // Queries below can only be reached through the real transactional-email service.
      if (normalized.startsWith('SELECT o.*')) {
        return { rows: [paidOrder()] };
      }
      if (normalized.startsWith('UPDATE orders SET payment_confirmation_sent_at = NOW()')) {
        // Report the claim as already taken so the run stops before any provider call.
        return { rows: [] };
      }
      throw new Error('Unexpected query: ' + normalized);
    }
  };

  // Exactly how server.js builds it: no notifier dependencies supplied.
  const router = createAdminRouter(async (req, res, next) => {
    req.user = { id: 'admin-1' };
    await next();
  }, { pool: db });

  const { res } = await invokeRoute(router, 'post', '/orders/:id/confirm-zelle-payment', {
    params: { id: '42' }
  });

  assert.equal(res.statusCode, 200);
  assert.ok(
    seen.some((sql) => sql.startsWith('SELECT o.*')),
    'the default notifier never reached the transactional email service'
  );
  assert.ok(
    seen.some((sql) => sql.startsWith('UPDATE orders SET payment_confirmation_sent_at = NOW()')),
    'the default notifier never attempted the duplicate claim'
  );
});

test('both notifier defaults resolve to real exported functions, not undefined or no-ops', () => {
  const service = require('../../services/transactional-email');
  assert.equal(typeof service.sendPaymentConfirmationForOrder, 'function');
  assert.equal(typeof service.sendShippingConfirmationForOrder, 'function');

  const source = readSource('routes/admin.js');
  // The imported names must match the exported names exactly.
  assert.match(source, /sendPaymentConfirmationForOrder,\s*\n\s*sendShippingConfirmationForOrder\s*\n\}\s*=\s*require\('\.\.\/services\/transactional-email'\)/);
  assert.match(source, /deps\.notifyPaymentConfirmed \|\|\s*\n\s*\(\(orderId\) => sendPaymentConfirmationForOrder\(orderId, \{ pool: db \}\)\)/);
  assert.match(source, /deps\.notifyOrderShipped \|\|\s*\n\s*\(\(orderId\) => sendShippingConfirmationForOrder\(orderId, \{ pool: db \}\)\)/);
  // No stub or no-op may stand in for a notifier default.
  assert.ok(!/notify(PaymentConfirmed|OrderShipped)\s*=\s*[^|]*\(\)\s*=>\s*\{\s*\}/.test(source), 'a no-op notifier default is present');
});

test('server.js mounts the admin router without overriding the notifiers', () => {
  const source = readSource('server.js');
  assert.match(source, /app\.use\("\/api\/admin", createAdminRouter\(requireAuth\)\);/);
  assert.ok(!/notifyPaymentConfirmed|notifyOrderShipped/.test(source), 'server.js overrides a notifier');
});

test('both routes log where the email path stopped, without leaking secrets', () => {
  const source = readSource('routes/admin.js');
  assert.match(source, /\[payment-email-debug\] payment updated/);
  assert.match(source, /\[payment-email-debug\] notifier called/);
  assert.match(source, /\[payment-email-debug\] notifier result/);
  assert.match(source, /\[shipping-email-debug\] label purchased/);
  assert.match(source, /\[shipping-email-debug\] notifier called/);
  assert.match(source, /\[shipping-email-debug\] notifier result/);
  assert.match(source, /resendKeyPresent: Boolean\(process\.env\.RESEND_API_KEY\)/);
  // Presence booleans only - never the values themselves.
  assert.ok(
    !/console\.log\([^)]*process\.env\.RESEND_API_KEY\s*[,)]/.test(source.replace(/Boolean\(process\.env\.RESEND_API_KEY\)/g, 'X')),
    'an env value is logged rather than its presence'
  );
});
