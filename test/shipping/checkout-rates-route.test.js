'use strict';

// /api/checkout/shipping/rates: U.S. gets the three USPS services; every other
// country gets every service EasyPost returns, cheapest first.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const easypostPath = require.resolve('../../services/easypost');
const real = require(easypostPath);

let nextShipment = null;
require.cache[easypostPath].exports = Object.assign({}, real, {
  getShipFromAddress: () => ({ name: 'PX', street1: '1 St', city: 'Elgin', state: 'IL', zip: '60120', country: 'US' }),
  getEasyPostClient: () => ({
    Address: { createAndVerify: async (a) => a },
    Shipment: { create: async () => nextShipment }
  })
});

const createRouter = require(path.join('..', '..', 'routes', 'checkout-shipping'));

function callRates(body) {
  const router = createRouter((req, res, next) => next());
  const layer = router.stack.find((l) => l.route && l.route.path === '/rates');
  const handlers = layer.route.stack.map((s) => s.handle);
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); }
    };
    handlers[0]({ body }, res, () => handlers[1]({ body }, res));
  });
}

const rate = (id, carrier, service, price) => ({ id, carrier, service, rate: String(price), delivery_days: 5 });

test('Mexico lists every returned service, cheapest to most expensive', async () => {
  const errors = console.warn; console.warn = () => {};
  nextShipment = { id: 'shp_1', messages: [], rates: [
    rate('a', 'FedEx', 'INTERNATIONAL_PRIORITY', 88.1),
    rate('b', 'USPS', 'PriorityMailInternational', 61.2),
    rate('c', 'USPS', 'FirstClassPackageInternationalService', 24.5),
    rate('d', 'FedEx', 'INTERNATIONAL_ECONOMY', 70),
    rate('e', 'USPS', 'PriorityMailInternational', 64.0) // pricier duplicate is dropped
  ] };
  const { status, body } = await callRates({
    country: 'MX', address: 'Av. Reforma 222', city: 'Ciudad de México', state: 'CMX', zip: '06600'
  });
  console.warn = errors;
  assert.equal(status, 200);
  assert.equal(body.zone, 'international');
  assert.deepEqual(body.rates.map((r) => [r.canonicalService, r.price]), [
    ['USPS First Class Package International Service', 24.5],
    ['USPS Priority Mail International', 61.2],
    ['FedEx International Economy', 70],
    ['FedEx International Priority', 88.1]
  ]);
});

test('U.S. still lists only USPS in the usual order', async () => {
  nextShipment = { id: 'shp_2', rates: [
    rate('a', 'USPS', 'Express', 34.95),
    rate('b', 'FedEx', 'FEDEX_GROUND', 8),
    rate('c', 'USPS', 'GroundAdvantage', 9.95),
    rate('d', 'USPS', 'Priority', 14.95)
  ] };
  const { status, body } = await callRates({
    country: 'US', address: '123 Main St', city: 'Elgin', state: 'IL', zip: '60120'
  });
  assert.equal(status, 200);
  assert.deepEqual(body.rates.map((r) => r.canonicalService),
    ['USPS Ground Advantage', 'USPS Priority Mail', 'USPS Priority Mail Express']);
});

test('no rates abroad gives a clear message instead of an empty list', async () => {
  const warn = console.warn; let logged = null; console.warn = (...a) => { logged = a; };
  nextShipment = { id: 'shp_3', rates: [], messages: [{ carrier: 'FedEx', type: 'rate_error', message: 'account not enabled' }] };
  const { status, body } = await callRates({
    country: 'NL', address: 'Damrak 1', city: 'Amsterdam', zip: '1012 AB'
  });
  console.warn = warn;
  assert.equal(status, 422);
  assert.equal(body.code, 'no-shipping-options');
  assert.match(body.error, /international shipping option/);
  assert.ok(logged && JSON.stringify(logged).includes('account not enabled'), 'carrier reason is logged');
});

test('countries outside the shipping list are refused before any carrier call', async () => {
  nextShipment = null; // a carrier call would crash on this
  for (const country of ['DK', 'DE', 'CA']) {
    const { status, body } = await callRates({ country, address: '1 Main St', city: 'Town', state: 'ON', zip: '12345' });
    assert.equal(status, 422, country);
    assert.equal(body.code, 'country-not-served');
  }
});

test('the six shipping countries are all accepted', async () => {
  const { isShippableCountry, DEFAULT_INTERNATIONAL_COUNTRIES } = require('../../services/easypost');
  assert.deepEqual(DEFAULT_INTERNATIONAL_COUNTRIES, ['MX', 'CO', 'NL', 'GB', 'AE', 'TH']);
  for (const c of ['US', 'United States', 'MX', 'CO', 'NL', 'GB', 'AE', 'TH']) assert.equal(isShippableCountry(c, {}), true, c);
  for (const c of ['DK', 'CA', 'DE', 'FR', 'AU']) assert.equal(isShippableCountry(c, {}), false, c);
  assert.equal(isShippableCountry('DK', { SHIPPING_COUNTRIES: 'dk, nl' }), true, 'env override');
  assert.equal(isShippableCountry('MX', { SHIPPING_COUNTRIES: 'dk, nl' }), false, 'env override replaces the list');
});
