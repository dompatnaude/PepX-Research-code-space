'use strict';

const express = require('express');
const {
  getEasyPostClient,
  getShipFromAddress,
  sanitizeRate,
  validatePackageInput,
  buildShipmentCreateParams,
  classifyCheckoutService,
  checkoutServiceOrder,
  toCountryCode,
  isDomesticCountry,
  isShippableCountry,
  isRegionRequired,
  isPostalOptional,
  getCheckoutPackage
} = require('../services/easypost');

// U.S. addresses go to USPS, every other country to FedEx International.
// The zone is decided here from the destination country, never by the browser.
function createCheckoutShippingRouter(requireAuth) {
  const router = express.Router();

  router.post('/rates', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const zip = String(body.zip || '').trim();
      const state = String(body.state || '').trim();
      const city = String(body.city || '').trim();
      const address = String(body.address || '').trim();
      const address2 = String(body.address2 || '').trim();
      const country = toCountryCode(body.country);
      const name = String(body.name || '').trim();
      const phone = String(body.phone || '').trim();
      const confirmVerifiedAddress = !!(body.confirmVerifiedAddress || body.confirm_verified_address);
      const domestic = isDomesticCountry(country);

      if (!/^[A-Z]{2}$/.test(country)) {
        return res.status(400).json({ error: 'Please choose the country you are shipping to.' });
      }
      if (!isShippableCountry(country)) {
        return res.status(422).json({ code: 'country-not-served', error: "Sorry, we don't ship to this country yet." });
      }
      if (domestic && (!zip || !state)) {
        return res.status(400).json({ error: 'ZIP code and state are required to calculate shipping rates.' });
      }
      if (!domestic) {
        if (!address || !city) {
          return res.status(400).json({ error: 'Street address and city are required to calculate international shipping.' });
        }
        if (!zip && !isPostalOptional(country)) {
          return res.status(400).json({ error: 'A postal code is required to calculate shipping to this country.' });
        }
        if (!state && isRegionRequired(country)) {
          return res.status(400).json({ error: 'A state or province is required to calculate shipping to this country.' });
        }
      }

      const destination = {
        name: name || 'Customer',
        street1: address || zip,
        street2: address2 || null,
        city: city || state,
        state: state || null,
        zip: zip || null,
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

      // ---- USPS address verification (EasyPost), U.S. addresses only ----
      // Strict USPS verification does not apply abroad; FedEx validates the
      // destination when rating and again when the label is bought.
      if (domestic) {
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

      // Keep the cheapest rate per offered service. U.S. orders list the three
      // USPS services in their usual order; international orders list every
      // service the account returns, cheapest to most expensive.
      allRates.sort((a, b) => Number(a.price) - Number(b.price));
      const seen = new Map();
      for (const rate of allRates) {
        if (!(Number(rate.price) > 0)) continue;
        const canonical = classifyCheckoutService(rate.carrier, rate.service, country);
        if (canonical && !seen.has(canonical)) {
          seen.set(canonical, { ...rate, canonicalService: canonical });
        }
      }
      const rates = domestic
        ? checkoutServiceOrder(country).map(serviceName => seen.get(serviceName)).filter(Boolean)
        : Array.from(seen.values());

      // Carriers explain missing rates in shipment.messages (an account not
      // enabled for a country, a missing phone number, ...). Log them so the
      // reason is visible in the server logs; customers get a plain message.
      const carrierMessages = Array.isArray(shipment.messages) ? shipment.messages : [];
      if (!rates.length || carrierMessages.length) {
        console.warn('[checkout-shipping] carrier messages', {
          country,
          returnedRates: allRates.length,
          offeredRates: rates.length,
          messages: carrierMessages.map(m => ({ carrier: m && m.carrier, type: m && m.type, message: m && m.message }))
        });
      }
      if (!rates.length) {
        return res.status(422).json({
          code: 'no-shipping-options',
          error: domestic
            ? 'No USPS shipping rates are available for your address. Please verify the ZIP code.'
            : "We couldn't find an international shipping option for this address. Please check the postal code and city, or email pepxaminos@gmail.com and we'll help."
        });
      }

      return res.json({
        shipmentId: shipment.id,
        zone: domestic ? 'domestic' : 'international',
        rates
      });
    } catch (err) {
      console.error('Checkout shipping rates error:', err);
      return res.status(500).json({ error: 'Failed to calculate shipping rates. Please try again.' });
    }
  });

  return router;
}

module.exports = createCheckoutShippingRouter;
