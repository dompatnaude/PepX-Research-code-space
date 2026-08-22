'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildOrderConfirmationEmail,
  sendOrderConfirmation,
  isPaymentConfirmed,
  EmailConfigError
} = require('../../services/email');
const { sendOrderConfirmationForOrder } = require('../../services/order-confirmation');

// A deliberately fake key. Nothing in this file may ever reach the network.
const TEST_ENV = {
  RESEND_API_KEY: 're_test_key_must_never_be_rendered',
  ORDER_FROM_EMAIL: 'PepX Research <orders@pepxresearch.com>',
  SITE_URL: 'https://pepxresearch.com'
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pendingOrder(overrides) {
  return Object.assign(
    {
      id: 42,
      order_number: 'PX100042',
      user_id: 'user-1',
      status: 'pending_payment',
      created_at: '2026-08-20T15:04:05.000Z',
      subtotal: '240.00',
      subtotal_before_discount: '240.00',
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
      customer_name: 'Dana Reyes',
      customer_email: 'account@lab.example'
    },
    overrides || {}
  );
}

function orderItems() {
  return [
    { name: 'GLP-2TZ', variant_name: '10 mg', price: '110.00', quantity: 2 },
    { name: 'GHK-CU', variant_name: null, price: '20.00', quantity: 1 }
  ];
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
    order: clone((seed && seed.order) || pendingOrder()),
    items: clone((seed && seed.items) || orderItems()),
    confirmationSentAt: (seed && seed.confirmationSentAt) || null,
    queries: []
  };

  const pool = {
    state,
    async query(sql, params) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      state.queries.push({ sql: normalized, params: clone(params || []) });

      if (normalized.startsWith('SELECT o.*')) {
        return { rows: state.order ? [clone(state.order)] : [] };
      }
      if (normalized.startsWith('UPDATE orders SET order_confirmation_sent_at = NOW()')) {
        if (state.confirmationSentAt) return { rows: [] };
        state.confirmationSentAt = '2026-08-20T15:04:06.000Z';
        return { rows: [{ id: state.order.id }] };
      }
      if (normalized.startsWith('UPDATE orders SET order_confirmation_sent_at = NULL')) {
        state.confirmationSentAt = null;
        return { rows: [] };
      }
      if (normalized.startsWith('SELECT name, variant_name')) {
        return { rows: clone(state.items) };
      }
      throw new Error('Unexpected query in test: ' + normalized);
    }
  };

  return pool;
}

function silentLogger() {
  const errors = [];
  return { errors, error(...args) { errors.push(args); }, log() {} };
}

// --- recipient selection ---------------------------------------------

test('the receipt goes to the order contact email', () => {
  const message = buildOrderConfirmationEmail({
    order: pendingOrder(),
    items: orderItems(),
    env: TEST_ENV
  });
  assert.equal(message.to, 'dana@lab.example');
});

test('a missing or malformed contact email falls back to the account email', () => {
  const blank = buildOrderConfirmationEmail({
    order: pendingOrder({ shipping_email: '   ' }),
    items: orderItems(),
    env: TEST_ENV
  });
  assert.equal(blank.to, 'account@lab.example');

  const malformed = buildOrderConfirmationEmail({
    order: pendingOrder({ shipping_email: 'not-an-address' }),
    items: orderItems(),
    env: TEST_ENV
  });
  assert.equal(malformed.to, 'account@lab.example');
});

test('an order with no usable address is rejected instead of sent', async () => {
  const resend = createMockResend();
  await assert.rejects(
    () => sendOrderConfirmation(
      pendingOrder({ shipping_email: null, customer_email: null }),
      { items: orderItems(), env: TEST_ENV, resend }
    ),
    (error) => error instanceof EmailConfigError
  );
  assert.equal(resend.sent.length, 0);
});

test('the from address comes from ORDER_FROM_EMAIL, never a hardcoded secret', () => {
  const message = buildOrderConfirmationEmail({
    order: pendingOrder(),
    items: orderItems(),
    env: TEST_ENV
  });
  assert.equal(message.from, 'PepX Research <orders@pepxresearch.com>');
});

