/**
 * Signed-out homepage behaviour.
 *
 * script.js (the storefront bundle) is served to signed-in visitors only, so on
 * the public homepage nothing wires up the FAQ accordion, the mobile menu or the
 * account button. This file restores exactly those three interactions, copied
 * from script.js, and nothing else: no product, cart, checkout, account or API
 * behaviour, and no network requests.
 *
 * server.js adds this <script> tag only to the signed-out variant of index.html,
 * so it is never loaded alongside script.js and no handler can be bound twice.
 * The class check below is a second guard on the same guarantee.
 */
(function () {
  'use strict';

  if (!document.documentElement.classList.contains('pepx-public')) return;

  // FAQ accordion (mirrors script.js).
  document.addEventListener('click', function (e) {
    var q = e.target.closest('.q');
    if (q) q.parentElement.classList.toggle('open');
  });

  // Mobile navigation. Below 900px styles.css hides nav.menu unless it carries
  // the `open` class, so without this the menu cannot be opened at all.
  var toggle = document.getElementById('mobileMenuToggle');
  var nav = document.getElementById('site-menu');
  if (toggle && nav) {
    toggle.setAttribute('aria-expanded', 'false');

    toggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', function (e) {
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  }

  // The account icon is driven by script.js for signed-in visitors. For everyone
  // else it is inert, so point it at the login page.
  var accountBtn = document.getElementById('accountBtn');
  if (accountBtn) {
    accountBtn.addEventListener('click', function () {
      window.location.href = '/login.html';
    });
  }
})();
