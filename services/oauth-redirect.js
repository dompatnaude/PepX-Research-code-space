'use strict';

function sanitizeReturnPath(value) {
  var raw = String(value || '').trim();
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  if (raw.includes('://')) return null;
  return raw;
}

function withAuthQuery(pathname, authValue) {
  var safePath = sanitizeReturnPath(pathname) || '/index.html';
  var split = safePath.split('?');
  var base = split[0];
  var queryString = split[1] || '';
  var params = new URLSearchParams(queryString);
  params.set('auth', authValue);
  var query = params.toString();
  return query ? (base + '?' + query) : base;
}

module.exports = {
  sanitizeReturnPath,
  withAuthQuery
};
