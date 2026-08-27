'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const createAdminRouter = require('../../routes/admin');
const createEasyPostWebhookRouter = require('../../routes/easypost-webhooks');
const {
  createRatesForOrder,
  purchaseShipmentForOrder,
  voidShipmentForOrder,
  handleEasyPostWebhook,
  ShippingWorkflowError
} = require('../../services/shipping-workflow');
const { validateWebhookSignature } = require('../../services/easypost');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function iso(minutesOffset) {
  return new Date(Date.now() + (minutesOffset || 0) * 60000).toISOString();
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    finished: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.finished = true;
      return this;
    },
    send(payload) {
      this.body = payload;
      this.finished = true;
      return this;
    }
  };
}

function createMockPool(seed) {
  const state = {
    users: clone((seed && seed.users) || []),
    orders: clone((seed && seed.orders) || []),
    shipments: clone((seed && seed.shipments) || []),
    webhookEvents: clone((seed && seed.webhookEvents) || []),
    nextShipmentId: seed && seed.nextShipmentId || 1,
    nextWebhookEventId: seed && seed.nextWebhookEventId || 1,
    lastQueries: []
  };

  function findOrder(orderId) {
    return state.orders.find((order) => Number(order.id) === Number(orderId)) || null;
  }

  function findShipmentById(id) {
    return state.shipments.find((shipment) => Number(shipment.id) === Number(id)) || null;
  }

  function findShipmentByProviderShipmentId(orderId, providerShipmentId) {
    return state.shipments.find((shipment) => Number(shipment.order_id) === Number(orderId) && shipment.provider_shipment_id === providerShipmentId) || null;
  }

  function findShipmentByTrackerId(trackerId) {
    return state.shipments.find((shipment) => shipment.provider_tracker_id === trackerId) || null;
  }

  function findShipmentByTrackingNumber(trackingNumber) {
    return state.shipments.find((shipment) => shipment.tracking_number === trackingNumber) || null;
  }

  async function query(sql, params) {
    const lower = String(sql).trim().toLowerCase();
    const normalized = lower.replace(/\s+/g, ' ').trim();
    state.lastQueries.push({ sql, params: clone(params || []) });

    if (lower === 'begin' || lower === 'commit' || lower === 'rollback') {
      return { rows: [] };
    }

    if (lower.startsWith('select role from users where id = $1')) {
      const row = state.users.find((user) => user.id === params[0]);
      return { rows: row ? [{ role: row.role || 'customer' }] : [] };
    }

    if (lower.startsWith('select * from orders where id = $1')) {
      const row = findOrder(params[0]);
      return { rows: row ? [clone(row)] : [] };
    }

    if (lower.startsWith('select status from orders where id = $1 limit 1')) {
      const row = findOrder(params[0]);
      return { rows: row ? [{ status: row.status }] : [] };
    }

    if (lower.startsWith('select * from shipments where order_id = $1 and provider_shipment_id = $2')) {
      const row = findShipmentByProviderShipmentId(params[0], params[1]);
      return { rows: row ? [clone(row)] : [] };
    }

    if (normalized.startsWith('select id from shipments where order_id = $1') && normalized.includes('purchased_at is not null')) {
      const row = state.shipments.find((shipment) => Number(shipment.order_id) === Number(params[0]) && shipment.purchased_at && shipment.is_voided === false);
      return { rows: row ? [{ id: row.id }] : [] };
    }

    if (lower.startsWith('select * from shipments where order_id = $1 order by created_at desc, id desc')) {
      const rows = state.shipments
        .filter((shipment) => Number(shipment.order_id) === Number(params[0]))
        .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime() || Number(right.id) - Number(left.id));
      return { rows: clone(rows) };
    }

    if (lower.startsWith('select * from shipments where provider_tracker_id = $1')) {
      const row = findShipmentByTrackerId(params[0]);
      return { rows: row ? [clone(row)] : [] };
    }

    if (lower.startsWith('select * from shipments where provider_shipment_id = $1')) {
      const row = state.shipments.find((shipment) => shipment.provider_shipment_id === params[0]);
      return { rows: row ? [clone(row)] : [] };
    }

    if (lower.startsWith('select * from shipments where tracking_number = $1')) {
      const row = findShipmentByTrackingNumber(params[0]);
      return { rows: row ? [clone(row)] : [] };
    }

    if (lower.startsWith('insert into shipments')) {
      const row = {
        id: state.nextShipmentId++,
        order_id: params[0],
        provider: params[1],
        provider_shipment_id: params[2],
        provider_tracker_id: params[3],
        shipment_status: params[4],
        created_at: iso(0),
        updated_at: iso(0),
        rate_id: null,
        carrier: null,
        service: null,
        tracking_number: null,
        tracking_url: null,
        label_url: null,
        label_format: 'PDF',
        label_cost: null,
        currency: 'USD',
        is_voided: false,
        voided_at: null,
        purchased_at: null
      };
      state.shipments.push(row);
      return { rows: [clone(row)] };
    }

    if (lower.startsWith('update shipments') && lower.includes('set rate_id = $1')) {
      const row = findShipmentById(params[12]);
      if (!row) return { rows: [] };
      row.rate_id = params[0];
      row.carrier = params[1];
      row.service = params[2];
      row.tracking_number = params[3];
      row.tracking_url = params[4];
      row.label_url = params[5];
      row.label_format = params[6];
      row.label_cost = params[7];
      row.currency = params[8];
      row.shipment_status = params[9];
      row.provider_tracker_id = params[10];
      row.purchased_at = params[11];
      row.updated_at = iso(0);
      row.is_voided = false;
      row.voided_at = null;
      return { rows: [clone(row)] };
    }

    if (lower.startsWith('update shipments') && lower.includes('set shipment_status = $1') && lower.includes('is_voided = true')) {
      const row = findShipmentById(params[1]);
      if (!row) return { rows: [] };
      row.shipment_status = params[0];
      row.is_voided = true;
      row.voided_at = iso(0);
      row.updated_at = iso(0);
      return { rows: [clone(row)] };
    }

    if (lower.startsWith('insert into shipment_webhook_events')) {
      const eventId = params[0];
      const existing = state.webhookEvents.find((event) => event.event_id === eventId);
      if (existing) return { rows: [] };
      const row = {
        id: state.nextWebhookEventId++,
        event_id: eventId,
        provider: params[1],
        event_type: params[2],
        tracker_status: params[3],
        created_at: iso(0)
      };
      state.webhookEvents.push(row);
      return { rows: [{ id: row.id }] };
    }

    if (normalized.startsWith('update orders set tracking_number = $1, carrier = $2, shipping_label_url = $3') && normalized.includes("status = case when status = 'paid' then 'processing' else status end")) {
      const row = findOrder(params[3]);
      if (!row) return { rows: [] };
      row.tracking_number = params[0];
      row.carrier = params[1];
      row.shipping_label_url = params[2];
      row.shipping_label_created_at = iso(0);
      if (row.status === 'paid') row.status = 'processing';
      row.updated_at = iso(0);
      return { rows: [clone(row)] };
    }

    if (normalized.startsWith('update orders set tracking_number = null, carrier = null, shipping_label_url = null') && normalized.includes("status = case when status = 'shipped' then 'processing' else status end")) {
      const row = findOrder(params[0]);
      if (!row) return { rows: [] };
      row.tracking_number = null;
      row.carrier = null;
      row.shipping_label_url = null;
      row.shipping_label_created_at = null;
      if (row.status === 'shipped') row.status = 'processing';
      row.updated_at = iso(0);
      return { rows: [clone(row)] };
    }

    if (lower.startsWith('update orders set status = $1, shipped_at = coalesce(shipped_at, current_timestamp)')) {
      const row = findOrder(params[1]);
      if (!row) return { rows: [] };
      row.status = params[0];
      row.shipped_at = row.shipped_at || iso(0);
      row.updated_at = iso(0);
      return { rows: [{ id: row.id, status: row.status, shipped_at: row.shipped_at }] };
    }

    if (lower.startsWith('update orders set status = $1, updated_at = current_timestamp where id = $2 returning id, status, shipped_at')) {
      const row = findOrder(params[1]);
      if (!row) return { rows: [] };
      row.status = params[0];
      row.updated_at = iso(0);
      return { rows: [{ id: row.id, status: row.status, shipped_at: row.shipped_at || null }] };
    }

    if (lower.startsWith('update shipments') && lower.includes('set provider_tracker_id = coalesce')) {
      const row = findShipmentById(params[3]);
      if (!row) return { rows: [] };
      row.provider_tracker_id = params[0] || row.provider_tracker_id;
      row.tracking_number = params[1] || row.tracking_number;
      row.shipment_status = params[2];
      row.updated_at = iso(0);
      return { rows: [clone(row)] };
    }

    if (lower.startsWith('update orders') && lower.includes("status = case when status in ('paid','processing','shipped') then 'completed'")) {
      const row = findOrder(params[2]);
      if (!row) return { rows: [] };
      row.status = ['paid', 'processing', 'shipped'].includes(row.status) ? 'completed' : row.status;
      row.shipped_at = row.shipped_at || iso(0);
      row.tracking_number = params[0] || row.tracking_number;
      row.carrier = params[1] || row.carrier;
      row.updated_at = iso(0);
      return { rows: [] };
    }

    if (lower.startsWith('update orders') && lower.includes("status = case when status in ('paid','processing') then 'shipped'")) {
      const row = findOrder(params[2]);
      if (!row) return { rows: [] };
      row.status = ['paid', 'processing'].includes(row.status) ? 'shipped' : row.status;
      row.shipped_at = row.shipped_at || iso(0);
      row.tracking_number = params[0] || row.tracking_number;
      row.carrier = params[1] || row.carrier;
      row.updated_at = iso(0);
      return { rows: [] };
    }

    if (lower.startsWith('update orders set tracking_number = $1, carrier = $2, shipping_label_url = $3') && lower.includes('status = case when status = \'paid\' then \'processing\'')) {
      const row = findOrder(params[3]);
      if (!row) return { rows: [] };
      row.tracking_number = params[0];
      row.carrier = params[1];
      row.shipping_label_url = params[2];
      if (row.status === 'paid') row.status = 'processing';
      row.updated_at = iso(0);
      return { rows: [clone(row)] };
    }

    if (lower.startsWith('update orders set tracking_number = null, carrier = null, shipping_label_url = null') && lower.includes("status = case when status = 'shipped' then 'processing'")) {
      const row = findOrder(params[0]);
      if (!row) return { rows: [] };
      row.tracking_number = null;
      row.carrier = null;
      row.shipping_label_url = null;
      if (row.status === 'shipped') row.status = 'processing';
      row.updated_at = iso(0);
      return { rows: [] };
    }

    throw new Error('Unsupported SQL in test mock: ' + sql);
  }

  return {
    state,
    async connect() {
      return {
        query,
        release() {}
      };
    },
    query
  };
}

