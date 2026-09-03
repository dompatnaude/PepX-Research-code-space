'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const createEasyPostWebhookRouter = require('../../routes/easypost-webhooks');

function createMockPool() {
  const events = new Set();
  const shipments = [{
    id: 1,
    order_id: 101,
    provider: 'easypost',
    provider_tracker_id: 'trk_test_100',
    shipment_status: 'label_created'
  }];
  const orders = [{
    id: 101,
    status: 'processing'
  }];

  return {
    connect: async () => ({
      query: async (sql, params) => {
        const text = String(sql || '');
        if (text.startsWith('BEGIN') || text.startsWith('COMMIT') || text.startsWith('ROLLBACK')) {
          return { rows: [] };
        }
        if (text.includes('INSERT INTO shipment_webhook_events')) {
          const eventId = params[0];
          if (events.has(eventId)) {
            return { rows: [] };
          }
          events.add(eventId);
          return { rows: [{ id: events.size }] };
        }
        if (text.includes('SELECT * FROM shipments WHERE provider_tracker_id = $1')) {
          const trackerId = params[0];
          const found = shipments.find(s => s.provider_tracker_id === trackerId);
          return { rows: found ? [found] : [] };
        }
        if (text.includes('UPDATE shipments SET shipment_status')) {
          const [status, trackerId] = params;
          const found = shipments.find(s => s.provider_tracker_id === trackerId);
          if (found) found.shipment_status = status;
          return { rows: found ? [found] : [] };
        }
        if (text.includes('UPDATE orders SET status')) {
          const [status, orderId] = params;
          const found = orders.find(o => o.id === orderId);
          if (found) found.status = status;
          return { rows: found ? [found] : [] };
        }
        return { rows: [] };
      },
      release: () => {}
    })
  };
}

test('end-to-end webhook validation and processing with EasyPost HMAC header', async () => {
  const webhookSecret = 'whsec_e2e_production_secret_key_12345';
  const mockPool = createMockPool();

  const app = express();
  app.use('/api/webhooks/easypost', express.raw({ type: 'application/json' }), createEasyPostWebhookRouter({
    pool: mockPool,
    env: { EASYPOST_WEBHOOK_SECRET: webhookSecret }
  }));

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const payloadObject = {
      id: 'evt_e2e_test_001',
      object: 'Event',
      description: 'tracker.updated',
      result: {
        id: 'trk_test_100',
        object: 'Tracker',
        status: 'in_transit',
        tracking_code: '9400100000000000000000'
      }
    };
    const bodyString = JSON.stringify(payloadObject);
    const bodyBuffer = Buffer.from(bodyString, 'utf8');

    // Generate valid EasyPost HMAC-SHA256 signature header
    const expectedHex = crypto
      .createHmac('sha256', Buffer.from(webhookSecret.normalize('NFKD'), 'utf8'))
      .update(bodyString, 'utf8')
      .digest('hex');
    const signatureHeader = `hmac-sha256-hex=${expectedHex}`;

    // 1. Send invalid signature -> 401
    const badRes = await fetch(`http://127.0.0.1:${port}/api/webhooks/easypost`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hmac-Signature': 'hmac-sha256-hex=invalid_signature_hash'
      },
      body: bodyBuffer
    });
    assert.equal(badRes.status, 401);
    const badJson = await badRes.json();
    assert.equal(badJson.error, 'Invalid webhook signature');

    // 2. Send valid signature -> 200 { ok: true }
    const goodRes = await fetch(`http://127.0.0.1:${port}/api/webhooks/easypost`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hmac-Signature': signatureHeader
      },
      body: bodyBuffer
    });
    assert.equal(goodRes.status, 200);
    const goodJson = await goodRes.json();
    assert.equal(goodJson.ok, true);

    // 3. Resend duplicate event -> 200 { ok: true, duplicate: true }
    const dupRes = await fetch(`http://127.0.0.1:${port}/api/webhooks/easypost`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hmac-Signature': signatureHeader
      },
      body: bodyBuffer
    });
    assert.equal(dupRes.status, 200);
    const dupJson = await dupRes.json();
    assert.equal(dupJson.ok, true);
    assert.equal(dupJson.duplicate, true);

  } finally {
    server.close();
  }
});