// --- order number ------------------------------------------------------

test('the real order number appears in the subject and both body parts', () => {
  const message = buildOrderConfirmationEmail({
    order: pendingOrder(),
    items: orderItems(),
    env: TEST_ENV
  });
  assert.equal(message.subject, 'PepX Research Order #PX100042');
  assert.match(message.html, /PX100042/);
  assert.match(message.text, /Order #PX100042/);
});

// --- items -------------------------------------------------------------

test('each item name, quantity, unit price and line total appear in both parts', () => {
  const message = buildOrderConfirmationEmail({
    order: pendingOrder(),
    items: orderItems(),
    env: TEST_ENV
  });

  for (const body of [message.html, message.text]) {
    assert.match(body, /GLP-2TZ/);
    assert.match(body, /10 mg/);
    assert.match(body, /GHK-CU/);
    assert.ok(body.includes('$110.00'), 'unit price missing');
    assert.ok(body.includes('$220.00'), 'line total missing');
    assert.ok(body.includes('$20.00'), 'second line total missing');
  }
  assert.match(message.text, /Qty 2 x \$110\.00 = \$220\.00/);
});

test('line totals are recomputed from quantity and unit price, not taken on trust', () => {
  const message = buildOrderConfirmationEmail({
    order: pendingOrder(),
    items: [{ name: 'GLP-2TZ', price: '110.00', quantity: 3, line_total: '1.00' }],
    env: TEST_ENV
  });
  assert.ok(message.text.includes('$330.00'), 'expected recomputed line total');
  assert.ok(!message.text.includes('$1.00'), 'must not use a supplied line total');
});

// --- totals ------------------------------------------------------------

test('subtotal, shipping and total are rendered from the order row', () => {
  const message = buildOrderConfirmationEmail({
    order: pendingOrder(),
    items: orderItems(),
    env: TEST_ENV
  });
  assert.match(message.text, /Subtotal: \$240\.00/);
  assert.match(message.text, /Shipping: \$12\.35/);
  assert.match(message.text, /Total: \$252\.35/);
  assert.ok(message.html.includes('$240.00'));
  assert.ok(message.html.includes('$12.35'));
  assert.ok(message.html.includes('$252.35'));
});

test('a discount is shown with its promo code when the order carries one', () => {
  const message = buildOrderConfirmationEmail({
    order: pendingOrder({ discount_amount: '15.00', promo_code: 'LAB15', total: '237.35' }),
    items: orderItems(),
    env: TEST_ENV
  });
  assert.match(message.text, /Discount \(LAB15\): -\$15\.00/);
  assert.match(message.text, /Total: \$237\.35/);
});

// --- payment wording ---------------------------------------------------

test('a pending order never claims payment was received', () => {
  const message = buildOrderConfirmationEmail({
    order: pendingOrder(),
    items: orderItems(),
    env: TEST_ENV
  });
  assert.ok(!/Payment Received/i.test(message.html), 'html falsely claims payment');
  assert.ok(!/Payment Received/i.test(message.text), 'text falsely claims payment');
  assert.match(message.html, /Order Received/);
  assert.match(message.text, /Order Received/);
  assert.match(message.text, /Payment Status: Pending/);
});

test('every non-paid payment_status stays pending, including unknown values', () => {
  const values = [null, '', 'awaiting_payment', 'pending', 'failed', 'refunded', 'PAID_LATER'];
  for (const value of values) {
    const order = pendingOrder({ payment_status: value, paid_at: null });
    assert.equal(isPaymentConfirmed(order), false, 'unexpectedly paid for: ' + String(value));
    const message = buildOrderConfirmationEmail({ order, items: orderItems(), env: TEST_ENV });
    assert.ok(!/Payment Received/i.test(message.text), 'claimed payment for: ' + String(value));
  }
});

test('a confirmed payment is allowed to say Payment Received', () => {
  const order = pendingOrder({
    payment_status: 'paid',
    paid_at: '2026-08-21T10:00:00.000Z',
    status: 'processing'
  });
  assert.equal(isPaymentConfirmed(order), true);
  const message = buildOrderConfirmationEmail({ order, items: orderItems(), env: TEST_ENV });
  assert.match(message.html, /Payment Received/);
  assert.match(message.text, /Payment Received/);
  assert.match(message.text, /Payment Status: Paid/);
});

test('the payment method recorded on the order is shown', () => {
  const message = buildOrderConfirmationEmail({
    order: pendingOrder(),
    items: orderItems(),
    env: TEST_ENV
  });
  assert.match(message.text, /Method: Zelle/);
});

// --- content, escaping and secrets -------------------------------------

test('customer-controlled values are HTML-escaped', () => {
  const message = buildOrderConfirmationEmail({
    order: pendingOrder({
      shipping_name: 'Dana <script>alert(1)</script> Reyes',
      customer_name: 'Dana <script>alert(1)</script> Reyes',
      shipping_address: '11 "Douglas" & Ave'
    }),
    items: [{ name: '<img src=x onerror=alert(1)>', price: '110.00', quantity: 1 }],
    env: TEST_ENV
  });

  assert.ok(!message.html.includes('<script>'), 'unescaped script tag in html');
  assert.ok(!message.html.includes('<img src=x'), 'unescaped item name in html');
  assert.match(message.html, /&lt;script&gt;/);
  assert.match(message.html, /&amp;/);
  assert.match(message.html, /&quot;Douglas&quot;/);
});

test('the shipping address and site link are included', () => {
  const message = buildOrderConfirmationEmail({
    order: pendingOrder(),
    items: orderItems(),
    env: TEST_ENV
  });
  assert.match(message.text, /11 Douglas Ave Suite 253/);
  assert.match(message.text, /Elgin, IL 60120/);
  assert.match(message.text, /United States/);
  assert.ok(message.html.includes('https://pepxresearch.com'));
  assert.ok(message.text.includes('https://pepxresearch.com'));
});

test('no secret or credential is ever rendered into the message', () => {
  const message = buildOrderConfirmationEmail({
    order: pendingOrder({
      password_hash: '$2a$10$notarealhashvalue',
      session_token: 'sess_should_not_leak',
      admin_notes: 'internal only - flagged account'
    }),
    items: orderItems(),
    env: TEST_ENV
  });

  const rendered = message.html + '\n' + message.text + '\n' + message.subject;
  assert.ok(!rendered.includes(TEST_ENV.RESEND_API_KEY), 'API key leaked into the email');
  assert.ok(!rendered.includes('$2a$10$notarealhashvalue'), 'password hash leaked');
  assert.ok(!rendered.includes('sess_should_not_leak'), 'session token leaked');
  assert.ok(!rendered.includes('internal only'), 'admin notes leaked');
});

// --- duplicate protection ----------------------------------------------

test('a receipt is sent exactly once no matter how many times it is requested', async () => {
  const pool = createMockPool();
  const resend = createMockResend();
  const logger = silentLogger();

  const first = await sendOrderConfirmationForOrder(42, { pool, resend, env: TEST_ENV, logger });
  const second = await sendOrderConfirmationForOrder(42, { pool, resend, env: TEST_ENV, logger });
  const third = await sendOrderConfirmationForOrder(42, { pool, resend, env: TEST_ENV, logger });

  assert.equal(first.sent, true);
  assert.equal(second.sent, false);
  assert.equal(second.reason, 'already_sent');
  assert.equal(third.reason, 'already_sent');
  assert.equal(resend.sent.length, 1, 'more than one receipt was sent');
});

test('the duplicate guard is database-backed, not an in-memory flag', async () => {
  const pool = createMockPool();
  const resend = createMockResend();
  await sendOrderConfirmationForOrder(42, { pool, resend, env: TEST_ENV, logger: silentLogger() });

  const claim = pool.state.queries.find((entry) =>
    entry.sql.startsWith('UPDATE orders SET order_confirmation_sent_at = NOW()'));
  assert.ok(claim, 'no persisted claim was written');
  assert.match(claim.sql, /order_confirmation_sent_at IS NULL/);
  assert.deepEqual(claim.params, [42]);
  assert.ok(pool.state.confirmationSentAt, 'claim not persisted');
});

test('an order that was already confirmed before this process started is skipped', async () => {
  const pool = createMockPool({ confirmationSentAt: '2026-08-20T10:00:00.000Z' });
  const resend = createMockResend();
  const result = await sendOrderConfirmationForOrder(42, {
    pool, resend, env: TEST_ENV, logger: silentLogger()
  });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'already_sent');
  assert.equal(resend.sent.length, 0);
});