function createMockEasyPostClient(options) {
  options = options || {};
  return {
    Address: {
      async createAndVerify(payload) {
        const address = options.verifiedAddress || {
          id: 'adr_1',
          ...payload,
          verifications: {
            delivery: {
              success: true,
              errors: [],
              details: { latitude: 0, longitude: 0, time_zone: 'UTC' }
            }
          }
        };
        return clone(address);
      }
    },
    Shipment: {
      async create() {
        return clone(options.createdShipment || {
          id: 'shp_1',
          rates: options.rates || [],
          tracker: options.tracker || null,
          postage_label: options.postageLabel || null,
          tracking_code: options.trackingCode || null
        });
      },
      async retrieve() {
        return clone(options.retrievedShipment || options.createdShipment || {
          id: 'shp_1',
          rates: options.rates || [],
          tracker: options.tracker || null,
          postage_label: options.postageLabel || null,
          tracking_code: options.trackingCode || null
        });
      },
      async buy() {
        return clone(options.boughtShipment || {
          id: 'shp_1',
          tracker: options.tracker || { id: 'trk_1', carrier: 'USPS', public_url: 'https://track.example/1', tracking_code: 'TRACK123' },
          postage_label: options.postageLabel || { label_pdf_url: 'https://labels.example/1.pdf', label_url: 'https://labels.example/1.png', label_file_type: 'application/pdf' },
          tracking_code: options.trackingCode || 'TRACK123',
          rates: options.rates || []
        });
      },
      async convertLabelFormat() {
        return clone(options.convertedShipment || {
          id: 'shp_1',
          tracker: options.tracker || { id: 'trk_1', carrier: 'USPS', public_url: 'https://track.example/1', tracking_code: 'TRACK123' },
          postage_label: { label_pdf_url: 'https://labels.example/1.pdf', label_url: 'https://labels.example/1.png', label_file_type: 'application/pdf' },
          tracking_code: options.trackingCode || 'TRACK123'
        });
      },
      async refund() {
        return clone(options.refundedShipment || {
          id: 'shp_1',
          refund_status: options.refundStatus || 'submitted'
        });
      }
    }
  };
}

