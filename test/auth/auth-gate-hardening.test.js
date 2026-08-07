'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isAgeConfirmed, asyncHandler } = require('../../services/auth-validation');

test('isAgeConfirmed accepts only the JSON boolean true', () => {
  assert.equal(isAgeConfirmed(true), true);
});

test('isAgeConfirmed rejects truthy alternatives and non-booleans', () => {
  const rejected = ['true', 'false', 1, 0, '1', '0', 'on', 'yes', 'ok',
    {}, [], { confirmed: true }, ['true'], null, undefined, NaN, false];
  for (const v of rejected) {
    assert.equal(isAgeConfirmed(v), false, 'should reject: ' + JSON.stringify(v));
  }
});

test('asyncHandler forwards a rejected DB operation to next() without crashing', async () => {
  // Simulate a route whose DB call rejects.
  const dbError = new Error('simulated DB failure');
  const handler = asyncHandler(async () => {
    await Promise.reject(dbError);
  });
  let forwarded = null;
  const req = {};
  const res = {};
  const next = (err) => { forwarded = err; };
  // Must not throw synchronously.
  assert.doesNotThrow(() => handler(req, res, next));
  // Give the microtask queue a tick to settle the rejection.
  await new Promise((r) => setImmediate(r));
  assert.equal(forwarded, dbError);
});

test('asyncHandler does not call next when handler resolves', async () => {
  let called = false;
  const handler = asyncHandler(async (req, res) => { res.sent = true; });
  const res = {};
  const next = () => { called = true; };
  handler({}, res, next);
  await new Promise((r) => setImmediate(r));
  assert.equal(called, false);
  assert.equal(res.sent, true);
});

test('server process survives many rejected async handler invocations', async () => {
  // Repeatedly trigger rejections to prove none escape as unhandledRejection.
  let count = 0;
  const handler = asyncHandler(async () => { throw new Error('boom'); });
  for (let i = 0; i < 25; i++) {
    handler({}, {}, () => { count++; });
  }
  await new Promise((r) => setImmediate(r));
  assert.equal(count, 25);
});
