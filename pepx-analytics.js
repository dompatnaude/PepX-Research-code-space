/*
 * pepx-analytics.js
 * Vercel Web Analytics for the storefront (plain-HTML setup: no npm package
 * or bundler needed). Load this before /_vercel/insights/script.js.
 *
 * Privacy: query strings and #fragments are stripped from every page view,
 * because some URLs here carry order numbers, reset tokens or email links.
 * Visitors can opt out with localStorage.setItem('va-disable', '1').
 */
(function () {
  'use strict';
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.va('beforeSend', function (event) {
    try {
      if (window.localStorage && localStorage.getItem('va-disable')) return null;
    } catch (e) { /* storage blocked: keep tracking */ }
    try {
      var url = new URL(event.url);
      url.search = '';
      url.hash = '';
      return Object.assign({}, event, { url: url.toString() });
    } catch (e) {
      return event;
    }
  });
})();