// --- failure containment -----------------------------------------------

test('a thrown Resend error never escapes and never rolls the order back', async () => {
  const pool = createMockPool();
  const resend = createMockResend('throw');
  const logger = silentLogger();

  const result = await sendOrderConfirmationForOrder(42, { pool, resend, env: TEST_ENV, logger });

  assert.equal(result.sent, false);
  assert.equal(result.reason, 'send_failed');
  assert.equal(logger.errors.length, 1, 'the failure was not logged');
  assert.match(String(logger.errors[0][0]), /Order confirmation email failed/);

  const wroteToOrder = pool.state.queries.some((entry) =>
    /^(DELETE|INSERT)/.test(entry.sql) ||
    (entry.sql.startsWith('UPDATE orders') && !entry.sql.includes('order_confirmation_sent_at')));
  assert.equal(wroteToOrder, false, 'the order itself was modified by an email failure');
});

test('a Resend error payload is treated as a failure, not a success', async () => {
  const pool = createMockPool();
  const resend = createMockResend('error');
  const result = await sendOrderConfirmationForOrder(42, {
    pool, resend, env: TEST_ENV, logger: silentLogger()
  });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'send_failed');
});

test('a failed send releases its claim so the receipt can be retried', async () => {
  const pool = createMockPool();
  const logger = silentLogger();

  const failed = await sendOrderConfirmationForOrder(42, {
    pool, resend: createMockResend('throw'), env: TEST_ENV, logger
  });
  assert.equal(failed.sent, false);
  assert.equal(pool.state.confirmationSentAt, null, 'claim was not released after failure');

  const retryResend = createMockResend();
  const retried = await sendOrderConfirmationForOrder(42, {
    pool, resend: retryResend, env: TEST_ENV, logger
  });
  assert.equal(retried.sent, true);
  assert.equal(retryResend.sent.length, 1);
});

