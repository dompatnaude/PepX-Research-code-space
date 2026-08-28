'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// The billing block handed to the payment frame is validated by the processor during
// buyer verification. A full country name or a ZIP+4 is rejected there, and the SDK
// reports that as a CARD error — so the buyer sees "enter a valid card number" and no
// charge is ever attempted. These assertions exist because that shipped once.
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'checkout-card.js'), 'utf8');
const grab = (re) => { const m = src.match(re); assert.ok(m, 'helper not found: ' + re); return m[0]; };
const toIso2  = new Function('v', grab(/const ISO2 = \{[\s\S]*?\};/) + grab(/const toIso2 = \(v\) => \{[\s\S]*?\};/) + 'return toIso2(v);');
const toPostal = new Function('v', grab(/const toPostal = \(v\) => \{[\s\S]*?\};/) + 'return toPostal(v);');

test('country is always ISO-3166 alpha-2', () => {
  for (const input of ['United States', 'united states of america', 'USA', 'us', 'US', '', null, undefined, '  United States  ']) {
    const out = toIso2(input);
    assert.match(out, /^[A-Z]{2}$/, `"${input}" produced "${out}"`);
  }
  assert.strictEqual(toIso2('Canada'), 'CA');
  assert.strictEqual(toIso2('gb'), 'GB');
});

test('US postal is reduced to the 5 digits AVS checks', () => {
  assert.strictEqual(toPostal('60439-8768'), '60439');
  assert.strictEqual(toPostal('60439'), '60439');
  assert.strictEqual(toPostal(' 60120 '), '60120');
});

test('a non-US postal code is left untouched', () => {
  assert.strictEqual(toPostal('SW1A 1AA'), 'SW1A 1AA');
  assert.strictEqual(toPostal('M5V 3L9'), 'M5V 3L9');
});

test('the session route actually uses both helpers', () => {
  assert.match(src, /country:\s*toIso2\(/, 'country is not normalised in the payload');
  assert.match(src, /postcode:\s*toPostal\(/, 'postcode is not normalised in the payload');
});

test('the raw stored values are never sent directly', () => {
  assert.ok(!/country:\s*order\.shipping_country/.test(src), 'raw shipping_country is being sent');
  assert.ok(!/postcode:\s*order\.shipping_zip/.test(src), 'raw shipping_zip is being sent');
});
