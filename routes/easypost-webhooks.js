'use strict';

const express = require('express');
const pool = require('../db/connection');
const {
  getEasyPostWebhookSecret,
  validateWebhookSignature
} = require('../services/easypost');
const {
  ShippingWorkflowError,
  handleEasyPostWebhook
} = require('../services/shipping-workflow');

function createEasyPostWebhookRouter(deps) {
  deps = deps || {};
  const router = express.Router();
  const db = deps.pool || pool;

  router.post('/', async function (req, res) {
    try {
      const webhookSecret = getEasyPostWebhookSecret(deps.env);
      const signature = req.get('X-Hmac-Signature') || req.get('x-hmac-signature') || '';
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''));

      if (!validateWebhookSignature(rawBody, signature, webhookSecret)) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      let payload;
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch (error) {
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }

      const result = await handleEasyPostWebhook({
        pool: db,
        payload: payload,
        env: deps.env
      });

      if (result && result.duplicate) {
        return res.status(200).json({ ok: true, duplicate: true });
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      if (error instanceof ShippingWorkflowError) {
        return res.status(error.status || 500).json({ error: error.message });
      }
      if (error && error.code && String(error.code).indexOf('easypost-webhook-secret-missing') !== -1) {
        return res.status(500).json({ error: error.message });
      }
      console.error('EasyPost webhook failed:', error);
      return res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

  return router;
}

module.exports = createEasyPostWebhookRouter;