test('a missing order is reported rather than throwing', async () => {
  const pool = createMockPool();
  pool.state.order = null;
  const resend = createMockResend();
  const result = await sendOrderConfirmationForOrder(999, {
    pool, resend, env: TEST_ENV, logger: silentLogger()
  });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'order_not_found');
  assert.equal(resend.sent.length, 0);
});

test('the delivered message carries both an HTML and a plain-text part', async () => {
  const pool = createMockPool();
  const resend = createMockResend();
  await sendOrderConfirmationForOrder(42, { pool, resend, env: TEST_ENV, logger: silentLogger() });

  const message = resend.sent[0];
  assert.equal(message.to, 'dana@lab.example');
  assert.equal(message.subject, 'PepX Research Order #PX100042');
  assert.ok(message.html && message.html.length > 0, 'missing html part');
  assert.ok(message.text && message.text.length > 0, 'missing text part');
});

// --- trigger wiring ----------------------------------------------------

test('the receipt is triggered server-side in the order route, after COMMIT', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'routes', 'orders.js'),
    'utf8'
  );

  assert.match(source, /require\("\.\.\/services\/order-confirmation"\)/);

  const commitIndex = source.indexOf('await client.query("COMMIT")');
  const sendIndex = source.indexOf('await sendOrderConfirmationForOrder(order.id)');
  assert.ok(commitIndex > -1, 'no COMMIT found in the order route');
  assert.ok(sendIndex > commitIndex, 'the receipt must be sent after the order is committed');

  const tail = source.slice(commitIndex, sendIndex);
  assert.match(tail, /try \{\s*$/m, 'the send must be wrapped in try/catch');
  assert.match(
    source.slice(sendIndex),
    /catch \(emailError\) \{\s*\n\s*console\.error\('Order confirmation email failed:', emailError\);/,
    'an email failure must be caught and logged'
  );
});

