'use strict';

function normalizeBaseUrl(value) {
  if (!value) return '';
  return String(value).trim().replace(/\/$/, '');
}

function resolveGoogleCallbackUrl(env = process.env) {
  if (env.GOOGLE_CALLBACK_URL) {
    return String(env.GOOGLE_CALLBACK_URL).trim();
  }

  const publicBaseUrl = normalizeBaseUrl(env.PUBLIC_BASE_URL || env.APP_URL || env.NEXT_PUBLIC_BASE_URL);
  if (publicBaseUrl) {
    return publicBaseUrl + '/auth/google/callback';
  }

  return '';
}

module.exports = {
  resolveGoogleCallbackUrl
};