async function invokeRoute(router, method, routePath, reqOverrides) {
  const layer = router.stack.find((entry) => entry.route && entry.route.path === routePath && entry.route.methods[String(method).toLowerCase()]);
  if (!layer) {
    throw new Error('Route not found: ' + method + ' ' + routePath);
  }

  const handles = layer.route.stack.map((entry) => entry.handle);
  const req = Object.assign({
    params: {},
    body: {},
    headers: {},
    session: {},
    user: null,
    get(name) {
      return this.headers[String(name || '').toLowerCase()] || this.headers[String(name || '')] || '';
    }
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
    if (result && typeof result.then === 'function') {
      await result;
    }
    if (!res.finished) {
      await run(index + 1);
    }
  }

  await run(0);
  return { req, res };
}

function createBaseOrder(overrides) {
  return Object.assign({
    id: 1,
    user_id: 'user-1',
    order_number: 'PX100001',
    status: 'paid',
    subtotal: 20,
    shipping_cost: 0,
    total: 20,
    shipping_name: 'Test Customer',
    shipping_email: 'customer@example.com',
    shipping_address: '123 Main St',
    shipping_city: 'Denver',
    shipping_state: 'CO',
    shipping_zip: '80202',
    shipping_country: 'US',
    shipping_phone: '555-0000',
    created_at: iso(-60),
    updated_at: iso(-10),
    shipped_at: null,
    shipping_label_created_at: null,
    tracking_number: null,
    carrier: null,
    shipping_label_url: null
  }, overrides || {});
}

function createBaseRate(id, price, overrides) {
  return Object.assign({
    id,
    carrier: 'USPS',
    service: 'Ground Advantage',
    rate: String(price),
    currency: 'USD',
    delivery_days: 3,
    delivery_date: '2026-08-01',
    shipment_id: 'shp_1'
  }, overrides || {});
}

test('non-admin users cannot retrieve rates', async () => {
  const db = createMockPool({
    users: [{ id: 'user-1', role: 'customer' }],
    orders: [createBaseOrder()]
  });
  const router = createAdminRouter((req, res, next) => {
    req.user = { id: 'user-1' };
    next();
  }, { pool: db, client: createMockEasyPostClient() });

  const { res } = await invokeRoute(router, 'post', '/orders/:id/shipping/rates', {
    params: { id: '1' },
    body: { pounds: 1, ounces: 0, length: 6, width: 4, height: 2 }
  });

  assert.equal(res.statusCode, 403);
});

test('non-admin users cannot purchase labels', async () => {
  const db = createMockPool({
    users: [{ id: 'user-1', role: 'customer' }],
    orders: [createBaseOrder()],
    shipments: [{
      id: 1,
      order_id: 1,
      provider: 'easypost',
      provider_shipment_id: 'shp_1',
      shipment_status: 'rated',
      created_at: iso(-5),
      updated_at: iso(-5),
      is_voided: false
    }]
  });
  const router = createAdminRouter((req, res, next) => {
    req.user = { id: 'user-1' };
    next();
  }, { pool: db, client: createMockEasyPostClient() });

  const { res } = await invokeRoute(router, 'post', '/orders/:id/shipping/purchase', {
    params: { id: '1' },
    body: { shipmentId: 'shp_1', rateId: 'rate_1' }
  });

  assert.equal(res.statusCode, 403);
});

test('missing orders return 404', async () => {
  const db = createMockPool({
    orders: []
  });
  const client = createMockEasyPostClient();

  await assert.rejects(
    createRatesForOrder({
      pool: db,
      client,
      orderId: 99,
      package: { pounds: 1, ounces: 0, length: 6, width: 4, height: 2 },
      env: {
        SHIP_FROM_NAME: 'Warehouse',
        SHIP_FROM_STREET1: '100 Ship St',
        SHIP_FROM_CITY: 'Denver',
        SHIP_FROM_STATE: 'CO',
        SHIP_FROM_ZIP: '80202'
      }
    }),
    (err) => err instanceof ShippingWorkflowError && err.status === 404
  );
});

test('invalid weight is rejected', async () => {
  const db = createMockPool({ orders: [createBaseOrder()] });
  const client = createMockEasyPostClient();

  await assert.rejects(
    createRatesForOrder({
      pool: db,
      client,
      orderId: 1,
      package: { pounds: -1, ounces: 0, length: 6, width: 4, height: 2 },
      env: {
        SHIP_FROM_NAME: 'Warehouse',
        SHIP_FROM_STREET1: '100 Ship St',
        SHIP_FROM_CITY: 'Denver',
        SHIP_FROM_STATE: 'CO',
        SHIP_FROM_ZIP: '80202'
      }
    }),
    (err) => err instanceof ShippingWorkflowError && err.code === 'invalid_package_weight'
  );
});

test('incomplete addresses are rejected', async () => {
  const db = createMockPool({
    orders: [createBaseOrder({ shipping_address: '' })]
  });
  const client = createMockEasyPostClient();

  await assert.rejects(
    createRatesForOrder({
      pool: db,
      client,
      orderId: 1,
      package: { pounds: 1, ounces: 0, length: 6, width: 4, height: 2 },
      env: {
        SHIP_FROM_NAME: 'Warehouse',
        SHIP_FROM_STREET1: '100 Ship St',
        SHIP_FROM_CITY: 'Denver',
        SHIP_FROM_STATE: 'CO',
        SHIP_FROM_ZIP: '80202'
      }
    }),
    (err) => err instanceof ShippingWorkflowError && err.code === 'incomplete_destination_address'
  );
});

test('rates are sanitized and sorted correctly', async () => {
  const db = createMockPool({ orders: [createBaseOrder()] });
  const client = createMockEasyPostClient({
    rates: [
      createBaseRate('rate_2', 12.5, { carrier: 'UPS', delivery_days: 2 }),
      createBaseRate('rate_1', 7.25, { carrier: 'USPS', delivery_days: 5, rate: '7.25' }),
      createBaseRate('rate_3', 9.99, { carrier: 'FedEx', delivery_days: 3 })
    ]
  });

  const result = await createRatesForOrder({
    pool: db,
    client,
    orderId: 1,
    package: { pounds: 1, ounces: 4, length: 6, width: 4, height: 2 },
    env: {
      SHIP_FROM_NAME: 'Warehouse',
      SHIP_FROM_STREET1: '100 Ship St',
      SHIP_FROM_CITY: 'Denver',
      SHIP_FROM_STATE: 'CO',
      SHIP_FROM_ZIP: '80202'
    }
  });

  assert.equal(result.rates.length, 3);
  assert.deepEqual(result.rates.map((rate) => rate.rateId), ['rate_1', 'rate_3', 'rate_2']);
  assert.equal(result.rates[0].price, 7.25);
  assert.equal(result.rates[0].deliveryDays, 5);
  assert.equal(result.rates[0].shipmentId, 'shp_1');
  assert.equal(result.shipment.providerShipmentId, 'shp_1');
});

test('a valid selected rate can be purchased', async () => {
  const db = createMockPool({
    orders: [createBaseOrder()],
    shipments: [{
      id: 1,
      order_id: 1,
      provider: 'easypost',
      provider_shipment_id: 'shp_1',
      shipment_status: 'rated',
      created_at: iso(-5),
      updated_at: iso(-5),
      is_voided: false
    }]
  });
  const client = createMockEasyPostClient({
    retrievedShipment: {
      id: 'shp_1',
      rates: [createBaseRate('rate_1', 7.25)],
      tracker: { id: 'trk_1', carrier: 'USPS', public_url: 'https://track.example/1', tracking_code: 'TRACK123' }
    },
    boughtShipment: {
      id: 'shp_1',
      tracker: { id: 'trk_1', carrier: 'USPS', public_url: 'https://track.example/1', tracking_code: 'TRACK123' },
      postage_label: { label_url: 'https://labels.example/1.png', label_file_type: 'image/png' },
      tracking_code: 'TRACK123'
    },
    convertedShipment: {
      id: 'shp_1',
      tracker: { id: 'trk_1', carrier: 'USPS', public_url: 'https://track.example/1', tracking_code: 'TRACK123' },
      postage_label: { label_pdf_url: 'https://labels.example/1.pdf', label_file_type: 'application/pdf' },
      tracking_code: 'TRACK123'
    }
  });

  const result = await purchaseShipmentForOrder({
    pool: db,
    client,
    orderId: 1,
    shipmentId: 'shp_1',
    rateId: 'rate_1'
  });

  assert.equal(result.label.labelUrl, 'https://labels.example/1.pdf');
  assert.equal(result.label.trackingNumber, 'TRACK123');
  assert.equal(db.state.shipments[0].shipment_status, 'label_created');
  assert.equal(db.state.orders[0].status, 'processing');
});

test('a rate from another shipment cannot be purchased', async () => {
  const db = createMockPool({
    orders: [createBaseOrder()],
    shipments: [{
      id: 1,
      order_id: 1,
      provider: 'easypost',
      provider_shipment_id: 'shp_1',
      shipment_status: 'rated',
      created_at: iso(-5),
      updated_at: iso(-5),
      is_voided: false
    }]
  });
  const client = createMockEasyPostClient({
    retrievedShipment: {
      id: 'shp_1',
      rates: [createBaseRate('rate_a', 7.25)]
    }
  });

  await assert.rejects(
    purchaseShipmentForOrder({
      pool: db,
      client,
      orderId: 1,
      shipmentId: 'shp_1',
      rateId: 'rate_other'
    }),
    (err) => err instanceof ShippingWorkflowError && err.code === 'invalid-rate'
  );
});

test('duplicate label purchases are blocked', async () => {
  const db = createMockPool({
    orders: [createBaseOrder()],
    shipments: [{
      id: 1,
      order_id: 1,
      provider: 'easypost',
      provider_shipment_id: 'shp_1',
      shipment_status: 'rated',
      created_at: iso(-5),
      updated_at: iso(-5),
      is_voided: false
    }]
  });
  const client = createMockEasyPostClient({
    retrievedShipment: {
      id: 'shp_1',
      rates: [createBaseRate('rate_1', 7.25)]
    }
  });

  await purchaseShipmentForOrder({
    pool: db,
    client,
    orderId: 1,
    shipmentId: 'shp_1',
    rateId: 'rate_1'
  });

  await assert.rejects(
    purchaseShipmentForOrder({
      pool: db,
      client,
      orderId: 1,
      shipmentId: 'shp_1',
      rateId: 'rate_1'
    }),
    (err) => err instanceof ShippingWorkflowError && err.code === 'duplicate-purchase'
  );
});

test('shipment information is saved correctly', async () => {
  const db = createMockPool({
    orders: [createBaseOrder()],
    shipments: [{
      id: 1,
      order_id: 1,
      provider: 'easypost',
      provider_shipment_id: 'shp_1',
      shipment_status: 'rated',
      created_at: iso(-5),
      updated_at: iso(-5),
      is_voided: false
    }]
  });
  const client = createMockEasyPostClient({
    retrievedShipment: {
      id: 'shp_1',
      rates: [createBaseRate('rate_1', 8.5, { carrier: 'UPS', service: '2nd Day Air' })]
    }
  });

  await purchaseShipmentForOrder({
    pool: db,
    client,
    orderId: 1,
    shipmentId: 'shp_1',
    rateId: 'rate_1'
  });

  const shipment = db.state.shipments[0];
  assert.equal(shipment.rate_id, 'rate_1');
  assert.equal(shipment.carrier, 'UPS');
  assert.equal(shipment.service, '2nd Day Air');
  assert.equal(shipment.label_cost, 8.5);
  assert.equal(shipment.label_format, 'PDF');
  assert.equal(shipment.tracking_number, 'TRACK123');
  assert.equal(db.state.orders[0].shipping_label_created_at != null, true);
});

test('a label can be voided when eligible', async () => {
  const db = createMockPool({
    orders: [createBaseOrder({ status: 'processing', tracking_number: 'TRACK123', carrier: 'USPS', shipping_label_url: 'https://labels.example/1.pdf' })],
    shipments: [{
      id: 1,
      order_id: 1,
      provider: 'easypost',
      provider_shipment_id: 'shp_1',
      provider_tracker_id: 'trk_1',
      shipment_status: 'label_created',
      rate_id: 'rate_1',
      carrier: 'USPS',
      service: 'Ground Advantage',
      tracking_number: 'TRACK123',
      tracking_url: 'https://track.example/1',
      label_url: 'https://labels.example/1.pdf',
      label_format: 'PDF',
      label_cost: 7.25,
      currency: 'USD',
      purchased_at: iso(-5),
      created_at: iso(-10),
      updated_at: iso(-5),
      is_voided: false
    }]
  });
  const client = createMockEasyPostClient({
    refundedShipment: { id: 'shp_1', refund_status: 'submitted' }
  });

  const result = await voidShipmentForOrder({
    pool: db,
    client,
    orderId: 1,
    shipmentId: 'shp_1'
  });

  assert.equal(result.shipment.isVoided, true);
  assert.equal(db.state.shipments[0].is_voided, true);
  assert.equal(db.state.orders[0].shipping_label_url, null);
});

test('an already-voided label cannot be voided again', async () => {
  const db = createMockPool({
    orders: [createBaseOrder()],
    shipments: [{
      id: 1,
      order_id: 1,
      provider: 'easypost',
      provider_shipment_id: 'shp_1',
      shipment_status: 'voided',
      purchased_at: iso(-5),
      is_voided: true,
      created_at: iso(-10),
      updated_at: iso(-5)
    }]
  });
  const client = createMockEasyPostClient({
    refundedShipment: { id: 'shp_1', refund_status: 'submitted' }
  });

  await assert.rejects(
    voidShipmentForOrder({
      pool: db,
      client,
      orderId: 1,
      shipmentId: 'shp_1'
    }),
    (err) => err instanceof ShippingWorkflowError && err.code === 'label-already-voided'
  );
});

test('invalid webhook signatures are rejected', async () => {
  assert.equal(validateWebhookSignature(Buffer.from('{"id":"evt_1"}'), 'bad-signature', 'secret'), false);

  const router = createEasyPostWebhookRouter({
    pool: createMockPool(),
    env: { EASYPOST_WEBHOOK_SECRET: 'secret' }
  });

  const { res } = await invokeRoute(router, 'post', '/', {
    headers: { 'x-hmac-signature': 'bad-signature' },
    body: Buffer.from('{"id":"evt_1"}')
  });

  assert.equal(res.statusCode, 401);
});

test('valid tracker webhooks update the correct shipment', async () => {
  const db = createMockPool({
    orders: [createBaseOrder({ status: 'processing' })],
    shipments: [{
      id: 1,
      order_id: 1,
      provider: 'easypost',
      provider_shipment_id: 'shp_1',
      provider_tracker_id: 'trk_1',
      shipment_status: 'label_created',
      tracking_number: 'TRACK123',
      tracking_url: 'https://track.example/1',
      purchased_at: iso(-10),
      created_at: iso(-15),
      updated_at: iso(-10),
      is_voided: false
    }]
  });

  const result = await handleEasyPostWebhook({
    pool: db,
    payload: {
      id: 'evt_1',
      description: 'tracker.updated',
      result: {
        object: 'Tracker',
        id: 'trk_1',
        shipment_id: 'shp_1',
        tracking_code: 'TRACK123',
        carrier: 'USPS',
        status: 'in_transit'
      }
    }
  });

  assert.equal(result.updated, true);
  assert.equal(db.state.shipments[0].shipment_status, 'in_transit');
  assert.equal(db.state.orders[0].status, 'shipped');
});

test('duplicate webhook events are idempotent', async () => {
  const db = createMockPool({
    orders: [createBaseOrder({ status: 'processing' })],
    shipments: [{
      id: 1,
      order_id: 1,
      provider: 'easypost',
      provider_shipment_id: 'shp_1',
      provider_tracker_id: 'trk_1',
      shipment_status: 'label_created',
      tracking_number: 'TRACK123',
      tracking_url: 'https://track.example/1',
      purchased_at: iso(-10),
      created_at: iso(-15),
      updated_at: iso(-10),
      is_voided: false
    }]
  });

  const payload = {
    id: 'evt_1',
    description: 'tracker.updated',
    result: {
      object: 'Tracker',
      id: 'trk_1',
      shipment_id: 'shp_1',
      tracking_code: 'TRACK123',
      carrier: 'USPS',
      status: 'delivered'
    }
  };

  const first = await handleEasyPostWebhook({ pool: db, payload });
  const second = await handleEasyPostWebhook({ pool: db, payload });

  assert.equal(first.updated, true);
  assert.equal(second.duplicate, true);
  assert.equal(db.state.webhookEvents.length, 1);
  assert.equal(db.state.orders[0].status, 'completed');
});

test('existing admin order functionality still works', async () => {
  const db = createMockPool({
    users: [{ id: 'admin-1', role: 'admin' }],
    orders: [createBaseOrder({ status: 'processing' })]
  });
  const router = createAdminRouter((req, res, next) => {
    req.user = { id: 'admin-1' };
    next();
  }, { pool: db, client: createMockEasyPostClient() });

  const { res } = await invokeRoute(router, 'put', '/orders/:id/status', {
    params: { id: '1' },
    body: { status: 'shipped' }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(db.state.orders[0].status, 'shipped');
  assert.ok(db.state.orders[0].shipped_at);
});
test('non-admin users cannot download the 4x6 print label', async () => {
  const db = createMockPool({
    users: [{ id: 'user-1', role: 'customer' }],
    orders: [createBaseOrder()],
    shipments: []
  });
  const router = createAdminRouter((req, res, next) => {
    req.user = { id: 'user-1' };
    next();
  }, { pool: db, client: createMockEasyPostClient() });

  const { res } = await invokeRoute(router, 'get', '/orders/:id/label-4x6.pdf', {
    params: { id: '1' }
  });

  assert.equal(res.statusCode, 403);
});