// --- production regression: missing migration --------------------------

test('a missing order_confirmation_sent_at column fails closed without calling Resend', async () => {
  // Reproduces the production outage: migration 029 had not been applied,
  // so claiming the send threw and the provider was never reached.
  const pool = createMockPool();
  const realQuery = pool.query.bind(pool);
  pool.query = async (sql, params) => {
    if (String(sql).includes('order_confirmation_sent_at = NOW()')) {
      const error = new Error(
        'column "order_confirmation_sent_at" of relation "orders" does not exist'
      );
      error.code = '42703';
      throw error;
    }
    return realQuery(sql, params);
  };

  const resend = createMockResend();
  const logger = silentLogger();
  const result = await sendOrderConfirmationForOrder(42, { pool, resend, env: TEST_ENV, logger });

  assert.equal(result.sent, false);
  assert.equal(result.reason, 'send_failed');
  assert.equal(resend.sent.length, 0, 'Resend must not be called when the claim fails');
  assert.equal(logger.errors.length, 1, 'the schema failure must be logged');
});

test('the migration that backs the duplicate guard is present in the repo', () => {
  const file = path.join(
    __dirname, '..', '..', 'db', 'migrations', '029_order_confirmation_email.sql'
  );
  const sql = fs.readFileSync(file, 'utf8');
  assert.match(sql, /ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_confirmation_sent_at/);
});

test('deploys run pending migrations via a build step', () => {
  // Vercel serves this app through api/index.js, which only requires
  // server.js; startServer() (and runMigrations) never runs there.
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
  );
  assert.equal(pkg.scripts['vercel-build'], 'node scripts/migrate.js');
});

// --- diagnostics are safe ----------------------------------------------

test('diagnostic logging reports presence only and never leaks secrets or addresses', async () => {
  const pool = createMockPool();
  const resend = createMockResend();
  const lines = [];
  const logger = {
    errors: [],
    log(...args) { lines.push(args.map((a) => JSON.stringify(a)).join(' ')); },
    error(...args) { this.errors.push(args); }
  };

  await sendOrderConfirmationForOrder(42, { pool, resend, env: TEST_ENV, logger });

  const output = lines.join('\n');
  assert.match(output, /\[email-debug\] config present/);
  assert.match(output, /\[email-debug\] order lookup/);
  assert.match(output, /\[email-debug\] recipient resolved/);
  assert.match(output, /\[email-debug\] duplicate claim/);
  assert.match(output, /\[email-debug\] resend call attempted/);
  assert.match(output, /\[email-debug\] resend call succeeded/);

  assert.ok(!output.includes(TEST_ENV.RESEND_API_KEY), 'API key appeared in diagnostics');
  assert.ok(!output.includes('dana@lab.example'), 'recipient address appeared in diagnostics');
  assert.ok(!output.includes('account@lab.example'), 'account address appeared in diagnostics');
  assert.match(output, /"resend_key":true/);
  assert.match(output, /"from_email":true/);
  assert.match(output, /"site_url":true/);
});

test('diagnostics report missing configuration without inventing a value', async () => {
  const pool = createMockPool();
  const resend = createMockResend();
  const lines = [];
  const logger = {
    log(...args) { lines.push(args.map((a) => JSON.stringify(a)).join(' ')); },
    error() {}
  };

  await sendOrderConfirmationForOrder(42, {
    pool, resend, env: { ORDER_FROM_EMAIL: '', SITE_URL: '' }, logger
  });

  const output = lines.join('\n');
  assert.match(output, /"resend_key":false/);
  assert.match(output, /"from_email":false/);
  assert.match(output, /"site_url":false/);
});
