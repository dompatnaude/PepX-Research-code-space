'use strict';

// Strict age-confirmation check for registration.
// Only the JSON boolean `true` is accepted. Truthy alternatives such as
// the strings 'true'/'1'/'on', the number 1, objects, or arrays are rejected
// so that the 21+ confirmation cannot be satisfied by accident or by a
// loosely-typed client payload.
function isAgeConfirmed(value) {
  return value === true;
}

// Wraps an async Express route handler so that a rejected promise is
// forwarded to the centralized error handler via `next(err)` instead of
// becoming an unhandledRejection that can crash the Node process.
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { isAgeConfirmed, asyncHandler };
