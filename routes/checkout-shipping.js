'use strict';

const express = require('express');
const {
  getEasyPostClient,
  getShipFromAddress,
  sanitizeRate,
  validatePackageInput,
  buildShipmentCreateParams,
  classifyUspsService,
  getCheckoutPackage
} = require('../services/easypost');

// Preferred display order for USPS services in checkout.
const USPS_SERVICE_ORDER = [
  'USPS Ground Advantage',
  'USPS Priority Mail',
  'USPS Priority Mail Express'
];

function createCheckoutShippingRouter(requireAuth) {
  const router = express.Router();

  router.post('/rates', requireAuth, async (req, res) => {
    console.log('[checkout-shipping] rates route hit — EP configured:', !!process.env.EASYPOST_API_KEY, '| ship-from ZIP:', !!process.env.SHIP_FROM_ZIP);
    try {
      const body = req.body || {};
      const zip = String(body.zip || '').trim();
      const state = String(body.state || '').trim();
      const city = String(body.city || '').trim();
      const address = String(body.address || '').trim();
      const country = String(body.country || 'US').trim() || 'US';
      const name = String(body.name || '').trim();
      const phone = String(body.phone || '').trim();
        const confirmVerifiedAddress = !!(body.confirmVerifiedAddress || body.confirm_verified_address);

      if (!zip || !state) {
        return res.status(400).json({ error: 'ZIP code and state are required to calculate shipping rates.' });
      }

      const destination = {
        name: name || 'Customer',
        street1: address || zip,
        city: city || state,
        state,
        zip,
        country,
        phone: phone || null
      };

      let shipFrom;
      try {
        shipFrom = getShipFromAddress(process.env);
      } catch (err) {
        return res.status(500).json({ error: 'Shipping is not configured. Please contact support.' });
      }

      let client;
      try {
        client = getEasyPostClient({ env: process.env });
      } catch (err) {
        return res.status(500).json({ error: 'Shipping service is not available. Please contact support.' });
      }

        // ---- USPS address verification (EasyPost) ----
        function normAddr(a){
          if(!a) return {};
          return { street1:String(a.street1||'').trim().toUpperCase(), street2:String(a.street2||'').trim().toUpperCase(), city:String(a.city||'').trim().toUpperCase(), state:String(a.state||'').trim().toUpperCase(), zip:String(a.zip||'').trim().toUpperCase(), country:String(a.country||'US').trim().toUpperCase() };
        }
        function pickAddr(a){
          return { name:(a&&a.name)||name||'Customer', company:(a&&a.company)||null, street1:(a&&a.street1)||null, street2:(a&&a.street2)||null, city:(a&&a.city)||null, state:(a&&a.state)||null, zip:(a&&a.zip)||null, country:(a&&a.country)||'US' };
        }
        let verifiedAddress = null;
        try {
          verifiedAddress = await client.Address.createAndVerify(Object.assign({}, destination, { verify_strict: true }));
        } catch (verr) {
          return res.status(422).json({ error: "We couldn't verify this address. Please review the address and try again.", code: 'address-verification-failed' });
        }
        const addressChanged = JSON.stringify(normAddr(destination)) !== JSON.stringify(normAddr(verifiedAddress));
        if (addressChanged && !confirmVerifiedAddress) {
          return res.status(409).json({ error: 'Address verification returned a suggested correction. Confirmation is required before rates can be retrieved.', code: 'address-verification-confirmation-required', details: { originalAddress: pickAddr(destination), suggestedAddress: pickAddr(verifiedAddress) } });
        }
        if (addressChanged && confirmVerifiedAddress && verifiedAddress) {
          destination.street1 = verifiedAddress.street1 || destination.street1;
          destination.street2 = verifiedAddress.street2 || destination.street2;
          destination.city = verifiedAddress.city || destination.city;
          destination.state = verifiedAddress.state || destination.state;
          destination.zip = verifiedAddress.zip || destination.zip;
          destination.country = verifiedAddress.country || destination.country;
        }

      const rawPkg = getCheckoutPackage(process.env);
      let packageInfo;
      try {
        packageInfo = validatePackageInput(rawPkg);
      } catch (err) {
        return res.status(500).json({ error: 'Shipping package configuration is invalid. Please contact support.' });
      }

      let shipment;
      try {
        shipment = await client.Shipment.create(buildShipmentCreateParams({
          toAddress: destination,
          fromAddress: shipFrom,
          packageInfo
        }));
      } catch (err) {
        const msg = (err && err.message) ? err.message : 'Could not retrieve shipping rates.';
        return res.status(502).json({ error: msg });
      }

      const allRates = Array.isArray(shipment.rates) ? shipment.rates.map(sanitizeRate).filter(Boolean) : [];

      // Keep cheapest rate per canonical USPS service and sort by preferred order.
      allRates.sort((a, b) => Number(a.price) - Number(b.price));
      const seen = new Map();
      for (const rate of allRates) {
        const canonical = classifyUspsService(rate.carrier, rate.service);
        if (canonical && !seen.has(canonical)) {
          seen.set(canonical, { ...rate, canonicalService: canonical });
        }
      }
      const uspsRates = USPS_SERVICE_ORDER
        .map(name => seen.get(name))
        .filter(Boolean);

      return res.json({
        shipmentId: shipment.id,
        rates: uspsRates
      });
    } catch (err) {
      console.error('Checkout shipping rates error:', err);
      return res.status(500).json({ error: 'Failed to calculate shipping rates. Please try again.' });
    }
  });

  return router;
}

module.exports = createCheckoutShippingRouter;
