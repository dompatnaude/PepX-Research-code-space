'use strict';

// U.S. orders ship USPS only; international orders ship FedEx International
// only. These cover the pieces of services/easypost.js that decide that.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyCheckoutService,
  classifyFedexInternationalService,
  checkoutServiceOrder,
  toCountryCode,
  isDomesticCountry,
  validateDestinationAddress,
  buildCustomsInfo,
  buildShipmentCreateParams
} = require('../../services/easypost');

test('country names and codes normalise to ISO alpha-2', () => {
  assert.equal(toCountryCode('United States'), 'US');
  assert.equal(toCountryCode('usa'), 'US');
  assert.equal(toCountryCode(''), 'US');
  assert.equal(toCountryCode('dk'), 'DK');
  assert.equal(isDomesticCountry('United States'), true);
  assert.equal(isDomesticCountry('DK'), false);
});

test('U.S. destinations only accept USPS services', () => {
  assert.equal(classifyCheckoutService('USPS', 'GroundAdvantage', 'US'), 'USPS Ground Advantage');
  assert.equal(classifyCheckoutService('USPS', 'Priority', 'US'), 'USPS Priority Mail');
  assert.equal(classifyCheckoutService('USPS', 'Express', 'US'), 'USPS Priority Mail Express');
  assert.equal(classifyCheckoutService('FedEx', 'FEDEX_GROUND', 'US'), null);
  assert.equal(classifyCheckoutService('FedEx', 'INTERNATIONAL_ECONOMY', 'US'), null);
});

test('international destinations accept every carrier service, with readable names', () => {
  assert.equal(classifyCheckoutService('USPS', 'PriorityMailInternational', 'DK'), 'USPS Priority Mail International');
  assert.equal(classifyCheckoutService('USPS', 'FirstClassPackageInternationalService', 'DK'), 'USPS First Class Package International Service');
  assert.equal(classifyCheckoutService('USPS', 'ExpressMailInternational', 'DK'), 'USPS Express Mail International');
  assert.equal(classifyCheckoutService('FedEx', 'FEDEX_INTERNATIONAL_PRIORITY_EXPRESS', 'DK'), 'FedEx International Priority Express');
  assert.equal(classifyCheckoutService('DHLExpress', 'ExpressWorldwideNonDoc', 'DK'), 'DHL Express Worldwide Non Doc');
  assert.equal(classifyCheckoutService('UPSDAP', 'UPSSaver', 'DK'), 'UPS Saver');
  assert.equal(classifyCheckoutService('', '', 'DK'), null);
});

test('FedEx International services keep their familiar names', () => {
  assert.equal(classifyCheckoutService('FedEx', 'FEDEX_INTERNATIONAL_CONNECT_PLUS', 'DK'), 'FedEx International Connect Plus');
  assert.equal(classifyCheckoutService('FedEx', 'INTERNATIONAL_ECONOMY', 'DK'), 'FedEx International Economy');
  assert.equal(classifyCheckoutService('FedExDefault', 'INTERNATIONAL_PRIORITY', 'DK'), 'FedEx International Priority');
  assert.equal(classifyCheckoutService('FedEx', 'FEDEX_INTERNATIONAL_PRIORITY', 'DK'), 'FedEx International Priority');
  assert.equal(classifyFedexInternationalService('FedEx', 'FEDEX_INTERNATIONAL_PRIORITY_EXPRESS'), null);
  assert.equal(classifyFedexInternationalService('FedEx', 'INTERNATIONAL_PRIORITY_FREIGHT'), null);
  assert.equal(classifyFedexInternationalService('FedEx', 'INTERNATIONAL_FIRST'), null);
});

test('service display order is cheapest tier first per zone', () => {
  assert.deepEqual(checkoutServiceOrder('US'), ['USPS Ground Advantage', 'USPS Priority Mail', 'USPS Priority Mail Express']);
  assert.deepEqual(checkoutServiceOrder('DK'), ['FedEx International Connect Plus', 'FedEx International Economy', 'FedEx International Priority']);
});

test('a Danish address needs no state; a U.S. address still does', () => {
  const dk = validateDestinationAddress({
    shipping_address: 'Østerbrogade 12, 3. th.', shipping_city: 'København Ø',
    shipping_state: '', shipping_zip: '2100', shipping_country: 'DK'
  });
  assert.equal(dk.country, 'DK');
  assert.throws(() => validateDestinationAddress({
    shipping_address: '123 Main St', shipping_city: 'Elgin', shipping_state: '', shipping_zip: '60120', shipping_country: 'US'
  }), /state/);
});

test('postal-code-free countries do not require a postal code', () => {
  const hk = validateDestinationAddress({
    shipping_address: '1 Queen\'s Road', shipping_city: 'Central', shipping_state: '', shipping_zip: '', shipping_country: 'HK'
  });
  assert.equal(hk.country, 'HK');
});

test('customs declaration lists each order line and splits the weight', () => {
  const customs = buildCustomsInfo({
    items: [
      { name: 'MOTS-C', variant_name: '10mg', price: '48.75', quantity: 2 },
      { name: 'BPC-157', variant_name: '5mg', price: '30.00', quantity: 1 }
    ],
    packageInfo: { weight_oz: 9 },
    env: { SHIP_FROM_NAME: 'PX Research LLC' }
  });
  assert.equal(customs.customs_certify, true);
  assert.equal(customs.customs_signer, 'PX Research LLC');
  assert.equal(customs.customs_items.length, 2);
  assert.equal(customs.customs_items[0].description, 'MOTS-C 10mg');
  assert.equal(customs.customs_items[0].value, 97.5);
  assert.equal(customs.customs_items[0].weight, 6);
  assert.equal(customs.customs_items[1].weight, 3);
  assert.equal(customs.customs_items[0].origin_country, 'US');
});

test('customs description and HS code can be set from env', () => {
  const customs = buildCustomsInfo({
    items: [{ name: 'MOTS-C', price: 10, quantity: 1 }],
    packageInfo: { weight_oz: 8 },
    env: { CUSTOMS_ITEM_DESCRIPTION: 'Laboratory research material', CUSTOMS_HS_TARIFF_NUMBER: '293799' }
  });
  assert.equal(customs.customs_items[0].description, 'Laboratory research material');
  assert.equal(customs.customs_items[0].hs_tariff_number, '293799');
});

test('shipment params only carry customs when given', () => {
  const pkg = { weight_oz: 8, length: 8, width: 5, height: 3 };
  assert.equal('customs_info' in buildShipmentCreateParams({ toAddress: {}, fromAddress: {}, packageInfo: pkg }), false);
  const withCustoms = buildShipmentCreateParams({ toAddress: {}, fromAddress: {}, packageInfo: pkg, customsInfo: { customs_items: [] } });
  assert.deepEqual(withCustoms.customs_info, { customs_items: [] });
});
